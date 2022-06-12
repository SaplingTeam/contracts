// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./FractionalMath.sol";
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
     * @notice Request a liquidity amount to be kept for withdrawal when available.
     * @dev amount must be greater an 0 and less than or equal to (unlockedBalanceOf(msg.sender) + requestedLiquidity[msg.sender])
     *      Caller must be a valid lender.
     *      Requested liquidity quota will be used on withdrawals.
     * @param amount liquidity amount requested
     */
    function requestLiquidity(uint256 amount) external validLender {
        require(amount > 0 && amount + requestedLiquidity[msg.sender] <= unlockedBalanceOf(msg.sender), "SaplingPool: Invalid amount.");

        totalRequestedLiquidity = totalRequestedLiquidity.add(amount);
        requestedLiquidity[msg.sender] = requestedLiquidity[msg.sender].add(amount);
    }

    /**
     * @notice Cancel previously requested withdrawal liquidity amount
     * @dev amount must be greater an 0 and less than or equal to requestedLiquidity[msg.sender]
     * @param amount liquidity amount requested
     */
    function cancelLiquidityRequest(uint256 amount) external {
        require(amount > 0 && amount <= requestedLiquidity[msg.sender], "SaplingPool: Invalid amount.");

        totalRequestedLiquidity = totalRequestedLiquidity.sub(amount);
        requestedLiquidity[msg.sender] = requestedLiquidity[msg.sender].sub(amount);
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
     * @notice Check wallet's unlocked token balance in the pool. Balance includes acquired earnings. 
     * @param wallet Address of the wallet to check the unlocked balance of.
     * @return Unlocked token balance of the wallet in this pool.
     */
    function unlockedBalanceOf(address wallet) public view returns (uint256) {
        return sharesToTokens(poolShares[wallet].sub(lockedShares[wallet]));
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
     * @notice Withdraw funds of an approved loan.
     * @dev Caller must be the borrower. 
     *      The loan must be in APPROVED status.
     * @param loanId id of the loan to withdraw funds of. 
     */
    function borrow(uint256 loanId) external loanInStatus(loanId, LoanStatus.APPROVED) whenLendingNotPaused whenNotClosed notPaused {
        Loan storage loan = loans[loanId];
        require(loan.borrower == msg.sender, "SaplingPool: Withdrawal requester is not the borrower on this loan.");

        borrowerStats[loan.borrower].countCurrentApproved--;
        borrowerStats[loan.borrower].countOutstanding++;
        borrowerStats[loan.borrower].amountBorrowed = borrowerStats[loan.borrower].amountBorrowed.add(loan.amount);
        
        loan.status = LoanStatus.OUTSTANDING;
        loanFundsPendingWithdrawal = loanFundsPendingWithdrawal.sub(loan.amount);

        tokenBalance = tokenBalance.sub(loan.amount);
        bool success = IERC20(token).transfer(msg.sender, loan.amount);
        require(success);
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
        uint256 lockedStakeShares = FractionalMath.mulDiv(lenderShares, targetStakePercent, ONE_HUNDRED_PERCENT - targetStakePercent);

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
        return lenderAPY(FractionalMath.mulDiv(poolFunds, borrowRate, ONE_HUNDRED_PERCENT));
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
        uint256 poolAPY = FractionalMath.mulDiv(weightedAvgLoanAPR, _borrowedFunds, poolFunds);
        
        // protocol APY
        uint256 protocolAPY = FractionalMath.mulDiv(poolAPY, protocolEarningPercent, ONE_HUNDRED_PERCENT);
        
        // manager withdrawableAPY
        uint256 currentStakePercent = FractionalMath.mulDiv(stakedShares, ONE_HUNDRED_PERCENT, totalPoolShares);
        uint256 managerEarningsPercent = FractionalMath.mulDiv(currentStakePercent, managerExcessLeverageComponent, ONE_HUNDRED_PERCENT);
        uint256 managerWithdrawableAPY = managerEarningsPercent.sub(FractionalMath.mulDiv(managerEarningsPercent, ONE_HUNDRED_PERCENT - protocolEarningPercent, ONE_HUNDRED_PERCENT));

        return uint16(poolAPY.sub(protocolAPY).sub(managerWithdrawableAPY));
    }
}
