// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.15;

import "./Lender.sol";

/**
 * @title Sapling Pool
 * @notice Provides deposit, withdrawal, and staking functionality. 
 * @dev Extends Lender. 
 *      Extends ManagedLendingPool by inheritance.
 */
contract SaplingPool is Lender {

    using SafeMath for uint256;
    
    /**
     * @notice Creates a Sapling pool.
     * @param _poolToken ERC20 token contract address to be used as the pool issued token.
     * @param _liquidityToken ERC20 token contract address to be used as main pool liquid currency.
     * @param _governance Address of the protocol governance.
     * @param _protocol Address of a wallet to accumulate protocol earnings.
     * @param _manager Address of the pool manager.
     */
    constructor(address _poolToken, address _liquidityToken, address _governance, address _protocol, address _manager) Lender(_poolToken, _liquidityToken, _governance, _protocol, _manager) {
    }

    /**
     * @notice Deposit tokens to the pool.
     * @dev Deposit amount must be non zero and not exceed amountDepositable().
     *      An appropriate spend limit must be present at the token contract.
     *      Caller must not be any of: manager, protocol, current borrower.
     * @param amount Token amount to deposit.
     */
    function deposit(uint256 amount) external onlyUser whenLendingNotPaused whenNotClosed notPaused {
        enterPool(amount);
    }

    /**
     * @notice Withdraw tokens from the pool.
     * @dev Withdrawal amount must be non zero and not exceed amountWithdrawable().
     *      Caller must not be any of: manager, protocol, current borrower.
     * @param amount token amount to withdraw.
     */
    function withdraw(uint256 amount) external notPaused {
        require(msg.sender != manager);
        exitPool(amount);
    }

    /**
     * @notice Check wallet's token balance in the pool. Balance includes acquired earnings. 
     * @param wallet Address of the wallet to check the balance of.
     * @return Token balance of the wallet in this pool.
     */
    function balanceOf(address wallet) public view returns (uint256) {
        if (wallet != manager) {
            return sharesToTokens(IPoolToken(poolToken).balanceOf(wallet) + lockedShares[wallet]);
        } else {
            return sharesToTokens(lockedShares[manager]);
        }
    }

    /**
     * @notice Check wallet's unlocked token balance in the pool. Balance includes acquired earnings. 
     * @param wallet Address of the wallet to check the unlocked balance of.
     * @return Unlocked token balance of the wallet in this pool.
     */
    function unlockedBalanceOf(address wallet) public view returns (uint256) {
        return sharesToTokens(IPoolToken(poolToken).balanceOf(wallet));
    }

    /**
     * @notice Check token amount depositable by lenders at this time.
     * @dev Return value depends on the pool state rather than caller's balance.
     * @return Max amount of tokens depositable to the pool.
     */
    function amountDepositable() external view returns (uint256) {
        if (poolFundsLimit <= poolFunds || isLendingPaused || isClosed || isPaused()) {
            return 0;
        }

        return poolFundsLimit.sub(poolFunds);
    }

    /**
     * @notice Check token amount withdrawable by the caller at this time.
     * @dev Return value depends on the callers balance, and is limited by pool liquidity.
     * @param wallet Address of the wallet to check the withdrawable balance of.
     * @return Max amount of tokens withdrawable by msg.sender.
     */
    function amountWithdrawable(address wallet) external view returns (uint256) {
        return isPaused() ? 0 : Math.min(poolLiquidity, unlockedBalanceOf(wallet));
    }

    /**
     * @notice Stake tokens into the pool.
     * @dev Caller must be the manager.
     *      Stake amount must be non zero.
     *      An appropriate spend limit must be present at the token contract.
     * @param amount Token amount to stake.
     */
    function stake(uint256 amount) external onlyManager whenLendingNotPaused whenNotClosed notPaused {
        require(amount > 0, "SaplingPool: stake amount is 0");

        uint256 shares = enterPool(amount);
        stakedShares = stakedShares.add(shares);
        updatePoolLimit();
    }
    
    /**
     * @notice Unstake tokens from the pool.
     * @dev Caller must be the manager.
     *      Unstake amount must be non zero and not exceed amountUnstakable().
     * @param amount Token amount to unstake.
     */
    function unstake(uint256 amount) external onlyManager whenLendingNotPaused notPaused {
        require(amount > 0, "SaplingPool: unstake amount is 0");
        require(amount <= amountUnstakable(), "SaplingPool: requested amount is not available to be unstaked");

        uint256 shares = tokensToShares(amount);
        stakedShares = stakedShares.sub(shares);
        updatePoolLimit();
        exitPool(amount);
    }

    /**
     * @notice Check the manager's staked token balance in the pool.
     * @return Token balance of the manager's stake.
     */
    function balanceStaked() public view returns (uint256) {
        return balanceOf(manager);
    }

    /**
     * @notice Check token amount unstakable by the manager at this time.
     * @dev Return value depends on the manager's stake balance, and is limited by pool liquidity.
     * @return Max amount of tokens unstakable by the manager.
     */
    function amountUnstakable() public view returns (uint256) {
        if (isLendingPaused || isPaused()) {
            return 0;
        }

        uint256 lenderShares = totalPoolShares.sub(stakedShares);
        uint256 lockedStakeShares = Math.mulDiv(lenderShares, targetStakePercent, ONE_HUNDRED_PERCENT - targetStakePercent);

        return Math.min(poolLiquidity, sharesToTokens(stakedShares.sub(lockedStakeShares)));
    }

    /**
     * @notice Estimated lender APY given the current pool state.
     * @return Estimated lender APY
     */
    function currentLenderAPY() external view returns (uint16) {
        return lenderAPY(borrowedFunds);
    }

    /**
     * @notice Projected lender APY given the current pool state and a specific borrow rate.
     * @dev represent borrowRate in contract specific percentage format
     * @param borrowRate percentage of pool funds projected to be borrowed annually
     * @return Projected lender APY
     */
    function projectedLenderAPY(uint16 borrowRate) external view returns (uint16) {
        require(borrowRate <= ONE_HUNDRED_PERCENT, "SaplingPool: Invalid borrow rate. Borrow rate must be less than or equal to 100%");
        return lenderAPY(Math.mulDiv(poolFunds, borrowRate, ONE_HUNDRED_PERCENT));
    }


    /**
     * @notice Lender APY given the current pool state and a specific borrowed funds amount.
     * @dev represent borrowRate in contract specific percentage format
     * @param _borrowedFunds pool funds to be borrowed annually
     * @return Lender APY
     */
    function lenderAPY(uint256 _borrowedFunds) private view returns (uint16) {
        if (poolFunds == 0 || _borrowedFunds == 0) {
            return 0;
        }
        
        // pool APY
        uint256 poolAPY = Math.mulDiv(weightedAvgLoanAPR, _borrowedFunds, poolFunds);
        
        // protocol APY
        uint256 protocolAPY = Math.mulDiv(poolAPY, protocolEarningPercent, ONE_HUNDRED_PERCENT);
        
        uint256 remainingAPY = poolAPY.sub(protocolAPY);

        // manager withdrawableAPY
        uint256 currentStakePercent = Math.mulDiv(stakedShares, ONE_HUNDRED_PERCENT, totalPoolShares);
        uint256 managerEarningsPercent = Math.mulDiv(currentStakePercent, managerExcessLeverageComponent, ONE_HUNDRED_PERCENT);
        uint256 managerWithdrawableAPY = Math.mulDiv(remainingAPY, managerEarningsPercent, managerEarningsPercent + ONE_HUNDRED_PERCENT);

        return uint16(remainingAPY.sub(managerWithdrawableAPY));
    }
}
