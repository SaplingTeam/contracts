// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../interfaces/IPoolContext.sol";
import "../interfaces/IPoolToken.sol";
import "./SaplingManagerContext.sol";
import "../lib/WithdrawalRequestQueue.sol";

/**
 * @title Sapling Pool Context
 * @notice Provides common pool functionality with lender deposits, manager's first loss capital staking,
 *         and reward distribution.
 */
abstract contract SaplingPoolContext is IPoolContext, SaplingManagerContext, ReentrancyGuardUpgradeable {

    using WithdrawalRequestQueue for WithdrawalRequestQueue.LinkedMap;

    TokenConfig public tokenConfig;

    PoolConfig public config;

    PoolBalance public balance;

    /// Part of the managers leverage factor, earnings of witch will be allocated for the manager as protocol earnings.
    /// This value is always equal to (managerEarnFactor - oneHundredPercent)
    uint256 internal managerExcessLeverageComponent;

    /// Weighted average loan APR on the borrowed funds
    uint256 internal weightedAvgStrategyAPR;

    uint256 public MIN_WITHDRAWAL_REQUEST_AMOUNT;

    mapping (address => WithdrawalRequestState) public withrawalRequestStates;

    WithdrawalRequestQueue.LinkedMap private withdrawalQueue;

    /**
     * @notice Creates a SaplingPoolContext.
     * @dev Addresses must not be 0.
     * @param _poolToken ERC20 token contract address to be used as the pool issued token.
     * @param _liquidityToken ERC20 token contract address to be used as pool liquidity currency.
     * @param _accessControl Access control contract
     * @param _managerRole Manager role
     */
    function __SaplingPoolContext_init(address _poolToken,
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
        assert(totalPoolTokenSupply() == 0);

        uint8 decimals = IERC20Metadata(_liquidityToken).decimals();

        tokenConfig = TokenConfig({
            poolToken: _poolToken,
            liquidityToken: _liquidityToken,
            decimals: decimals
        });

        uint16 _maxProtocolFeePercent = uint16(10 * 10 ** percentDecimals);
        uint16 _maxEarnFactor = uint16(1000 * 10 ** percentDecimals);

        config = PoolConfig({
            poolFundsLimit: 0,
            exitFeePercent: oneHundredPercent / 200, // 0.5%
            maxProtocolFeePercent: _maxProtocolFeePercent,

            targetStakePercent: uint16(10 * 10 ** percentDecimals),
            protocolFeePercent: _maxProtocolFeePercent,
            managerEarnFactorMax: _maxEarnFactor,

            targetLiquidityPercent: 0, //0%
            managerEarnFactor: uint16(MathUpgradeable.min(uint16(150 * 10 ** percentDecimals), _maxEarnFactor))
        });

        balance = PoolBalance({
            tokenBalance: 0,
            poolFunds: 0,
            rawLiquidity: 0,
            allocatedFunds: 0,
            strategizedFunds: 0,
            withdrawalRequestedShares: 0,
            stakedShares: 0,
            protocolRevenue: 0,
            managerRevenue: 0
        });

        managerExcessLeverageComponent = uint256(config.managerEarnFactor) - oneHundredPercent;

        weightedAvgStrategyAPR = 0;

        MIN_WITHDRAWAL_REQUEST_AMOUNT = 10 * 10 ** tokenConfig.decimals;
    }

    /**
     * @notice Set the target stake percent for the pool.
     * @dev _targetStakePercent must be greater than 0 and less than or equal to oneHundredPercent.
     *      Caller must be the governance.
     * @param _targetStakePercent New target stake percent.
     */
    function setTargetStakePercent(uint16 _targetStakePercent) external onlyRole(SaplingRoles.GOVERNANCE_ROLE) {
        require(
            0 < _targetStakePercent && _targetStakePercent <= oneHundredPercent,
            "SaplingPoolContext: target stake percent is out of bounds"
        );

        uint16 prevValue = config.targetStakePercent;
        config.targetStakePercent = _targetStakePercent;
        updatePoolLimit();

        emit TargetStakePercentSet(prevValue, config.targetStakePercent);
    }

    /**
     * @notice Set the target liquidity percent for the pool.
     * @dev _targetLiquidityPercent must be inclusively between 0 and oneHundredPercent.
     *      Caller must be the manager.
     * @param _targetLiquidityPercent new target liquidity percent.
     */
    function setTargetLiquidityPercent(uint16 _targetLiquidityPercent) external onlyRole(POOL_MANAGER_ROLE) {
        require(
            0 <= _targetLiquidityPercent && _targetLiquidityPercent <= oneHundredPercent,
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
     * @dev _managerEarnFactorMax must be greater than or equal to oneHundredPercent. If the current earn factor is
     *      greater than the new maximum, then the current earn factor is set to the new maximum.
     *      Caller must be the governance.
     * @param _managerEarnFactorMax new maximum for manager's earn factor.
     */
    function setManagerEarnFactorMax(uint16 _managerEarnFactorMax) external onlyRole(SaplingRoles.GOVERNANCE_ROLE) {
        require(
            oneHundredPercent <= _managerEarnFactorMax,
            "SaplingPoolContext: _managerEarnFactorMax is out of bounds"
        );

        uint16 prevValue = config.managerEarnFactorMax;
        config.managerEarnFactorMax = _managerEarnFactorMax;

        if (config.managerEarnFactor > config.managerEarnFactorMax) {
            uint16 prevEarnFactor = config.managerEarnFactor;
            config.managerEarnFactor = config.managerEarnFactorMax;
            managerExcessLeverageComponent = uint256(config.managerEarnFactor) - oneHundredPercent;

            emit ManagerEarnFactorSet(prevEarnFactor, config.managerEarnFactor);
        }

        emit ManagerEarnFactorMaxSet(prevValue, config.managerEarnFactorMax);
    }

    /**
     * @notice Set the manager's earn factor percent.
     * @dev _managerEarnFactorMax must be inclusively between oneHundredPercent and managerEarnFactorMax.
     *      Caller must be the manager.
     * @param _managerEarnFactor new manager's earn factor.
     */
    function setManagerEarnFactor(uint16 _managerEarnFactor) external onlyRole(POOL_MANAGER_ROLE) {
        require(
            oneHundredPercent <= _managerEarnFactor && _managerEarnFactor <= config.managerEarnFactorMax,
            "SaplingPoolContext: _managerEarnFactor is out of bounds"
        );

        uint16 prevValue = config.managerEarnFactor;
        config.managerEarnFactor = _managerEarnFactor;
        managerExcessLeverageComponent = uint256(config.managerEarnFactor) - oneHundredPercent;

        emit ManagerEarnFactorSet(prevValue, config.managerEarnFactor);
    }

    /**
     * @notice Deposit liquidity tokens to the pool. Depositing liquidity tokens will mint an equivalent amount of pool
     *         tokens and transfer it to the caller. Exact exchange rate depends on the current pool state.
     * @dev Deposit amount must be non zero and not exceed amountDepositable().
     *      An appropriate spend limit must be present at the token contract.
     *      Caller must not be any of: manager, protocol, governance.
     * @param amount Liquidity token amount to deposit.
     */
    function deposit(uint256 amount) external onlyUser whenNotPaused whenNotClosed {
        uint256 sharesMinted = enterPool(amount);

        emit FundsDeposited(msg.sender, amount, sharesMinted);
    }

    /**
     * @notice Withdraw liquidity tokens from the pool. Withdrawals redeem equivalent amount of the caller's pool tokens
     *         by burning the tokens in question.
     *         Exact exchange rate depends on the current pool state.
     * @dev Withdrawal amount must be non zero and not exceed amountWithdrawable().
     * @param amount Liquidity token amount to withdraw.
     */
    function withdraw(uint256 amount) public whenNotPaused onlyUser {
        uint256 sharesBurned = exitPool(amount);

        emit FundsWithdrawn(msg.sender, amount, sharesBurned);
    }

    function requestWithdrawal(uint256 shares) external whenNotPaused onlyUser {

        uint256 amount = sharesToTokens(shares);
        uint256 outstandingRequestsAmount = sharesToTokens(balance.withdrawalRequestedShares);

        //// base case
        if (
            balance.rawLiquidity >= outstandingRequestsAmount 
            && amount <= balance.rawLiquidity - outstandingRequestsAmount
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

        require(amount >= MIN_WITHDRAWAL_REQUEST_AMOUNT, "SaplingPoolContext: amount is less than the minimum");

        WithdrawalRequestState storage state = withrawalRequestStates[msg.sender];
        require(state.countOutstanding <= 3, "SaplingPoolContext: too many outstanding withdrawal requests");

        //// effect

        withdrawalQueue.queue(msg.sender, shares);

        state.countOutstanding++;
        state.sharesLocked += shares;
        balance.withdrawalRequestedShares += shares;

        //// interactions

        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(tokenConfig.poolToken),
            msg.sender,
            address(this),
            shares
        );
    }

    function updateWithdrawalRequest(uint256 id, uint256 newShareAmount) external whenNotPaused {
        //// check        
        WithdrawalRequestQueue.Request memory request = withdrawalQueue.get(id);
        require(request.wallet == msg.sender, "SaplingPoolContext: unauthorized");
        require(
            newShareAmount < request.sharesLocked && sharesToTokens(newShareAmount) >= MIN_WITHDRAWAL_REQUEST_AMOUNT,
            "SaplingPoolContext: invalid share amount"
        );

        //// effect
        
        uint256 shareDifference = withdrawalQueue.update(id, newShareAmount);

        balance.withdrawalRequestedShares -= shareDifference;

        WithdrawalRequestState storage state = withrawalRequestStates[request.wallet];
        state.countOutstanding--;
        state.sharesLocked -= shareDifference;

        //// interactions

        // unlock shares
        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(tokenConfig.poolToken),
            address(this),
            request.wallet,
            shareDifference
        );
    }

    function cancelWithdrawalRequest(uint256 id) external whenNotPaused {

        //// check
        WithdrawalRequestQueue.Request memory request = withdrawalQueue.get(id);
        require(request.wallet == msg.sender, "SaplingPoolContext: unauthorized");

        //// effect
        withdrawalQueue.remove(id);

        balance.withdrawalRequestedShares -= request.sharesLocked;
        
        WithdrawalRequestState storage state = withrawalRequestStates[request.wallet];
        state.countOutstanding--;
        state.sharesLocked -= request.sharesLocked;

        //// interactions

        // unlock shares
        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(tokenConfig.poolToken),
            address(this),
            request.wallet,
            request.sharesLocked
        );
    }

    function fullfillWithdrawalRequest(uint256 id) external whenNotPaused {
        //// check

        WithdrawalRequestQueue.Request memory request = withdrawalQueue.get(id);
        uint256 requestedAmount = sharesToTokens(request.sharesLocked);
        require(
            balance.rawLiquidity >= requestedAmount + sharesToTokens(request.sumOfSharesLockedAhead),
            "SaplingPolContext: insufficient liqudity"
        );

        //// effect

        withdrawalQueue.remove(id);

        WithdrawalRequestState storage state = withrawalRequestStates[request.wallet];
        state.countOutstanding++;
        state.sharesLocked -= request.sharesLocked;

        balance.rawLiquidity -= requestedAmount;

        //// interactions

        // burn shares
        IPoolToken(tokenConfig.poolToken).burn(address(this), request.sharesLocked);

        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(tokenConfig.liquidityToken),
            address(this),
            request.wallet,
            requestedAmount
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
    function stake(uint256 amount) external onlyRole(POOL_MANAGER_ROLE) whenNotPaused whenNotClosed {
        require(amount > 0, "SaplingPoolContext: stake amount is 0");

        uint256 sharesMinted = enterPool(amount);

        //// effect (intentional)
        // this call depends on the outcome of the external calls in enterPool(amount), enterPool is nonReintrant
        updatePoolLimit();

        emit FundsStaked(msg.sender, amount, sharesMinted);
    }

    /**
     * @notice Unstake liquidity tokens from the pool. Unstaking redeems equivalent amount of the caller's pool tokens
     *         locked in the pool by burning the tokens in question.
     * @dev Caller must be the manager.
     *      Unstake amount must be non zero and not exceed amountUnstakable().
     * @param amount Liquidity token amount to unstake.
     */
    function unstake(uint256 amount) external onlyRole(POOL_MANAGER_ROLE) whenNotPaused {
        require(amount > 0, "SaplingPoolContext: unstake amount is 0");
        require(amount <= amountUnstakable(), "SaplingPoolContext: requested amount is not available for unstaking");

        uint256 sharesBurned = exitPool(amount);

        emit FundsUnstaked(msg.sender, amount, sharesBurned);
    }

    /**
     * @notice Withdraws protocol revenue belonging to the caller.
     * @dev revenueBalanceOf(msg.sender) must be greater than 0.
     *      Caller's all accumulated earnings will be withdrawn.
     *      Protocol earnings are represented in liquidity tokens.
     */
    function withdrawRevenue() external whenNotPaused {
        // check
        require(revenueBalanceOf(msg.sender) > 0, "SaplingPoolContext: zero protocol earnings");


        // effect

        uint256 amount = 0;

        if (hasRole(POOL_MANAGER_ROLE, msg.sender)) {
            amount += balance.managerRevenue;
            balance.managerRevenue = 0;
        }

        if (hasRole(SaplingRoles.TREASURY_ROLE, msg.sender)) {
            amount += balance.protocolRevenue;
            balance.protocolRevenue = 0;
        }

        balance.tokenBalance -= amount;

        // interactions

        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(tokenConfig.liquidityToken), msg.sender, amount);

        emit RevenueWithdrawn(msg.sender, amount);
    }

    /**
     * @notice Check liquidity token amount depositable by lenders at this time.
     * @dev Return value depends on the pool state rather than caller's balance.
     * @return Max amount of tokens depositable to the pool.
     */
    function amountDepositable() external view returns (uint256) {
        if (config.poolFundsLimit <= balance.poolFunds || closed() || paused()) {
            return 0;
        }

        return config.poolFundsLimit - balance.poolFunds;
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

    function withdrawalRequestsLength() external view returns (uint256) {
        return withdrawalQueue.length();
    }

    function getWithdrawalRequestAt(uint256 i) external view returns (WithdrawalRequestQueue.Request memory) {
        return withdrawalQueue.at(i);
    }

    function getWithdrawalRequestById(uint256 id) external view returns (WithdrawalRequestQueue.Request memory) {
        return withdrawalQueue.get(id);
    }

    /**
     * @notice Check the manager's staked liquidity token balance in the pool.
     * @return Liquidity token balance of the manager's stake.
     */
    function balanceStaked() external view returns (uint256) {
        return sharesToTokens(balance.stakedShares);
    }

    /**
     * @notice Check the special addresses' revenue from the protocol.
     * @dev This method is useful for manager and protocol addresses.
     *      Calling this method for a non-protocol associated addresses will return 0.
     * @param wallet Address of the wallet to check the earnings balance of.
     * @return Accumulated liquidity token revenue of the wallet from the protocol.
     */
    function revenueBalanceOf(address wallet) public view returns (uint256) {
        uint256 revenueBalance = 0;

        if (hasRole(POOL_MANAGER_ROLE, wallet)) {
            revenueBalance += balance.managerRevenue;
        }

        if (hasRole(SaplingRoles.TREASURY_ROLE, wallet)) {
            revenueBalance += balance.protocolRevenue;
        }

        return revenueBalance;
    }

    /**
     * @notice Estimated lender APY given the current pool state.
     * @return Estimated current lender APY
     */
    function currentLenderAPY() external view returns (uint16) {
        return lenderAPY(balance.strategizedFunds, weightedAvgStrategyAPR);
    }

    /**
     * @notice Projected lender APY given the current pool state and a specific strategy rate and an average apr.
     * @dev Represent percentage parameter values in contract specific format.
     * @param strategyRate Percentage of pool funds projected to be used in strategies.
     * @return Projected lender APY
     */
    function projectedLenderAPY(uint16 strategyRate, uint256 _avgStrategyAPR) external view returns (uint16) {
        require(strategyRate <= oneHundredPercent, "SaplingPoolContext: invalid borrow rate");

        return lenderAPY(
            MathUpgradeable.mulDiv(balance.poolFunds, strategyRate, oneHundredPercent),
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
        return sharesToTokens(IPoolToken(tokenConfig.poolToken).balanceOf(wallet));
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
            config.targetStakePercent >= oneHundredPercent && totalPoolShares > balance.stakedShares
        ) {
            return 0;
        } else if (closed() || totalPoolShares == balance.stakedShares) {
            return MathUpgradeable.min(withdrawableLiquidity, sharesToTokens(balance.stakedShares)); 
        }

        uint256 lenderShares = totalPoolShares - balance.stakedShares;
        uint256 lockedStakeShares = MathUpgradeable.mulDiv(
            lenderShares,
            config.targetStakePercent,
            oneHundredPercent - config.targetStakePercent
        );

        return MathUpgradeable.min(
            withdrawableLiquidity,
            sharesToTokens(balance.stakedShares - lockedStakeShares)
        );
    }

    /**
     * @notice Current liquidity available for pool strategies such as lending or investing.
     * @return Strategy liquidity amount.
     */
    function strategyLiquidity() public view returns (uint256) {

        uint256 lenderAllocatedLiquidity = MathUpgradeable.max(
            sharesToTokens(balance.withdrawalRequestedShares),
            MathUpgradeable.mulDiv(
                balance.poolFunds,
                config.targetLiquidityPercent,
                oneHundredPercent
            )
        );

        return balance.rawLiquidity > lenderAllocatedLiquidity 
            ? balance.rawLiquidity - lenderAllocatedLiquidity 
            : 0;
    }

    function freeLenderLiquidity() public view returns (uint256) {

        uint256 withdrawalRequestedLiqudity = sharesToTokens(balance.withdrawalRequestedShares);

        return balance.rawLiquidity > withdrawalRequestedLiqudity 
            ? balance.rawLiquidity - withdrawalRequestedLiqudity
            : 0;
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
    function enterPool(uint256 amount) internal nonReentrant returns (uint256) { //FIXME rename
        //// check

        require(amount > 0, "SaplingPoolContext: pool deposit amount is 0");

        bool isManager = hasRole(POOL_MANAGER_ROLE, msg.sender);

        // allow the manager to add funds beyond the current pool limit
        require(
            isManager ||
            (
                config.poolFundsLimit > balance.poolFunds &&
                amount <= config.poolFundsLimit - balance.poolFunds
            ),
            "SaplingPoolContext: deposit amount is over the remaining pool limit"
        );

        //// effect

        uint256 shares = tokensToShares(amount);

        balance.tokenBalance += amount;
        balance.rawLiquidity += amount;
        balance.poolFunds += amount;

        if (isManager) {
            // this is a staking entry

            balance.stakedShares += shares;
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
    function exitPool(uint256 amount) internal nonReentrant returns (uint256) { //FIXME rename
        //// check
        require(amount > 0, "SaplingPoolContext: pool withdrawal amount is 0");
        require(balance.rawLiquidity >= amount, "SaplingPoolContext: insufficient liquidity");

        uint256 shares = tokensToShares(amount);

        bool isManager = hasRole(POOL_MANAGER_ROLE, msg.sender);

        require(
            !isManager
                ? shares <= IERC20(tokenConfig.poolToken).balanceOf(msg.sender)
                : shares <= balance.stakedShares,
            "SaplingPoolContext: insufficient balance"
        );

        //// effect

        if (isManager) {
            balance.stakedShares -= shares;
            updatePoolLimit();
        }

        uint256 transferAmount = amount - MathUpgradeable.mulDiv(amount, config.exitFeePercent, oneHundredPercent);

        balance.poolFunds -= transferAmount;
        balance.rawLiquidity -= transferAmount;
        balance.tokenBalance -= transferAmount;

        //// interactions

        // burn shares
        IPoolToken(tokenConfig.poolToken).burn(!isManager ? msg.sender : address(this), shares);

        // transfer liqudity tokens
        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(tokenConfig.liquidityToken), msg.sender, transferAmount);

        return shares;
    }

    /**
     * @dev Internal method to update the pool funds limit based on the staked funds.
     */
    function updatePoolLimit() internal {
        config.poolFundsLimit = sharesToTokens(
            MathUpgradeable.mulDiv(balance.stakedShares, oneHundredPercent, config.targetStakePercent)
        );
    }

    /**
     * @dev Internal method to update the weighted average loan apr based on the amount reduced by and an apr.
     * @param amountReducedBy amount by which the funds committed into strategy were reduced, due to repayment or loss
     * @param apr annual percentage rate of the strategy
     */
    function updateAvgStrategyApr(uint256 amountReducedBy, uint16 apr) internal {
        if (balance.strategizedFunds > 0) {
            weightedAvgStrategyAPR = (
                (balance.strategizedFunds + amountReducedBy) * weightedAvgStrategyAPR - amountReducedBy * apr
            )
                / balance.strategizedFunds;
        } else {
            weightedAvgStrategyAPR = 0;
        }
    }

    /**
     * @notice Get liquidity token value of shares.
     * @dev Shares are equivalent to pool tokens and are represented by them.
     * @param shares Amount of shares
     */
    function sharesToTokens(uint256 shares) public view override returns (uint256) {
        if (shares == 0 || balance.poolFunds == 0) {
             return 0;
        }

        return MathUpgradeable.mulDiv(shares, balance.poolFunds, totalPoolTokenSupply());
    }

    /**
     * @notice Get a share value of liquidity tokens.
     * @dev Shares are equivalent to pool tokens and are represented by them.
     * @param tokens Amount of liquidity tokens.
     */
    function tokensToShares(uint256 tokens) public view override returns (uint256) {
        uint256 totalPoolShares = totalPoolTokenSupply();

        if (totalPoolShares == 0) {
            // a pool with no positions
            return tokens;
        } else if (balance.poolFunds == 0) {
            /*
                Handle failed pool case, where: poolFunds == 0, but totalPoolShares > 0
                To minimize loss for the new depositor, assume the total value of existing shares is the minimum
                possible nonzero integer, which is 1.

                Simplify (tokens * totalPoolShares) / 1 as tokens * totalPoolShares.
            */
            return tokens * totalPoolShares;
        }

        return MathUpgradeable.mulDiv(tokens, totalPoolShares, balance.poolFunds);
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
        if (balance.poolFunds == 0 || _strategizedFunds == 0 || _avgStrategyAPR == 0) {
            return 0;
        }

        // pool APY
        uint256 poolAPY = MathUpgradeable.mulDiv(_avgStrategyAPR, _strategizedFunds, balance.poolFunds);

        // protocol APY
        uint256 protocolAPY = MathUpgradeable.mulDiv(poolAPY, config.protocolFeePercent, oneHundredPercent);

        uint256 remainingAPY = poolAPY - protocolAPY;

        // manager withdrawableAPY
        uint256 currentStakePercent = MathUpgradeable.mulDiv(
            balance.stakedShares,
            oneHundredPercent,
            totalPoolTokenSupply()
        );
        uint256 managerEarningsPercent = MathUpgradeable.mulDiv(
            currentStakePercent,
            managerExcessLeverageComponent,
            oneHundredPercent);

        uint256 managerWithdrawableAPY = MathUpgradeable.mulDiv(
            remainingAPY,
            managerEarningsPercent,
            managerEarningsPercent + oneHundredPercent
        );

        return uint16(remainingAPY - managerWithdrawableAPY);
    }

    /**
     * @notice Check if the pool is functional based on the current stake levels.
     * @return True if the staked funds provide at least a minimum ratio to the pool funds, False otherwise.
     */
    function isPoolFunctional() internal view returns (bool) {
        return !(paused() || closed())
            && balance.stakedShares >= MathUpgradeable.mulDiv(
                totalPoolTokenSupply(),
                config.targetStakePercent,
                oneHundredPercent
            );
    }

    /**
     * @dev Implementation of the abstract hook in SaplingManagedContext.
     *      Pool can be close when no funds remain committed to strategies.
     */
    function canClose() internal view override returns (bool) {
        return balance.strategizedFunds == 0;
    }

    /**
     * @dev Slots reserved for future state variables
     */
    uint256[35] private __gap;
}
