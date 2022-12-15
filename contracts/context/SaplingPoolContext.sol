// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../interfaces/IPoolContext.sol";
import "../interfaces/IPoolToken.sol";
import "./SaplingManagerContext.sol";
import "../lib/SaplingMath.sol";
import "../lib/WithdrawalRequestQueue.sol";

/**
 * @title Sapling Pool Context
 * @notice Provides common pool functionality with lender deposits, manager's first loss capital staking,
 *         and reward distribution.
 */
abstract contract SaplingPoolContext is IPoolContext, SaplingManagerContext, ReentrancyGuardUpgradeable {

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
     * @param _managerRole Manager role
     */
    function __SaplingPoolContext_init(
        address _poolToken,
        address _liquidityToken,
        address _accessControl,
        bytes32 _managerRole
    )
        internal
        onlyInitializing
    {
        __SaplingManagerContext_init(_accessControl, _managerRole);

        /*
            Additional check for single init:
                do not init again if a non-zero value is present in the values yet to be initialized.
        */
        assert(tokenConfig.poolToken == address(0) && tokenConfig.liquidityToken == address(0));

        require(_poolToken != address(0), "SaplingPoolContext: pool token address is not set");
        require(_liquidityToken != address(0), "SaplingPoolContext: liquidity token address is not set");

        uint8 decimals = IERC20Metadata(_liquidityToken).decimals();
        tokenConfig = TokenConfig({
            poolToken: _poolToken,
            liquidityToken: _liquidityToken,
            decimals: decimals
        });

        assert(totalPoolTokenSupply() == 0);
        
        uint16 _maxProtocolFeePercent = uint16(10 * 10 ** SaplingMath.PERCENT_DECIMALS);
        uint16 _maxEarnFactor = uint16(1000 * 10 ** SaplingMath.PERCENT_DECIMALS);

        config = PoolConfig({
            weightedAvgStrategyAPR: 0,
            exitFeePercent: SaplingMath.HUNDRED_PERCENT / 200, // 0.5%
            maxProtocolFeePercent: _maxProtocolFeePercent,

            minWithdrawalRequestAmount: 10 * 10 ** tokenConfig.decimals,
            targetStakePercent: uint16(10 * 10 ** SaplingMath.PERCENT_DECIMALS),
            protocolFeePercent: _maxProtocolFeePercent,
            managerEarnFactorMax: _maxEarnFactor,

            targetLiquidityPercent: 0,
            managerEarnFactor: uint16(MathUpgradeable.min(150 * 10 ** SaplingMath.PERCENT_DECIMALS, _maxEarnFactor))
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
     *      Caller must be the manager.
     * @param _targetLiquidityPercent new target liquidity percent.
     */
    function setTargetLiquidityPercent(uint16 _targetLiquidityPercent) external onlyRole(poolManagerRole) {
        require(
            0 <= _targetLiquidityPercent && _targetLiquidityPercent <= SaplingMath.HUNDRED_PERCENT,
            "SaplingPoolContext: target liquidity percent is out of bounds"
        );

        uint16 prevValue = config.targetLiquidityPercent;
        config.targetLiquidityPercent = _targetLiquidityPercent;

        emit TargetLiqudityPercentSet(prevValue, config.targetLiquidityPercent);
    }

    /**
     * @notice Set the protocol earning percent for the pool.
     * @dev _protocolEarningPercent must be inclusively between 0 and maxProtocolFeePercent.
     *      Caller must be the governance.
     * @param _protocolEarningPercent new protocol earning percent.
     */
    function setProtocolEarningPercent(uint16 _protocolEarningPercent) external onlyRole(SaplingRoles.GOVERNANCE_ROLE) {
        require(
            0 <= _protocolEarningPercent && _protocolEarningPercent <= config.maxProtocolFeePercent,
            "SaplingPoolContext: protocol earning percent is out of bounds"
        );

        uint16 prevValue = config.protocolFeePercent;
        config.protocolFeePercent = _protocolEarningPercent;

        emit ProtocolFeePercentSet(prevValue, config.protocolFeePercent);
    }

    /**
     * @notice Set an upper bound for the manager's earn factor percent.
     * @dev _managerEarnFactorMax must be greater than or equal to SaplingMath.HUNDRED_PERCENT. If the current 
     *      earn factor is greater than the new maximum, then the current earn factor is set to the new maximum.
     *      Caller must be the governance.
     * @param _managerEarnFactorMax new maximum for manager's earn factor.
     */
    function setManagerEarnFactorMax(uint16 _managerEarnFactorMax) external onlyRole(SaplingRoles.GOVERNANCE_ROLE) {
        require(
            SaplingMath.HUNDRED_PERCENT <= _managerEarnFactorMax,
            "SaplingPoolContext: _managerEarnFactorMax is out of bounds"
        );

        uint16 prevValue = config.managerEarnFactorMax;
        config.managerEarnFactorMax = _managerEarnFactorMax;

        if (config.managerEarnFactor > config.managerEarnFactorMax) {
            uint16 prevEarnFactor = config.managerEarnFactor;
            config.managerEarnFactor = config.managerEarnFactorMax;

            emit ManagerEarnFactorSet(prevEarnFactor, config.managerEarnFactor);
        }

        emit ManagerEarnFactorMaxSet(prevValue, config.managerEarnFactorMax);
    }

    /**
     * @notice Set the manager's earn factor percent.
     * @dev _managerEarnFactorMax must be inclusively between SaplingMath.HUNDRED_PERCENT and managerEarnFactorMax.
     *      Caller must be the manager.
     * @param _managerEarnFactor new manager's earn factor.
     */
    function setManagerEarnFactor(uint16 _managerEarnFactor) external onlyRole(poolManagerRole) {
        require(
            SaplingMath.HUNDRED_PERCENT <= _managerEarnFactor && _managerEarnFactor <= config.managerEarnFactorMax,
            "SaplingPoolContext: _managerEarnFactor is out of bounds"
        );

        uint16 prevValue = config.managerEarnFactor;
        config.managerEarnFactor = _managerEarnFactor;

        emit ManagerEarnFactorSet(prevValue, config.managerEarnFactor);
    }

    /**
     * @notice Deposit liquidity tokens to the pool. Depositing liquidity tokens will mint an equivalent amount of pool
     *         tokens and transfer it to the caller. Exact exchange rate depends on the current pool state.
     * @dev Deposit amount must be non zero and not exceed amountDepositable().
     *      An appropriate spend limit must be present at the token contract.
     *      Caller must not be any of: manager, protocol, governance.
     *      Caller must not have any outstanding withdrawal requests.
     * @param amount Liquidity token amount to deposit.
     */
    function deposit(uint256 amount) external onlyUser noWithdrawalRequests whenNotPaused whenNotClosed {
        uint256 sharesMinted = enter(amount);

        emit FundsDeposited(msg.sender, amount, sharesMinted);
    }

    /**
     * @notice Withdraw liquidity tokens from the pool. Withdrawals redeem equivalent amount of the caller's pool tokens
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
     * @notice Request funds for withdrawal by locking in pool tokens.
     * @param shares Amount of pool tokens to lock. 
     */
    function requestWithdrawal(uint256 shares) external onlyUser whenNotPaused {

        uint256 amount = tokensToFunds(shares);
        uint256 outstandingRequestsAmount = tokensToFunds(balances.withdrawalRequestedShares);

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

        //TODO update if the last position belongs to the user, else queue

        withdrawalQueue.queue(msg.sender, shares);

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

        //TODO event
    }

    /**
     * @notice Update a withdrawal request.
     * @dev Existing request funds can only be decreseased. Minimum request amount rule must be maintained. 
     *      Requested position must belong to the caller.
     * @param id ID of the withdrawal request to update.
     * @param newShareAmount New total pool token amount to be locked in the request.
     */
    function updateWithdrawalRequest(uint256 id, uint256 newShareAmount) external whenNotPaused {
        //// check        
        WithdrawalRequestQueue.Request memory request = withdrawalQueue.get(id);
        require(request.wallet == msg.sender, "SaplingPoolContext: unauthorized");
        require(
            newShareAmount < request.sharesLocked && tokensToFunds(newShareAmount) >= config.minWithdrawalRequestAmount,
            "SaplingPoolContext: invalid share amount"
        );

        //// effect
        
        uint256 shareDifference = withdrawalQueue.update(id, newShareAmount);

        withdrawalRequestStates[request.wallet].sharesLocked -= shareDifference;
        balances.withdrawalRequestedShares -= shareDifference;


        //// interactions

        // unlock shares
        SafeERC20Upgradeable.safeTransfer(
            IERC20Upgradeable(tokenConfig.poolToken),
            request.wallet,
            shareDifference
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
    }

    /**
     * @notice Fulfill withdrawal request in a batch if liquidity requirements are met.
     * @dev Anyone can trigger fulfillment of a withdrawal request. Fulfillment is on demand, and requests ahead 
     *      in the queue do not have to be fulfilled as long as their liquidity requirements met.
     *      
     *      It is in the interest of the pool manager to keep the withdrawal requests fulfilled as soon as there is 
     *      liquidity, as unfulfilled requests will keep earning yield but lock liquidity once the liquidity comes in.
     *
     * @param count The number of positions to fulfill starting from the head of the queue. 
     *        If the count is greater than queue length, then the entrire queue is processed.
     */
    function fulfillWithdrawalRequests(uint256 count) external whenNotPaused nonReentrant {

        uint256 remaining = MathUpgradeable.min(count, withdrawalQueue.length());
        while (remaining > 0) {
            fulfillNextWithdrawalRequest();
            remaining--;
        }
    }

    /**
     * @dev Fulfill a single withdrawal request at the top of the queue.
     */
    function fulfillNextWithdrawalRequest() private {

        //// check

        WithdrawalRequestQueue.Request memory request = withdrawalQueue.head();
        
        uint256 requestedAmount = tokensToFunds(request.sharesLocked);
        uint256 transferAmount = requestedAmount - MathUpgradeable.mulDiv(
            requestedAmount, 
            config.exitFeePercent, 
            SaplingMath.HUNDRED_PERCENT
        );

        require(balances.rawLiquidity >= transferAmount, "SaplingPolContext: insufficient liqudity");

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
    }

    /**
     * @notice Stake liquidity tokens into the pool. Staking liquidity tokens will mint an equivalent amount of pool
     *         tokens and lock them in the pool. Exact exchange rate depends on the current pool state.
     * @dev Caller must be the manager.
     *      Stake amount must be non zero.
     *      An appropriate spend limit must be present at the token contract.
     * @param amount Liquidity token amount to stake.
     */
    function stake(uint256 amount) external onlyRole(poolManagerRole) whenNotPaused whenNotClosed {
        require(amount > 0, "SaplingPoolContext: stake amount is 0");

        uint256 sharesMinted = enter(amount);

        emit FundsStaked(msg.sender, amount, sharesMinted);
    }

    /**
     * @notice Unstake liquidity tokens from the pool. Unstaking redeems equivalent amount of the caller's pool tokens
     *         locked in the pool by burning the tokens in question.
     * @dev Caller must be the manager.
     *      Unstake amount must be non zero and not exceed amountUnstakable().
     * @param amount Liquidity token amount to unstake.
     */
    function unstake(uint256 amount) external onlyRole(poolManagerRole) whenNotPaused {
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

        emit RevenueWithdrawn(msg.sender, amount);
    }

    /**
     * @notice Withdraw manager's leveraged earnings.
     * @dev Revenue is in liquidity tokens. 
     *      Caller must have the pool manager role.
     * @param amount Liquidity token amount to withdraw.
     */
    function collectManagerRevenue(uint256 amount) external onlyRole(poolManagerRole) whenNotPaused {
        //// check
        
        require(amount > 0, "SaplingPoolContext: invalid amount");
        require(amount <= balances.managerRevenue, "SaplingPoolContext: insufficient balance");


        //// effect

        balances.managerRevenue -= amount;
        balances.tokenBalance -= amount;

        //// interactions

        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(tokenConfig.liquidityToken), msg.sender, amount);

        emit RevenueWithdrawn(msg.sender, amount);
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
     * @return Max amount of tokens withdrawable by the caller.
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
     * @notice Check the manager's staked liquidity token balance in the pool.
     * @return Liquidity token balance of the manager's stake.
     */
    function balanceStaked() external view returns (uint256) {
        return tokensToFunds(balances.stakedShares);
    }

    /**
     * @notice Estimated lender APY given the current pool state.
     * @return Estimated current lender APY
     */
    function currentLenderAPY() external view returns (uint16) {
        return lenderAPY(balances.strategizedFunds, config.weightedAvgStrategyAPR);
    }

    /**
     * @notice Projected lender APY given the current pool state and a specific strategy rate and an average apr.
     * @dev Represent percentage parameter values in contract specific format.
     * @param strategyRate Percentage of pool funds projected to be used in strategies.
     * @return Projected lender APY
     */
    function projectedLenderAPY(uint16 strategyRate, uint256 _avgStrategyAPR) external view returns (uint16) {
        require(strategyRate <= SaplingMath.HUNDRED_PERCENT, "SaplingPoolContext: invalid borrow rate");

        return lenderAPY(
            MathUpgradeable.mulDiv(balances.poolFunds, strategyRate, SaplingMath.HUNDRED_PERCENT),
            _avgStrategyAPR
        );
    }

    /**
     * @notice Check wallet's liquidity token balance in the pool. This balance includes deposited balance and acquired
     *         yield. This balance does not included staked balance, leveraged revenue or protocol revenue.
     * @param wallet Address of the wallet to check the balance of.
     * @return Liquidity token balance of the wallet in this pool.
     */
    function balanceOf(address wallet) public view returns (uint256) {
        return tokensToFunds(IPoolToken(tokenConfig.poolToken).balanceOf(wallet));
    }

    /**
     * @notice Check liquidity token amount unstakable by the manager at this time.
     * @dev Return value depends on the manager's stake balance and targetStakePercent, and is limited by pool
     *      liquidity.
     * @return Max amount of tokens unstakable by the manager.
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
            return MathUpgradeable.min(withdrawableLiquidity, tokensToFunds(balances.stakedShares)); 
        }

        uint256 lenderShares = totalPoolShares - balances.stakedShares;
        uint256 lockedStakeShares = MathUpgradeable.mulDiv(
            lenderShares,
            config.targetStakePercent,
            SaplingMath.HUNDRED_PERCENT - config.targetStakePercent
        );

        return MathUpgradeable.min(
            withdrawableLiquidity,
            tokensToFunds(balances.stakedShares - lockedStakeShares)
        );
    }

    /**
     * @notice Current liquidity available for pool strategies such as lending or investing.
     * @return Strategy liquidity amount.
     */
    function strategyLiquidity() public view returns (uint256) {

        uint256 lenderAllocatedLiquidity = MathUpgradeable.max(
            tokensToFunds(balances.withdrawalRequestedShares),
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

        uint256 withdrawalRequestedLiqudity = tokensToFunds(balances.withdrawalRequestedShares);

        return balances.rawLiquidity > withdrawalRequestedLiqudity 
            ? balances.rawLiquidity - withdrawalRequestedLiqudity
            : 0;
    }

    /**
     * @dev View pool funds limit based on the staked funds.
     * @return MAX amount of liquidity tokens allowed in the pool based on staked assets
     */
    function poolFundsLimit() public view returns (uint256) {
        return tokensToFunds(
            MathUpgradeable.mulDiv(balances.stakedShares, SaplingMath.HUNDRED_PERCENT, config.targetStakePercent)
        );
    }

    /**
     * @dev Internal method to enter the pool with a liquidity token amount.
     *      With the exception of the manager's call, amount must not exceed amountDepositable().
     *      If the caller is the pool manager, entered funds are considered staked.
     *      New pool tokens are minted in a way that will not influence the current share price.
     * @dev Shares are equivalent to pool tokens and are represented by them.
     * @param amount Liquidity token amount to add to the pool on behalf of the caller.
     * @return Amount of pool tokens minted and allocated to the caller.
     */
    function enter(uint256 amount) internal nonReentrant returns (uint256) {
        //// check

        require(amount > 0, "SaplingPoolContext: pool deposit amount is 0");

        bool isManager = hasRole(poolManagerRole, msg.sender);

        // non-managers must follow pool size limit
        if (!isManager) {
            uint256 poolLimit = poolFundsLimit();
            require(
                poolLimit > balances.poolFunds && amount <= poolLimit - balances.poolFunds,
                "SaplingPoolContext: deposit amount is over the remaining pool limit"
            );
        }
        
        //// effect

        uint256 shares = fundsToTokens(amount);

        balances.tokenBalance += amount;
        balances.rawLiquidity += amount;
        balances.poolFunds += amount;

        if (isManager) {
            // this is a staking entry

            balances.stakedShares += shares;
        }

        //// interactions

        // charge 'amount' tokens from msg.sender
        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(tokenConfig.liquidityToken),
            msg.sender,
            address(this),
            amount
        );

        // mint shares
        IPoolToken(tokenConfig.poolToken).mint(!isManager ? msg.sender : address(this), shares);

        return shares;
    }

    /**
     * @dev Internal method to exit the pool with a liquidity token amount.
     *      Amount must not exceed amountWithdrawable() for non managers, and amountUnstakable() for the manager.
     *      If the caller is the pool manager, exited funds are considered unstaked.
     *      Pool tokens are burned in a way that will not influence the current share price.
     * @dev Shares are equivalent to pool tokens and are represented by them.
     * @param amount Liquidity token amount to withdraw from the pool on behalf of the caller.
     * @return Amount of pool tokens burned and taken from the caller.
     */
    function exit(uint256 amount) internal nonReentrant returns (uint256) {
        //// check
        require(amount > 0, "SaplingPoolContext: pool withdrawal amount is 0");
        require(balances.rawLiquidity >= amount, "SaplingPoolContext: insufficient liquidity");

        uint256 shares = fundsToTokens(amount);

        bool isManager = hasRole(poolManagerRole, msg.sender);

        require(
            isManager
                ? shares <= balances.stakedShares
                : shares <= IERC20(tokenConfig.poolToken).balanceOf(msg.sender),
            "SaplingPoolContext: insufficient balance"
        );

        //// effect

        if (isManager) {
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
        IPoolToken(tokenConfig.poolToken).burn(isManager ? address(this) : msg.sender, shares);

        // transfer liqudity tokens
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
            config.weightedAvgStrategyAPR = (
                (balances.strategizedFunds + amountReducedBy) * config.weightedAvgStrategyAPR - amountReducedBy * apr
            )
                / balances.strategizedFunds;
        } else {
            config.weightedAvgStrategyAPR = 0;
        }
    }

    /**
     * @notice Get liquidity token value of shares.
     * @param poolTokens Pool token amount
     */
    function tokensToFunds(uint256 poolTokens) public view override returns (uint256) {
        if (poolTokens == 0 || balances.poolFunds == 0) {
             return 0;
        }

        return MathUpgradeable.mulDiv(poolTokens, balances.poolFunds, totalPoolTokenSupply());
    }

    /**
     * @notice Get pool token value of liquidity tokens.
     * @param liquidityTokens Amount of liquidity tokens.
     */
    function fundsToTokens(uint256 liquidityTokens) public view override returns (uint256) {
        uint256 totalPoolTokens = totalPoolTokenSupply();

        if (totalPoolTokens == 0) {
            // a pool with no positions
            return liquidityTokens;
        } else if (balances.poolFunds == 0) {
            /*
                Handle failed pool case, where: poolFunds == 0, but totalPoolShares > 0
                To minimize loss for the new depositor, assume the total value of existing shares is the minimum
                possible nonzero integer, which is 1.

                Simplify (tokens * totalPoolShares) / 1 as tokens * totalPoolShares.
            */
            return liquidityTokens * totalPoolTokens;
        }

        return MathUpgradeable.mulDiv(liquidityTokens, totalPoolTokens, balances.poolFunds);
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
     * @notice Lender APY given the current pool state, a specific strategized funds, and an average apr.
     * @dev Represent percentage parameter values in contract specific format.
     * @param _strategizedFunds Pool funds to be borrowed annually.
     * @return Lender APY
     */
    function lenderAPY(uint256 _strategizedFunds, uint256 _avgStrategyAPR) internal view returns (uint16) {
        if (balances.poolFunds == 0 || _strategizedFunds == 0 || _avgStrategyAPR == 0) {
            return 0;
        }

        // pool APY
        uint256 poolAPY = MathUpgradeable.mulDiv(_avgStrategyAPR, _strategizedFunds, balances.poolFunds);

        // protocol APY
        uint256 protocolAPY = MathUpgradeable.mulDiv(poolAPY, config.protocolFeePercent, SaplingMath.HUNDRED_PERCENT);

        uint256 remainingAPY = poolAPY - protocolAPY;

        // manager withdrawableAPY
        uint256 currentStakePercent = MathUpgradeable.mulDiv(
            balances.stakedShares,
            SaplingMath.HUNDRED_PERCENT,
            totalPoolTokenSupply()
        );
        uint256 managerEarningsPercent = MathUpgradeable.mulDiv(
            currentStakePercent,
            config.managerEarnFactor - SaplingMath.HUNDRED_PERCENT,
            SaplingMath.HUNDRED_PERCENT);

        uint256 managerWithdrawableAPY = MathUpgradeable.mulDiv(
            remainingAPY,
            managerEarningsPercent,
            managerEarningsPercent + SaplingMath.HUNDRED_PERCENT
        );

        return uint16(remainingAPY - managerWithdrawableAPY);
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
    uint256[35] private __gap;
}
