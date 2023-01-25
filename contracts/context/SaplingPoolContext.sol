// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../interfaces/IPoolContext.sol";
import "../interfaces/IPoolToken.sol";
import "./SaplingStakerContext.sol";
import "../lib/SaplingMath.sol";
import "../lib/WithdrawalRequestQueue.sol";

/**
 * @title Sapling Pool Context
 * @notice Provides common pool functionality with lender deposits, first loss capital staking, and reward distribution.
 */
abstract contract SaplingPoolContext is IPoolContext, SaplingStakerContext, ReentrancyGuardUpgradeable {

    using WithdrawalRequestQueue for WithdrawalRequestQueue.LinkedMap;

    /// Tokens configuration
    TokenConfig public tokenConfig;

    /// Pool configuration
    PoolConfig public config;

    /// Key pool balances
    PoolBalance public balances;

    /// Per user withdrawal request states
    mapping (address => WithdrawalRequestState) public withdrawalRequestStates;

    /// Withdrawal request queue
    WithdrawalRequestQueue.LinkedMap private withdrawalQueue;

    modifier noWithdrawalRequests() {
        require(
            withdrawalRequestStates[msg.sender].countOutstanding == 0,
            "SaplingPoolContext: deposit not allowed while having withdrawal requests"
        );
        _;
    }

    /**
     * @notice Creates a SaplingPoolContext.
     * @dev Addresses must not be 0.
     * @param _poolToken ERC20 token contract address to be used as the pool issued token.
     * @param _liquidityToken ERC20 token contract address to be used as pool liquidity currency.
     * @param _accessControl Access control contract
     * @param _stakerRole Staker role
     */
    function __SaplingPoolContext_init(
        address _poolToken,
        address _liquidityToken,
        address _accessControl,
        bytes32 _stakerRole
    )
        internal
        onlyInitializing
    {
        __SaplingStakerContext_init(_accessControl, _stakerRole);

        /*
            Additional check for single init:
                do not init again if a non-zero value is present in the values yet to be initialized.
        */
        assert(tokenConfig.poolToken == address(0) && tokenConfig.liquidityToken == address(0));

        // validate parameters
        require(_poolToken != address(0), "SaplingPoolContext: pool token address is not set");
        require(_liquidityToken != address(0), "SaplingPoolContext: liquidity token address is not set");

        uint8 decimals = IERC20Metadata(_liquidityToken).decimals();
        tokenConfig = TokenConfig({
            poolToken: _poolToken,
            liquidityToken: _liquidityToken,
            decimals: decimals
        });

        assert(totalPoolTokenSupply() == 0);

        uint16 _protocolFeePercent = uint16(
            MathUpgradeable.min(uint16(20 * 10 ** SaplingMath.PERCENT_DECIMALS), SaplingMath.MAX_PROTOCOL_FEE_PERCENT)
        );
        uint16 _maxEarnFactor = uint16(1000 * 10 ** SaplingMath.PERCENT_DECIMALS);

        config = PoolConfig({
            minWithdrawalRequestAmount: 10 * 10 ** tokenConfig.decimals,
            targetStakePercent: uint16(10 * 10 ** SaplingMath.PERCENT_DECIMALS),
            protocolFeePercent: _protocolFeePercent,
            stakerEarnFactorMax: _maxEarnFactor,

            targetLiquidityPercent: 0,
            stakerEarnFactor: uint16(MathUpgradeable.min(150 * 10 ** SaplingMath.PERCENT_DECIMALS, _maxEarnFactor)),

            weightedAvgStrategyAPR: 0,
            exitFeePercent: SaplingMath.HUNDRED_PERCENT / 200 // 0.5%
        });
    }

    /**
     * @notice Set the target stake percent for the pool.
     * @dev _targetStakePercent must be greater than 0 and less than or equal to SaplingMath.HUNDRED_PERCENT.
     *      Caller must be the governance.
     * @param _targetStakePercent New target stake percent.
     */
    function setTargetStakePercent(uint16 _targetStakePercent) external onlyRole(SaplingRoles.GOVERNANCE_ROLE) {
        require(
            0 < _targetStakePercent && _targetStakePercent <= SaplingMath.HUNDRED_PERCENT,
            "SaplingPoolContext: target stake percent is out of bounds"
        );

        uint16 prevValue = config.targetStakePercent;
        config.targetStakePercent = _targetStakePercent;

        emit TargetStakePercentSet(prevValue, config.targetStakePercent);
    }

    /**
     * @notice Set the target liquidity percent for the pool.
     * @dev _targetLiquidityPercent must be inclusively between 0 and SaplingMath.HUNDRED_PERCENT.
     *      Caller must be the staker.
     * @param _targetLiquidityPercent new target liquidity percent.
     */
    function setTargetLiquidityPercent(uint16 _targetLiquidityPercent) external onlyRole(poolStakerRole) {
        require(
            0 <= _targetLiquidityPercent && _targetLiquidityPercent <= SaplingMath.HUNDRED_PERCENT,
            "SaplingPoolContext: target liquidity percent is out of bounds"
        );

        uint16 prevValue = config.targetLiquidityPercent;
        config.targetLiquidityPercent = _targetLiquidityPercent;

        emit TargetLiquidityPercentSet(prevValue, config.targetLiquidityPercent);
    }

    /**
     * @notice Set the protocol earning percent for the pool.
     * @dev _protocolEarningPercent must be inclusively between 0 and MAX_PROTOCOL_FEE_PERCENT.
     *      Caller must be the governance.
     * @param _protocolEarningPercent new protocol earning percent.
     */
    function setProtocolEarningPercent(uint16 _protocolEarningPercent) external onlyRole(SaplingRoles.GOVERNANCE_ROLE) {
        require(
            0 <= _protocolEarningPercent && _protocolEarningPercent <= SaplingMath.MAX_PROTOCOL_FEE_PERCENT,
            "SaplingPoolContext: protocol earning percent is out of bounds"
        );

        uint16 prevValue = config.protocolFeePercent;
        config.protocolFeePercent = _protocolEarningPercent;

        emit ProtocolFeePercentSet(prevValue, config.protocolFeePercent);
    }

    /**
     * @notice Set an upper bound for the staker earn factor percent.
     * @dev _stakerEarnFactorMax must be greater than or equal to SaplingMath.HUNDRED_PERCENT. If the current
     *      earn factor is greater than the new maximum, then the current earn factor is set to the new maximum.
     *      Caller must be the governance.
     * @param _stakerEarnFactorMax new maximum for staker earn factor.
     */
    function setStakerEarnFactorMax(uint16 _stakerEarnFactorMax) external onlyRole(SaplingRoles.GOVERNANCE_ROLE) {
        require(
            SaplingMath.HUNDRED_PERCENT <= _stakerEarnFactorMax,
            "SaplingPoolContext: _stakerEarnFactorMax is out of bounds"
        );

        uint16 prevValue = config.stakerEarnFactorMax;
        config.stakerEarnFactorMax = _stakerEarnFactorMax;

        if (config.stakerEarnFactor > config.stakerEarnFactorMax) {
            uint16 prevEarnFactor = config.stakerEarnFactor;
            config.stakerEarnFactor = config.stakerEarnFactorMax;

            emit StakerEarnFactorSet(prevEarnFactor, config.stakerEarnFactor);
        }

        emit StakerEarnFactorMaxSet(prevValue, config.stakerEarnFactorMax);
    }

    /**
     * @notice Set the staker earn factor percent.
     * @dev _stakerEarnFactor must be inclusively between SaplingMath.HUNDRED_PERCENT and stakerEarnFactorMax.
     *      Caller must be the staker.
     * @param _stakerEarnFactor new staker earn factor.
     */
    function setStakerEarnFactor(uint16 _stakerEarnFactor) external onlyRole(poolStakerRole) {
        require(
            SaplingMath.HUNDRED_PERCENT <= _stakerEarnFactor && _stakerEarnFactor <= config.stakerEarnFactorMax,
            "SaplingPoolContext: _stakerEarnFactor is out of bounds"
        );

        uint16 prevValue = config.stakerEarnFactor;
        config.stakerEarnFactor = _stakerEarnFactor;

        emit StakerEarnFactorSet(prevValue, config.stakerEarnFactor);
    }

    /**
     * @notice Deposit funds to the pool. Depositing funds will mint an equivalent amount of pool
     *         tokens and transfer it to the caller. Exact exchange rate depends on the current pool state.
     * @dev Deposit amount must be non zero and not exceed amountDepositable().
     *      An appropriate spend limit must be present at the token contract.
     *      Caller must not be a user.
     *      Caller must not have any outstanding withdrawal requests.
     * @param amount Liquidity token amount to deposit.
     */
    function deposit(uint256 amount) external onlyUser noWithdrawalRequests whenNotPaused whenNotClosed {
        uint256 sharesMinted = enter(amount);

        emit FundsDeposited(msg.sender, amount, sharesMinted);
    }

    /**
     * @notice Withdraw funds from the pool. Withdrawals redeem equivalent amount of the caller's pool tokens
     *         by burning the tokens in question.
     *         Exact exchange rate depends on the current pool state.
     * @dev Withdrawal amount must be non zero and not exceed amountWithdrawable().
     * @param amount Liquidity token amount to withdraw.
     */
    function withdraw(uint256 amount) public onlyUser whenNotPaused {
        uint256 sharesBurned = exit(amount);

        emit FundsWithdrawn(msg.sender, amount, sharesBurned);
    }

    /** 
     * @notice Request funds for withdrawal by locking in pool shares.
     * @param shares Amount of pool tokens to lock. 
     */
    function requestWithdrawal(uint256 shares) external onlyUser whenNotPaused {

        uint256 amount = sharesToFunds(shares);
        uint256 outstandingRequestsAmount = sharesToFunds(balances.withdrawalRequestedShares);

        //// base case
        if (
            balances.rawLiquidity >= outstandingRequestsAmount 
            && amount <= balances.rawLiquidity - outstandingRequestsAmount
        )
        {
            withdraw(amount);
            return;
        }

        //// check
        require(
            shares <= IERC20(tokenConfig.poolToken).balanceOf(msg.sender), 
            "SaplingPoolContext: insufficient balance"
        );

        require(amount >= config.minWithdrawalRequestAmount, "SaplingPoolContext: amount is less than the minimum");

        WithdrawalRequestState storage state = withdrawalRequestStates[msg.sender];
        require(state.countOutstanding <= 3, "SaplingPoolContext: too many outstanding withdrawal requests");

        //// effect

        uint256 requestId = withdrawalQueue.queue(msg.sender, shares);

        state.countOutstanding++;
        state.sharesLocked += shares;
        balances.withdrawalRequestedShares += shares;

        //// interactions

        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(tokenConfig.poolToken),
            msg.sender,
            address(this),
            shares
        );

        emit WithdrawalRequested(requestId, msg.sender, shares);
    }

    /**
     * @notice Update a withdrawal request.
     * @dev Existing request funds can only be decreased. Minimum request amount rule must be maintained.
     *      Requested position must belong to the caller.
     * @param id ID of the withdrawal request to update.
     * @param newShareAmount New total pool token amount to be locked in the request.
     */
    function updateWithdrawalRequest(uint256 id, uint256 newShareAmount) external whenNotPaused {
        //// check        
        WithdrawalRequestQueue.Request memory request = withdrawalQueue.get(id);
        require(request.wallet == msg.sender, "SaplingPoolContext: unauthorized");
        require(
            newShareAmount < request.sharesLocked && sharesToFunds(newShareAmount) >= config.minWithdrawalRequestAmount,
            "SaplingPoolContext: invalid share amount"
        );

        //// effect
        
        uint256 shareDifference = withdrawalQueue.update(id, newShareAmount);
        uint256 prevLockedShares = withdrawalRequestStates[request.wallet].sharesLocked;

        withdrawalRequestStates[request.wallet].sharesLocked -= shareDifference;
        balances.withdrawalRequestedShares -= shareDifference;


        //// interactions

        // unlock shares
        SafeERC20Upgradeable.safeTransfer(
            IERC20Upgradeable(tokenConfig.poolToken),
            request.wallet,
            shareDifference
        );

        emit WithdrawalRequestUpdated(
            id,
            request.wallet,
            prevLockedShares,
            withdrawalRequestStates[request.wallet].sharesLocked
        );
    }

    /**
     * @notice Cancel a withdrawal request.
     * @dev Requested position must belong to the caller.
     * @param id ID of the withdrawal request to update.
     */
    function cancelWithdrawalRequest(uint256 id) external whenNotPaused {

        //// check
        WithdrawalRequestQueue.Request memory request = withdrawalQueue.get(id);
        require(request.wallet == msg.sender, "SaplingPoolContext: unauthorized");

        //// effect
        withdrawalQueue.remove(id);
        
        WithdrawalRequestState storage state = withdrawalRequestStates[request.wallet];
        state.countOutstanding--;
        state.sharesLocked -= request.sharesLocked;
        balances.withdrawalRequestedShares -= request.sharesLocked;

        //// interactions

        // unlock shares
        SafeERC20Upgradeable.safeTransfer(
            IERC20Upgradeable(tokenConfig.poolToken),
            request.wallet,
            request.sharesLocked
        );

        emit WithdrawalRequestCancelled(id, request.wallet);
    }

    /**
     * @notice Fulfill withdrawal requests in batch if liquidity requirements are met.
     * @dev Anyone can trigger fulfillment of a withdrawal request.
     *      
     *      It is in the interest of the pool to keep the withdrawal requests fulfilled as soon as there is
     *      liquidity, as unfulfilled requests will keep earning yield but lock liquidity once the liquidity comes in.
     *
     * @param count The number of positions to fulfill starting from the head of the queue. 
     *        If the count is greater than queue length, then the entire queue is processed.
     */
    function fulfillWithdrawalRequests(uint256 count) external whenNotPaused nonReentrant {

        uint256 remaining = MathUpgradeable.min(count, withdrawalQueue.length());
        while (remaining > 0) {
            fulfillNextWithdrawalRequest();
            remaining--;
        }
    }

    /**
     * @notice Fulfill a single arbitrary withdrawal request.
     * @dev Anyone can trigger fulfillment of a withdrawal request. Fulfillment is on demand, and other requests 
     *      in the queue are not processed but their liquidity requirements have to be met.
     *
     * @param id ID of the withdrawal request to fulfill
     */
    function fulfillWithdrawalRequestById(uint256 id) external whenNotPaused nonReentrant {
        require(
            balances.rawLiquidity >= sharesToFunds(balances.withdrawalRequestedShares),
            "SaplingPoolContext: insufficient liquidity for arbitrary request fulfillment"
        );

        fulfillWithdrawalRequest(id);
    }

    /**
     * @dev Fulfill a single withdrawal request at the top of the queue.
     */
    function fulfillNextWithdrawalRequest() private {
        fulfillWithdrawalRequest(withdrawalQueue.headID());
    }

    /**
     * @dev Fulfill a single withdrawal request by id.
     * @param id ID of the withdrawal request to fulfill
     */
    function fulfillWithdrawalRequest(uint256 id) private {

        //// check

        WithdrawalRequestQueue.Request memory request = withdrawalQueue.get(id);
        
        uint256 requestedAmount = sharesToFunds(request.sharesLocked);
        uint256 transferAmount = requestedAmount - MathUpgradeable.mulDiv(
            requestedAmount, 
            config.exitFeePercent, 
            SaplingMath.HUNDRED_PERCENT
        );

        require(balances.rawLiquidity >= transferAmount, "SaplingPolContext: insufficient liquidity");

        //// effect

        withdrawalQueue.remove(request.id);

        WithdrawalRequestState storage state = withdrawalRequestStates[request.wallet];
        state.countOutstanding--;
        state.sharesLocked -= request.sharesLocked;

        balances.rawLiquidity -= transferAmount;

        //// interactions

        // burn shares
        IPoolToken(tokenConfig.poolToken).burn(address(this), request.sharesLocked);

        SafeERC20Upgradeable.safeTransfer(
            IERC20Upgradeable(tokenConfig.liquidityToken),
            request.wallet,
            transferAmount
        );

        emit WithdrawalRequestFulfilled(request.id, request.wallet, transferAmount);
    }

    /**
     * @notice Stake funds into the pool. Staking funds will mint an equivalent amount of pool
     *         tokens and lock them in the pool. Exact exchange rate depends on the current pool state.
     * @dev Caller must be the staker.
     *      Stake amount must be non zero.
     *      An appropriate spend limit must be present at the token contract.
     * @param amount Liquidity token amount to stake.
     */
    function stake(uint256 amount) external onlyRole(poolStakerRole) whenNotPaused whenNotClosed {
        require(amount > 0, "SaplingPoolContext: stake amount is 0");

        uint256 sharesMinted = enter(amount);

        emit FundsStaked(msg.sender, amount, sharesMinted);
    }

    /**
     * @notice Unstake funds from the pool. Unstaking redeems equivalent amount of the caller's pool tokens
     *         locked in the pool by burning the tokens in question.
     * @dev Caller must be the staker.
     *      Unstake amount must be non zero and not exceed amountUnstakable().
     * @param amount Liquidity token amount to unstake.
     */
    function unstake(uint256 amount) external onlyRole(poolStakerRole) whenNotPaused {
        require(amount > 0, "SaplingPoolContext: unstake amount is 0");
        require(amount <= amountUnstakable(), "SaplingPoolContext: requested amount is not available for unstaking");

        uint256 sharesBurned = exit(amount);

        emit FundsUnstaked(msg.sender, amount, sharesBurned);
    }

    /**
     * @notice Withdraw protocol revenue.
     * @dev Revenue is in liquidity tokens.
     *      Caller must have the treasury role.
     * @param amount Liquidity token amount to withdraw.
     */
    function collectProtocolRevenue(uint256 amount) external onlyRole(SaplingRoles.TREASURY_ROLE) whenNotPaused {
        //// check

        require(amount > 0, "SaplingPoolContext: invalid amount");
        require(amount <= balances.protocolRevenue, "SaplingPoolContext: insufficient balance");

        //// effect

        balances.protocolRevenue -= amount;
        balances.tokenBalance -= amount;

        //// interactions

        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(tokenConfig.liquidityToken), msg.sender, amount);

        emit ProtocolRevenueCollected(msg.sender, amount);
    }

    /**
     * @notice Withdraw staker's leveraged earnings.
     * @dev Revenue is in liquidity tokens. 
     *      Caller must have the staker role.
     * @param amount Liquidity token amount to withdraw.
     */
    function collectStakerEarnings(uint256 amount) external onlyRole(poolStakerRole) whenNotPaused {
        //// check
        
        require(amount > 0, "SaplingPoolContext: invalid amount");
        require(amount <= balances.stakerEarnings, "SaplingPoolContext: insufficient balance");

        //// effect

        balances.stakerEarnings -= amount;
        balances.tokenBalance -= amount;

        //// interactions

        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(tokenConfig.liquidityToken), msg.sender, amount);

        emit StakerEarningsCollected(msg.sender, amount);
    }

    /**
     * @notice Check liquidity token amount depositable by lenders at this time.
     * @dev Return value depends on the pool state rather than caller's balance.
     * @return Max amount of tokens depositable to the pool.
     */
    function amountDepositable() external view returns (uint256) {
        uint256 poolLimit = poolFundsLimit();
        if (poolLimit <= balances.poolFunds || closed() || paused()) {
            return 0;
        }

        return poolLimit - balances.poolFunds;
    }

    /**
     * @notice Check liquidity token amount withdrawable by the caller at this time.
     * @dev Return value depends on the callers balance, and is limited by pool liquidity.
     * @param wallet Address of the wallet to check the withdrawable balance of.
     * @return Max amount of liquidity tokens withdrawable by the caller.
     */
    function amountWithdrawable(address wallet) external view returns (uint256) {
        return paused() ? 0 : MathUpgradeable.min(freeLenderLiquidity(), balanceOf(wallet));
    }

    /**
     * @notice Accessor
     * @return Current length of the withdrawal queue
     */
    function withdrawalRequestsLength() external view returns (uint256) {
        return withdrawalQueue.length();
    }

    /**
     * @notice Accessor
     * @param i Index of the withdrawal request in the queue
     * @return WithdrawalRequestQueue object
     */
    function getWithdrawalRequestAt(uint256 i) external view returns (WithdrawalRequestQueue.Request memory) {
        return withdrawalQueue.at(i);
    }

    /**
     * @notice Accessor
     * @param id ID of the withdrawal request
     * @return WithdrawalRequestQueue object
     */
    function getWithdrawalRequestById(uint256 id) external view returns (WithdrawalRequestQueue.Request memory) {
        return withdrawalQueue.get(id);
    }

    /**
     * @notice Check the staker's balance in the pool.
     * @return Liquidity token balance of the staker's stake.
     */
    function balanceStaked() external view returns (uint256) {
        return sharesToFunds(balances.stakedShares);
    }

    /**
     * @notice Estimate APY breakdown given the current pool state.
     * @return Current APY breakdown
     */
    function currentAPY() external view returns (APYBreakdown memory) {
        return projectedAPYBreakdown(
            totalPoolTokenSupply(),
            balances.stakedShares,
            balances.poolFunds,
            balances.strategizedFunds, 
            config.weightedAvgStrategyAPR,
            config.protocolFeePercent,
            config.stakerEarnFactor
        );
    }

    /**
     * @notice Projected APY breakdown given the current pool state and a specific strategy rate and an average apr.
     * @dev Represent percentage parameter values in contract specific format.
     * @param strategyRate Percentage of pool funds projected to be used in strategies.
     * @param _avgStrategyAPR Weighted average APR of the funds in strategies.
     * @return Projected APY breakdown
     */
    function simpleProjectedAPY(
        uint16 strategyRate, 
        uint256 _avgStrategyAPR) external view returns (APYBreakdown memory) {
        require(strategyRate <= SaplingMath.HUNDRED_PERCENT, "SaplingPoolContext: invalid borrow rate");

        return projectedAPYBreakdown(
            totalPoolTokenSupply(),
            balances.stakedShares,
            balances.poolFunds,
            MathUpgradeable.mulDiv(balances.poolFunds, strategyRate, SaplingMath.HUNDRED_PERCENT), 
            _avgStrategyAPR,
            config.protocolFeePercent,
            config.stakerEarnFactor
        );
    }

    /**
     * @notice Check wallet's funds balance in the pool. This balance includes deposited balance and acquired
     *         yield. This balance does not included staked balance, balance locked in withdrawal requests,
     *         leveraged earnings or protocol revenue.
     * @param wallet Address of the wallet to check the balance of.
     * @return Liquidity token balance of the wallet in this pool.
     */
    function balanceOf(address wallet) public view returns (uint256) {
        return sharesToFunds(IPoolToken(tokenConfig.poolToken).balanceOf(wallet));
    }

    /**
     * @notice Check funds amount unstakable by the staker at this time.
     * @dev Return value depends on the staked balance and targetStakePercent, and is limited by pool
     *      liquidity.
     * @return Max amount of liquidity tokens unstakable by the staker.
     */
    function amountUnstakable() public view returns (uint256) {
        uint256 totalPoolShares = totalPoolTokenSupply();
        uint256 withdrawableLiquidity = freeLenderLiquidity();

        if (
            paused() ||
            config.targetStakePercent >= SaplingMath.HUNDRED_PERCENT && totalPoolShares > balances.stakedShares
        ) {
            return 0;
        } else if (closed() || totalPoolShares == balances.stakedShares) {
            return MathUpgradeable.min(withdrawableLiquidity, sharesToFunds(balances.stakedShares));
        }

        uint256 lenderShares = totalPoolShares - balances.stakedShares;
        uint256 lockedStakeShares = MathUpgradeable.mulDiv(
            lenderShares,
            config.targetStakePercent,
            SaplingMath.HUNDRED_PERCENT - config.targetStakePercent
        );

        return MathUpgradeable.min(
            withdrawableLiquidity,
            sharesToFunds(balances.stakedShares - lockedStakeShares)
        );
    }

    /**
     * @notice Current liquidity available for pool strategies such as lending or investing.
     * @return Strategy liquidity amount.
     */
    function strategyLiquidity() public view returns (uint256) {

        uint256 lenderAllocatedLiquidity = MathUpgradeable.max(
            sharesToFunds(balances.withdrawalRequestedShares),
            MathUpgradeable.mulDiv(
                balances.poolFunds,
                config.targetLiquidityPercent,
                SaplingMath.HUNDRED_PERCENT
            )
        );

        return balances.rawLiquidity > lenderAllocatedLiquidity 
            ? balances.rawLiquidity - lenderAllocatedLiquidity 
            : 0;
    }

    /**
     * @notice Accessor
     * @return Shared liquidity available for all lenders to withdraw immediately without queuing withdrawal requests.
     */
    function freeLenderLiquidity() public view returns (uint256) {

        uint256 withdrawalRequestedLiqudity = sharesToFunds(balances.withdrawalRequestedShares);

        return balances.rawLiquidity > withdrawalRequestedLiqudity 
            ? balances.rawLiquidity - withdrawalRequestedLiqudity
            : 0;
    }

    /**
     * @dev View pool funds limit based on the staked funds.
     * @return MAX amount of liquidity tokens allowed in the pool based on staked assets
     */
    function poolFundsLimit() public view returns (uint256) {
        return sharesToFunds(
            MathUpgradeable.mulDiv(balances.stakedShares, SaplingMath.HUNDRED_PERCENT, config.targetStakePercent)
        );
    }

    /**
     * @dev Internal method to enter the pool with a liquidity token amount.
     *      With the exception of the staker's call, amount must not exceed amountDepositable().
     *      If the caller is the staker, entered funds are considered staked.
     *      New pool tokens are minted in a way that will not influence the current share price.
     * @dev Shares are equivalent to pool tokens and are represented by them.
     * @param amount Liquidity token amount to add to the pool on behalf of the caller.
     * @return Amount of pool tokens minted and allocated to the caller.
     */
    function enter(uint256 amount) internal nonReentrant returns (uint256) {
        //// check

        require(amount > 0, "SaplingPoolContext: pool deposit amount is 0");

        bool isStaker = hasRole(poolStakerRole, msg.sender);

        // non-stakers must follow pool size limit
        if (!isStaker) {
            uint256 poolLimit = poolFundsLimit();
            require(
                poolLimit > balances.poolFunds && amount <= poolLimit - balances.poolFunds,
                "SaplingPoolContext: deposit amount is over the remaining pool limit"
            );
        }
        
        //// effect

        uint256 shares = fundsToShares(amount);

        balances.tokenBalance += amount;
        balances.rawLiquidity += amount;
        balances.poolFunds += amount;

        if (isStaker) {
            // this is a staking entry

            balances.stakedShares += shares;
        }

        //// interactions

        // charge msg.sender
        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(tokenConfig.liquidityToken),
            msg.sender,
            address(this),
            amount
        );

        // mint shares
        IPoolToken(tokenConfig.poolToken).mint(!isStaker ? msg.sender : address(this), shares);

        return shares;
    }

    /**
     * @dev Internal method to exit the pool with funds amount.
     *      Amount must not exceed amountWithdrawable() for non-stakers, and amountUnstakable() for the staker.
     *      If the caller is the staker, exited funds are considered unstaked.
     *      Pool tokens are burned in a way that will not influence the current share price.
     * @dev Shares are equivalent to pool tokens and are represented by them.
     * @param amount Liquidity token amount to withdraw from the pool on behalf of the caller.
     * @return Amount of pool tokens burned and taken from the caller.
     */
    function exit(uint256 amount) internal nonReentrant returns (uint256) {
        //// check
        require(amount > 0, "SaplingPoolContext: pool withdrawal amount is 0");
        require(balances.rawLiquidity >= amount, "SaplingPoolContext: insufficient liquidity");

        uint256 shares = fundsToShares(amount);

        bool isStaker = hasRole(poolStakerRole, msg.sender);

        require(
            isStaker
                ? shares <= balances.stakedShares
                : shares <= IERC20(tokenConfig.poolToken).balanceOf(msg.sender),
            "SaplingPoolContext: insufficient balance"
        );

        //// effect

        if (isStaker) {
            balances.stakedShares -= shares;
        }

        uint256 transferAmount = amount - MathUpgradeable.mulDiv(
            amount, 
            config.exitFeePercent, 
            SaplingMath.HUNDRED_PERCENT
        );

        balances.poolFunds -= transferAmount;
        balances.rawLiquidity -= transferAmount;
        balances.tokenBalance -= transferAmount;

        //// interactions

        // burn shares
        IPoolToken(tokenConfig.poolToken).burn(isStaker ? address(this) : msg.sender, shares);

        // transfer funds
        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(tokenConfig.liquidityToken), msg.sender, transferAmount);

        return shares;
    }

    /**
     * @dev Internal method to update the weighted average loan apr based on the amount reduced by and an apr.
     * @param amountReducedBy amount by which the funds committed into strategy were reduced, due to repayment or loss
     * @param apr annual percentage rate of the strategy
     */
    function updateAvgStrategyApr(uint256 amountReducedBy, uint16 apr) internal {
        if (balances.strategizedFunds > 0) {
            config.weightedAvgStrategyAPR = uint16(
                ((balances.strategizedFunds + amountReducedBy) * config.weightedAvgStrategyAPR - amountReducedBy * apr)
                / balances.strategizedFunds
            );
        } else {
            config.weightedAvgStrategyAPR = 0;
        }
    }

    /**
     * @notice Get funds value of shares.
     * @param shares Pool token amount
     * @return Converted liquidity token value
     */
    function sharesToFunds(uint256 shares) public view returns (uint256) {
        if (shares == 0 || balances.poolFunds == 0) {
             return 0;
        }

        return MathUpgradeable.mulDiv(shares, balances.poolFunds, totalPoolTokenSupply());
    }

    /**
     * @notice Get share value of funds.
     * @param funds Amount of liquidity tokens
     * @return Converted pool token value
     */
    function fundsToShares(uint256 funds) public view returns (uint256) {
        uint256 totalPoolTokens = totalPoolTokenSupply();

        if (totalPoolTokens == 0) {
            // a pool with no positions
            return funds;
        } else if (balances.poolFunds == 0) {
            /*
                Handle failed pool case, where: poolFunds == 0, but totalPoolShares > 0
                To minimize loss for the new depositor, assume the total value of existing shares is the minimum
                possible nonzero integer, which is 1.

                Simplify (tokens * totalPoolShares) / 1 as tokens * totalPoolShares.
            */
            return funds * totalPoolTokens;
        }

        return MathUpgradeable.mulDiv(funds, totalPoolTokens, balances.poolFunds);
    }

    /**
     * @notice Check if the pool has sufficient stake
     * @return True if the staked funds provide at least a minimum ratio to the pool funds, False otherwise.
     */
    function maintainsStakeRatio() public view returns (bool) {
        return balances.stakedShares >= MathUpgradeable.mulDiv(
                    totalPoolTokenSupply(),
                    config.targetStakePercent,
                    SaplingMath.HUNDRED_PERCENT
                );
    }

    // contract compiled size optimization accessor
    function totalPoolTokenSupply() internal view returns (uint256) {
        return IERC20(tokenConfig.poolToken).totalSupply();
    }

    /**
     * @notice APY breakdown given a specified scenario.
     * @dev Represent percentage parameter values in contract specific format.
     * @param _totalPoolTokens total pull token supply. For current conditions use: totalPoolTokenSupply()
     * @param _stakedTokens the amount of staked pool tokens. Must be less than or equal to _totalPoolTokens. 
     *                      For current conditions use: balances.stakedShares
     * @param _poolFunds liquidity token funds that make up the pool. For current conditions use: balances.poolFunds
     * @param _strategizedFunds part of the pool funds that will remain in strategies. Must be less than or equal to 
     *                          _poolFunds. For current conditions use: balances.strategizedFunds
     * @param _avgStrategyAPR Weighted average APR of the funds in strategies. 
     *                        For current conditions use: config.weightedAvgStrategyAPR
     * @param _protocolFeePercent Protocol fee parameter. Must be less than 100%.
     *                            For current conditions use: config.protocolFeePercent
     * @param _stakerEarnFactor Staker's earn factor. Must be greater than or equal to 1x (100%).
     *                           For current conditions use: config.stakerEarnFactor
     * @return Pool apy with protocol, staker, and lender components broken down.
     */
    function projectedAPYBreakdown(
        uint256 _totalPoolTokens,
        uint256 _stakedTokens,
        uint256 _poolFunds,
        uint256 _strategizedFunds,
        uint256 _avgStrategyAPR,
        uint16 _protocolFeePercent,
        uint16 _stakerEarnFactor
    ) 
        public 
        pure 
        returns (APYBreakdown memory) 
    {
        require(_stakedTokens <= _totalPoolTokens, "SaplingPoolContext: invalid parameter _stakedTokens");
        require(_strategizedFunds <= _poolFunds, "SaplingPoolContext: invalid parameter _strategizedFunds");
        require(
            _protocolFeePercent <= SaplingMath.HUNDRED_PERCENT,
            "SaplingPoolContext: invalid parameter _protocolFeePercent"
        );
        require(
            _stakerEarnFactor >= SaplingMath.HUNDRED_PERCENT,
            "SaplingPoolContext: invalid parameter _stakerEarnFactor"
        );

        if (_poolFunds == 0 || _strategizedFunds == 0 || _avgStrategyAPR == 0) {
            return APYBreakdown(0, 0, 0, 0);
        }

        // pool APY
        uint256 poolAPY = MathUpgradeable.mulDiv(_avgStrategyAPR, _strategizedFunds, _poolFunds);

        // protocol APY
        uint256 protocolAPY = MathUpgradeable.mulDiv(poolAPY, _protocolFeePercent, SaplingMath.HUNDRED_PERCENT);

        uint256 remainingAPY = poolAPY - protocolAPY;

        // staker withdrawableAPY
        uint256 currentStakePercent = MathUpgradeable.mulDiv(
            _stakedTokens,
            SaplingMath.HUNDRED_PERCENT,
            _totalPoolTokens
        );
        uint256 stakerEarningsPercent = MathUpgradeable.mulDiv(
            currentStakePercent,
            _stakerEarnFactor - SaplingMath.HUNDRED_PERCENT,
            SaplingMath.HUNDRED_PERCENT);

        uint256 stakerWithdrawableAPY = MathUpgradeable.mulDiv(
            remainingAPY,
            stakerEarningsPercent,
            stakerEarningsPercent + SaplingMath.HUNDRED_PERCENT
        );

        uint256 _lenderAPY = remainingAPY - stakerWithdrawableAPY;

        return APYBreakdown({
            totalPoolAPY: uint16(poolAPY), 
            protocolRevenueComponent: uint16(protocolAPY), 
            stakerEarningsComponent: uint16(stakerWithdrawableAPY),
            lenderComponent: uint16(_lenderAPY)
        });
    }

    /**
     * @dev Implementation of the abstract hook in SaplingManagedContext.
     *      Pool can be close when no funds remain committed to strategies.
     */
    function canClose() internal view override returns (bool) {
        return balances.strategizedFunds == 0;
    }

    /**
     * @dev Slots reserved for future state variables
     */
    uint256[30] private __gap;
}
