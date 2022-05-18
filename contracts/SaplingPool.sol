// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
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
     * @param _token ERC20 token contract address to be used as main pool liquid currency.
     * @param _governance Address of the protocol governance.
     * @param _protocol Address of a wallet to accumulate protocol earnings.
     * @param _minAmount Minimum amount to be borrowed per loan.
     */
    constructor(address _token, address _governance, address _protocol, uint256 _minAmount) Lender(_token, _governance, _protocol, _minAmount) {
    }

    /**
     * @notice Deposit tokens to the pool.
     * @dev Deposit amount must be non zero and not exceed amountDepositable().
     *      An appropriate spend limit must be present at the token contract.
     *      Caller must not be any of: manager, protocol, current borrower.
     * @param amount Token amount to deposit.
     */
    function deposit(uint256 amount) external validLender whenLendingNotPaused whenNotClosed notPaused {
        enterPool(amount);
    }

    /**
     * @notice Withdraw tokens from the pool.
     * @dev Withdrawal amount must be non zero and not exceed amountWithdrawable().
     *      Caller must not be any of: manager, protocol, current borrower.
     * @param amount token amount to withdraw.
     */
    function withdraw(uint256 amount) external notPaused {
        exitPool(amount);
    }

    /**
     * @notice Check wallet's token balance in the pool. Balance includes acquired earnings. 
     * @param wallet Address of the wallet to check the balance of.
     * @return Token balance of the wallet in this pool.
     */
    function balanceOf(address wallet) public view returns (uint256) {
        return sharesToTokens(poolShares[wallet]);
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
        return isPaused() ? 0 : Math.min(poolLiquidity, balanceOf(wallet).sub(sharesToTokens(lockedShares[wallet])));
    }

    /**
     * @notice Withdraw funds of an approved loan.
     * @dev Caller must be the borrower. 
     *      The loan must be in APPROVED status.
     * @param loanId id of the loan to withdraw funds of. 
     */
    function borrow(uint256 loanId) external loanInStatus(loanId, LoanStatus.APPROVED) whenLendingNotPaused whenNotClosed notPaused {
        Loan storage loan = loans[loanId];
        require(loan.borrower == msg.sender, "SaplingPool: Withdrawal requester is not the borrower on this loan.");

        borrowerStats[loan.borrower].countCurrentApproved--;
        loan.status = LoanStatus.FUNDS_WITHDRAWN;
        decreaseLoanFunds(msg.sender, loan.amount);

        tokenBalance = tokenBalance.sub(loan.amount);
        bool success = IERC20(token).transfer(msg.sender, loan.amount);
        if(!success) {
            revert();
        }
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
        lockedShares[msg.sender] = lockedShares[msg.sender].add(shares);
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
        lockedShares[msg.sender] = lockedShares[msg.sender].sub(shares);
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
        uint256 lockedStakeShares = multiplyByFraction(lenderShares, targetStakePercent, ONE_HUNDRED_PERCENT - targetStakePercent);

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
        return lenderAPY(multiplyByFraction(poolFunds, borrowRate, ONE_HUNDRED_PERCENT));
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

        uint256 weightedLoanAPR = defaultAPR; //TODO maintain weighted average APR for outstanding loans
        
        // pool APY
        uint256 poolAPY = multiplyByFraction(weightedLoanAPR, _borrowedFunds, poolFunds);
        
        // protocol APY
        uint256 protocolAPY = multiplyByFraction(poolAPY, protocolEarningPercent, ONE_HUNDRED_PERCENT);
        
        // manager withdrawableAPY
        uint256 currentStakePercent = multiplyByFraction(stakedShares, ONE_HUNDRED_PERCENT, totalPoolShares);
        uint256 managerEarningsPercent = multiplyByFraction(currentStakePercent, managerExcessLeverageComponent, ONE_HUNDRED_PERCENT);
        uint256 managerWithdrawableAPY = managerEarningsPercent.sub(multiplyByFraction(managerEarningsPercent, ONE_HUNDRED_PERCENT - protocolEarningPercent, ONE_HUNDRED_PERCENT));

        return uint16(poolAPY.sub(protocolAPY).sub(managerWithdrawableAPY));
    }
}
