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

/**
 * @title Sapling Pool Context
 * @notice Provides common pool functionality with lender deposits, first loss capital staking, and reward distribution.
 */
abstract contract SaplingPoolContext is IPoolContext, SaplingStakerContext, ReentrancyGuardUpgradeable {

    /// Tokens configuration
    TokenConfig public tokenConfig;

    /// Pool configuration
    PoolConfig public config;

    /// Pool balances
    PoolBalance public balances;

    /// Per user withdrawal allowances with time windows
    mapping (address => WithdrawalAllowance) public withdrawalAllowances;

    /// Limits access only when no active withdrawal requests are present
    modifier noWithdrawalRequests() {
        WithdrawalAllowance storage allowance = withdrawalAllowances[msg.sender];
        require(
            allowance.amount == 0 || block.timestamp >= allowance.timeTo,
            "SaplingPoolContext: deposit not allowed. Active withdrawal allowance found."
        );
        _;
    }

    /// Modifier to update pool accounting state before function execution
    modifier updatedState() {
        settleYield();
        _;
    }

    /**
     * @notice Creates a SaplingPoolContext.
     * @dev Addresses must not be 0.
     * @param _poolToken ERC20 token contract address to be used as the pool issued token.
     * @param _liquidityToken ERC20 token contract address to be used as pool liquidity currency.
     * @param _accessControl Access control contract
     * @param _stakerAddress Staker address
     */
    function __SaplingPoolContext_init(
        address _poolToken,
        address _liquidityToken,
        address _accessControl,
        address _stakerAddress
    )
        internal
        onlyInitializing
    {
        __SaplingStakerContext_init(_accessControl, _stakerAddress);

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

        config = PoolConfig({
            minWithdrawalRequestAmount: 10 * 10 ** tokenConfig.decimals, // 10 asset tokens
            targetStakePercent: uint32(10 * 10 ** SaplingMath.PERCENT_DECIMALS), // 10%

            // must be valid: protocolFeePercent <= SaplingMath.MAX_PROTOCOL_FEE_PERCENT
            protocolFeePercent: uint32(20 * 10 ** SaplingMath.PERCENT_DECIMALS), // 20%
            stakerEarnFactorMax: uint32(1000 * 10 ** SaplingMath.PERCENT_DECIMALS), // 1000% or 10x

            targetLiquidityPercent: 0,

            // must be valid: stakerEarnFactor <= stakerEarnFactorMax
            stakerEarnFactor: uint32(150 * 10 ** SaplingMath.PERCENT_DECIMALS), // 150%

            exitFeePercent: SaplingMath.HUNDRED_PERCENT / 200 // 0.5%
        });
    }

    /**
     * @notice Set the target stake percent for the pool.
     * @dev _targetStakePercent must be greater than 0 and less than or equal to SaplingMath.HUNDRED_PERCENT.
     *      Caller must be the governance.
     * @param _targetStakePercent New target stake percent.
     */
    function setTargetStakePercent(uint32 _targetStakePercent) external onlyRole(SaplingRoles.GOVERNANCE_ROLE) {
        require(
            0 < _targetStakePercent && _targetStakePercent <= SaplingMath.HUNDRED_PERCENT,
            "SaplingPoolContext: target stake percent is out of bounds"
        );

        uint32 prevValue = config.targetStakePercent;
        config.targetStakePercent = _targetStakePercent;

        emit TargetStakePercentSet(prevValue, _targetStakePercent);
    }

    /**
     * @notice Set the target liquidity percent for the pool.
     * @dev _targetLiquidityPercent must be inclusively between 0 and SaplingMath.HUNDRED_PERCENT.
     *      Caller must be the staker.
     * @param _targetLiquidityPercent new target liquidity percent.
     */
    function setTargetLiquidityPercent(uint32 _targetLiquidityPercent) external onlyStaker {
        require(
            0 <= _targetLiquidityPercent && _targetLiquidityPercent <= SaplingMath.HUNDRED_PERCENT,
            "SaplingPoolContext: target liquidity percent is out of bounds"
        );

        uint32 prevValue = config.targetLiquidityPercent;
        config.targetLiquidityPercent = _targetLiquidityPercent;

        emit TargetLiquidityPercentSet(prevValue, _targetLiquidityPercent);
    }

    /**
     * @notice Set the protocol earning percent for the pool.
     * @dev _protocolEarningPercent must be inclusively between 0 and MAX_PROTOCOL_FEE_PERCENT.
     *      Caller must be the governance.
     * @param _protocolEarningPercent new protocol earning percent.
     */
    function setProtocolEarningPercent(uint32 _protocolEarningPercent)
        external
        onlyRole(SaplingRoles.GOVERNANCE_ROLE)
        updatedState
    {
        require(
            0 <= _protocolEarningPercent && _protocolEarningPercent <= SaplingMath.MAX_PROTOCOL_FEE_PERCENT,
            "SaplingPoolContext: protocol earning percent is out of bounds"
        );

        uint32 prevValue = config.protocolFeePercent;
        config.protocolFeePercent = _protocolEarningPercent;

        emit ProtocolFeePercentSet(prevValue, _protocolEarningPercent);
    }

    /**
     * @notice Set an upper bound for the staker earn factor.
     * @dev _stakerEarnFactorMax must be greater than or equal to SaplingMath.HUNDRED_PERCENT. If the current
     *      earn factor is greater than the new maximum, then the current earn factor is set to the new maximum.
     *      Caller must be the governance.
     * @param _stakerEarnFactorMax new maximum for staker earn factor.
     */
    function setStakerEarnFactorMax(
        uint32 _stakerEarnFactorMax
    )
        external
        onlyRole(SaplingRoles.GOVERNANCE_ROLE)
        updatedState
    {
        require(
            SaplingMath.HUNDRED_PERCENT <= _stakerEarnFactorMax,
            "SaplingPoolContext: _stakerEarnFactorMax is out of bounds"
        );

        uint32 prevValue = config.stakerEarnFactorMax;
        config.stakerEarnFactorMax = _stakerEarnFactorMax;

        if (config.stakerEarnFactor > _stakerEarnFactorMax) {
            uint32 prevEarnFactor = config.stakerEarnFactor;
            config.stakerEarnFactor = _stakerEarnFactorMax;

            emit StakerEarnFactorSet(prevEarnFactor, _stakerEarnFactorMax);
        }

        emit StakerEarnFactorMaxSet(prevValue, _stakerEarnFactorMax);
    }

    /**
     * @notice Set the staker earn factor.
     * @dev _stakerEarnFactor must be inclusively between SaplingMath.HUNDRED_PERCENT and stakerEarnFactorMax.
     *      Caller must be the staker.
     * @param _stakerEarnFactor new staker earn factor.
     */
    function setStakerEarnFactor(uint32 _stakerEarnFactor) external onlyStaker updatedState {
        require(
            SaplingMath.HUNDRED_PERCENT <= _stakerEarnFactor && _stakerEarnFactor <= config.stakerEarnFactorMax,
            "SaplingPoolContext: _stakerEarnFactor is out of bounds"
        );

        uint32 prevValue = config.stakerEarnFactor;
        config.stakerEarnFactor = _stakerEarnFactor;

        emit StakerEarnFactorSet(prevValue, _stakerEarnFactor);
    }

    /**
     * @notice Deposit funds to the pool. Depositing funds will mint an equivalent amount of pool
     *         tokens and transfer it to the caller. Exact exchange rate depends on the current pool state.
     * @dev Deposit amount must be non zero and not exceed amountDepositable().
     *      An appropriate spend limit must be present at the token contract.
     *      Caller must be a user.
     *      Caller must not have any outstanding withdrawal requests.
     * @param amount Liquidity token amount to deposit.
     */
    function deposit(uint256 amount) external onlyUser noWithdrawalRequests whenNotPaused whenNotClosed updatedState {
        require(amount <= amountDepositable(), "SaplingPoolContext: invalid deposit amount");

        uint256 sharesMinted = enter(amount);

        emit FundsDeposited(msg.sender, amount, sharesMinted);
    }

    /**
     * @notice Request withdrawal allowance.
     * @dev Allowance amount must not exceed current balance. Withdrawal allowance is active after 1 minute of request,
     *      and is valid for a single use within 10 minutes after becoming active.
     * @param _amount Liquidity token amount of allowance.
     */
    function requestWithdrawalAllowance(uint256 _amount) external onlyUser whenNotPaused updatedState {
        require(_amount <= balanceOf(msg.sender), "SaplingPoolContext: amount exceeds account balance");

        uint256 _timeFrom = block.timestamp + 1 minutes;
        uint256 _timeTo = _timeFrom + 10 minutes;

        withdrawalAllowances[msg.sender] = WithdrawalAllowance({
            amount: _amount,
            timeFrom: _timeFrom,
            timeTo: _timeTo
        });

        emit WithdrawalAllowanceRequested(msg.sender, _amount, _timeFrom, _timeTo);
    }

    /**
     * @notice Withdraw funds from the pool. Withdrawals redeem equivalent amount of the caller's pool tokens
     *         by burning the tokens in question. Exact exchange rate depends on the current pool state.
     * @dev Withdrawal amount must be non zero and not exceed amountWithdrawable().
     *      Must have a valid withdrawal allowance.
     * @param amount Liquidity token amount to withdraw.
     */
    function withdraw(uint256 amount) public onlyUser whenNotPaused updatedState {
        WithdrawalAllowance storage allowance = withdrawalAllowances[msg.sender];

        require(amount <= allowance.amount, "SaplingPoolContext: insufficient withdrawal allowance amount");
        require(block.timestamp >= allowance.timeFrom, "SaplingPoolContext: request is too early");
        require(block.timestamp < allowance.timeTo, "SaplingPoolContext: withdrawal allowance has expired");

        require(
            amount <= amountWithdrawable(msg.sender),
            "SaplingPoolContext: requested amount is unavailable at this time"
        );

        // set allowance amount to zero, disabling the allowance and making it single use
        allowance.amount = 0;

        uint256 sharesBurned = exit(amount);

        emit FundsWithdrawn(msg.sender, amount, sharesBurned);
    }

    /**
     * @notice Stake funds into the pool. Staking funds will mint an equivalent amount of pool
     *         tokens and lock them in the pool. Exact exchange rate depends on the current pool state.
     * @dev Caller must be the staker.
     *      Stake amount must be non zero.
     *      An appropriate spend limit must be present at the token contract.
     * @param amount Liquidity token amount to stake.
     */
    function stake(uint256 amount) external onlyStaker whenNotPaused whenNotClosed {
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
    function unstake(uint256 amount) external onlyStaker whenNotPaused updatedState {
        require(amount <= amountUnstakable(), "SaplingPoolContext: requested amount is not available for unstaking");

        uint256 sharesBurned = exit(amount);

        emit FundsUnstaked(msg.sender, amount, sharesBurned);
    }

    /**
     * @notice Mint initial minimum amount of pool tokens and lock them into the access control contract,
     *      which is non upgradable - locking them forever.
     * @dev Caller must be the staker.
     *      An appropriate spend limit must be present at the asset token contract.
     *      This function can only be called when the total pool token supply is zero.
     */
    function initialMint() external onlyStaker whenNotPaused whenClosed updatedState {
        require(
            totalPoolTokenSupply() == 0,
            "SaplingPoolContext: invalid initial conditions"
        );

        uint256 sharesMinted = enter(10 ** tokenConfig.decimals);
        balances.stakedShares -= sharesMinted;

        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(tokenConfig.poolToken), accessControl, sharesMinted);
    }

    /**
     * @notice Check liquidity token amount depositable by lenders at this time.
     * @dev Return value depends on the pool state rather than caller's balance.
     * @return Max amount of tokens depositable to the pool.
     */
    function amountDepositable() public view returns (uint256) {
        uint256 poolLimit = poolFundsLimit();
        uint256 _poolFunds = poolFunds();
        if (poolLimit <= _poolFunds || closed() || paused() || !isPpsHealthy(totalPoolTokenSupply(), _poolFunds)) {
            return 0;
        }

        return poolLimit - _poolFunds;
    }

    /**
     * @notice Check liquidity token amount withdrawable by the caller at this time.
     * @dev Return value depends on the callers balance, and is limited by pool liquidity.
     * @param wallet Address of the wallet to check the withdrawable balance of.
     * @return Max amount of liquidity tokens withdrawable by the caller.
     */
    function amountWithdrawable(address wallet) public view returns (uint256) {
        return paused() ? 0 : MathUpgradeable.min(liquidity(), balanceOf(wallet));
    }

    /**
     * @notice Check the staker's balance in the pool.
     * @return Liquidity token balance of the stake.
     */
    function balanceStaked() external view returns (uint256) {
        return sharesToFunds(balances.stakedShares);
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
     * @dev Return value depends on the staked balance and targetStakePercent, and is limited by pool liquidity.
     * @return Max amount of liquidity tokens unstakable by the staker.
     */
    function amountUnstakable() public view returns (uint256) {
        uint256 totalPoolShares = totalPoolTokenSupply();

        if (
            paused() ||
            config.targetStakePercent >= SaplingMath.HUNDRED_PERCENT && totalPoolShares > balances.stakedShares
        ) {
            return 0;
        } else if (closed() || totalPoolShares == balances.stakedShares) {
            return MathUpgradeable.min(liquidity(), sharesToFunds(balances.stakedShares));
        }

        uint256 lenderShares = totalPoolShares - balances.stakedShares;
        uint256 lockedStakeShares = MathUpgradeable.mulDiv(
            lenderShares,
            config.targetStakePercent,
            SaplingMath.HUNDRED_PERCENT - config.targetStakePercent
        );

        return MathUpgradeable.min(liquidity(), sharesToFunds(balances.stakedShares - lockedStakeShares));
    }

    /**
     * @notice Current liquidity available for pool strategies such as lending or investing.
     * @return Strategy liquidity amount.
     */
    function strategyLiquidity() public view returns (uint256) {

        uint256 lenderAllocatedLiquidity = MathUpgradeable.mulDiv(
                poolFunds(),
                config.targetLiquidityPercent,
                SaplingMath.HUNDRED_PERCENT
        );

        uint256 rawLiquidity = liquidity();

        return rawLiquidity > lenderAllocatedLiquidity
            ? rawLiquidity - lenderAllocatedLiquidity
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
     *      If the caller is the staker, entered funds are considered staked.
     *      New pool tokens are minted in a way that will not influence the current share price.
     * @dev Shares are equivalent to pool tokens and are represented by them.
     * @param amount Liquidity token amount to add to the pool on behalf of the caller.
     * @return Amount of pool tokens minted and allocated to the caller.
     */
    function enter(uint256 amount) private nonReentrant returns (uint256) {
        //// check
        uint256 _poolFunds = poolFunds();
        uint256 totalShares = totalPoolTokenSupply();

        require(isPpsHealthy(totalShares, _poolFunds), "SaplingPoolContext: share price too low");
        require(amount >= 10 ** tokenConfig.decimals, "SaplingPoolContext: entry amount too low");

        bool isStaker = msg.sender == staker;
        
        //// effect

        uint256 shares = fundsToShares(amount);

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
    function exit(uint256 amount) private nonReentrant returns (uint256) {
        //// check
        require(amount > 0, "SaplingPoolContext: exit amount is 0");

        uint256 shares = fundsToShares(amount);

        bool isStaker = msg.sender == staker;

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

        //// interactions

        // burn shares
        IPoolToken(tokenConfig.poolToken).burn(isStaker ? address(this) : msg.sender, shares);

        // transfer funds
        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(tokenConfig.liquidityToken), msg.sender, transferAmount);

        return shares;
    }

    /**
     * @notice Get funds value of shares.
     * @param shares Pool token amount
     * @return Converted liquidity token value
     */
    function sharesToFunds(uint256 shares) public view returns (uint256) {
        uint256 _poolFunds = poolFunds();
        if (shares == 0 || _poolFunds == 0) {
             return 0;
        }

        return MathUpgradeable.mulDiv(shares, _poolFunds, totalPoolTokenSupply());
    }

    /**
     * @notice Get share value of funds.
     * @dev For use in all cases except for defaults. Use fundsToSharesBase for default calculations instead.
     * @param funds Amount of liquidity tokens
     * @return Converted pool token value
     */
    function fundsToShares(uint256 funds) public view returns (uint256) {
        uint256 totalPoolTokens = totalPoolTokenSupply();
        uint256 _poolFunds = poolFunds();

        if (totalPoolTokens == 0) {
            // a pool with no positions has 1:1 conversion rate
            return funds;
        }

        return MathUpgradeable.mulDiv(funds, totalPoolTokens, _poolFunds);
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
     * @notice Current amount of liquidity tokens in the pool, including liquid, in strategies, and settled yield
     */
    function poolFunds() public view returns (uint256) {
        return liquidity() + strategizedFunds() + balances.preSettledYield;
    }

    /**
     * @notice Lending pool raw liquidity, same as the liquidity token balance.
     * @dev Encapsulated in to a function to reduce compiled contract size.
     */
    function liquidity() public view returns (uint256) {
        return IERC20(tokenConfig.liquidityToken).balanceOf(address(this));
    }

    /**
     * @notice Current amount of liquidity tokens in strategies, including both allocated and committed
     *         but excluding pending yield.
     * @dev Implement in the extending contract that handles the strategy, i.e. Lending pool.
     */
    function strategizedFunds() internal virtual view returns (uint256);

    /**
     * @notice Settle pending yield.
     * @dev Calculates interest due since last update and increases preSettledYield,
     *      taking into account the protocol fee and the staker earnings.
     *      Implement in the Lending Pool.
     */
    function settleYield() public virtual;

    /**
     * @notice APY breakdown given a specified scenario.
     * @dev Represent percentage parameter values in contract specific format.
     * @param _totalPoolTokens total pull token supply. For current conditions use: totalPoolTokenSupply()
     * @param _stakedTokens the amount of staked pool tokens. Must be less than or equal to _totalPoolTokens. 
     *                      For current conditions use: balances.stakedShares
     * @param _poolFunds liquidity token funds that make up the pool. For current conditions use: poolFunds()
     * @param _strategizedFunds part of the pool funds that will remain in strategies. Must be less than or equal to 
     *                          _poolFunds. For current conditions use: strategizedFunds()
     * @param _avgStrategyAPR Weighted average APR of the funds in strategies. 
     *                        For current conditions use: ILoanDesk(loanDesk).weightedAvgAPR()
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
        uint32 _protocolFeePercent,
        uint32 _stakerEarnFactor
    ) 
        public 
        pure 
        returns (APYBreakdown memory) 
    {
        require(_stakedTokens <= _totalPoolTokens, "SaplingPoolContext: invalid _stakedTokens");
        require(_strategizedFunds <= _poolFunds, "SaplingPoolContext: invalid _strategizedFunds");
        require(
            _protocolFeePercent <= SaplingMath.MAX_PROTOCOL_FEE_PERCENT,
            "SaplingPoolContext: invalid _protocolFeePercent"
        );
        require(
            _stakerEarnFactor >= SaplingMath.HUNDRED_PERCENT,
            "SaplingPoolContext: invalid _stakerEarnFactor"
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
            totalPoolAPY: uint32(poolAPY),
            protocolRevenueComponent: uint32(protocolAPY),
            stakerEarningsComponent: uint32(stakerWithdrawableAPY),
            lenderComponent: uint32(_lenderAPY)
        });
    }

    /**
     * @dev Checks if given values of total shares and funds maintain acceptable conversion rate for pool entries.
     *
     *      Set PPS_RATE_CHECK_DIVISOR as a divisor derived from a percentage.
     *      i.e. When the PPS_RATE_CHECK_DIVISOR is 20, method returns false if PPS has fallen over 95% from initial rate.
     * @param shares Total pool shares
     * @param funds Total pool funds
     * @return Returns true if price per share is greater than or equal to the required minimum, false otherwise
     */
    function isPpsHealthy(uint256 shares, uint256 funds) private pure returns (bool) {
        return funds * SaplingMath.PPS_RATE_CHECK_DIVISOR >= shares;
    }

    /**
     * @dev External accessor for library level percent decimals.
     */
    function percentDecimals() external pure returns (uint8) {
        return SaplingMath.PERCENT_DECIMALS;
    }

    /**
     * @dev Slots reserved for future state variables
     */
    uint256[43] private __gap;
}
