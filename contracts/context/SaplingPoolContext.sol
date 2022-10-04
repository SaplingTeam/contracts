// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../interfaces/IPoolToken.sol";
import "./SaplingManagerContext.sol";

/**
 * @title Sapling Pool Context
 * @notice Provides common pool functionality with lender deposits, manager's first loss capital staking,
 *         and reward distribution.
 */
abstract contract SaplingPoolContext is SaplingManagerContext, ReentrancyGuardUpgradeable {

    using SafeMathUpgradeable for uint256;

    /// Address of an ERC20 token managed and issued by the pool
    address public poolToken;

    /// Address of an ERC20 liquidity token accepted by the pool
    address public liquidityToken;

    /// tokenDecimals value retrieved from the liquidity token contract upon contract construction
    uint8 public tokenDecimals;

    /// A value representing 1.0 token amount, padded with zeros for decimals
    uint256 public oneToken;

    /// Total liquidity tokens currently held by this contract
    uint256 public tokenBalance;

    /// MAX amount of liquidity tokens allowed in the pool based on staked assets
    uint256 public poolFundsLimit;

    /// Current amount of liquidity tokens in the pool, including both liquid and allocated funds
    uint256 public poolFunds;

    /// Current amount of liquid tokens, available to for pool strategies or withdrawals
    uint256 public poolLiquidity;

    /// Current funds allocated for pool strategies
    uint256 public allocatedFunds;

    /// Current funds committed to strategies such as borrowing or investing
    uint256 public strategizedFunds;

    /// Manager's staked shares
    uint256 public stakedShares;

    /// Target percentage ratio of staked shares to total shares
    uint16 public targetStakePercent;

    /// Target percentage of pool funds to keep liquid.
    uint16 public targetLiquidityPercent;

    /// exit fee percentage
    uint256 public exitFeePercent;

    /// Manager's leveraged earn factor represented as a percentage
    uint16 public managerEarnFactor;

    /// Governance set upper bound for the manager's leveraged earn factor
    uint16 public managerEarnFactorMax;

    /// Part of the managers leverage factor, earnings of witch will be allocated for the manager as protocol earnings.
    /// This value is always equal to (managerEarnFactor - oneHundredPercent)
    uint256 internal managerExcessLeverageComponent;

    /// Percentage of paid interest to be allocated as protocol fee
    uint16 public protocolFeePercent;

    /// An upper bound for percentage of paid interest to be allocated as protocol fee
    uint16 public maxProtocolFeePercent;

    /// Protocol revenues of non-user addresses
    mapping(address => uint256) internal nonUserRevenues;

    /// Weighted average loan APR on the borrowed funds
    uint256 internal weightedAvgStrategyAPR;

    /// Strategy id generator counter
    uint256 private nextStrategyId;

    /// Event for when the lender capital is lost due to defaults
    event UnstakedLoss(uint256 amount);

    /// Event for when the Manager's staked assets are depleted due to defaults
    event StakedAssetsDepleted();

    /**
     * @notice Creates a SaplingPoolContext.
     * @dev Addresses must not be 0.
     * @param _poolToken ERC20 token contract address to be used as the pool issued token.
     * @param _liquidityToken ERC20 token contract address to be used as pool liquidity currency.
     * @param _governance Governance address
     * @param _treasury Treasury wallet address
     * @param _manager Manager address
     */
    function __SaplingPoolContext_init(address _poolToken,
        address _liquidityToken,
        address _governance,
        address _treasury,
        address _manager
    )
        internal
        onlyInitializing
    {
        __SaplingManagerContext_init(_governance, _treasury, _manager);

        /*
            Additional check for single init:
                do not init again if a non-zero value is present in the values yet to be initialized.
        */
        assert(poolToken == address(0) && liquidityToken == address(0));

        require(_poolToken != address(0), "SaplingPoolContext: pool token address is not set");
        require(_liquidityToken != address(0), "SaplingPoolContext: liquidity token address is not set");
        assert(IERC20(_poolToken).totalSupply() == 0);

        poolToken = _poolToken;
        liquidityToken = _liquidityToken;

        tokenBalance = 0;
        stakedShares = 0;

        poolFundsLimit = 0;
        poolFunds = 0;
        poolLiquidity = 0;
        allocatedFunds = 0;
        strategizedFunds = 0;

        targetStakePercent = uint16(10 * 10 ** percentDecimals); //10%
        targetLiquidityPercent = 0; //0%

        exitFeePercent = oneHundredPercent / 200; // 0.5%

        maxProtocolFeePercent = uint16(10 * 10 ** percentDecimals); // 10% by default; safe min 0%, max 10%
        protocolFeePercent = maxProtocolFeePercent;

        managerEarnFactorMax = uint16(1000 * 10 ** percentDecimals); // 1000% or 10x leverage by default
        managerEarnFactor = uint16(150 * 10 ** percentDecimals);
        managerExcessLeverageComponent = uint256(managerEarnFactor).sub(oneHundredPercent);

        uint8 decimals = IERC20Metadata(liquidityToken).decimals();
        tokenDecimals = decimals;
        oneToken = 10 ** decimals;

        weightedAvgStrategyAPR = 0;
        nextStrategyId = 1;
    }

    /**
     * @notice Set the target stake percent for the pool.
     * @dev _targetStakePercent must be inclusively between 0 and oneHundredPercent.
     *      Caller must be the governance.
     * @param _targetStakePercent New target stake percent.
     */
    function setTargetStakePercent(uint16 _targetStakePercent) external onlyGovernance {
        require(0 < _targetStakePercent && _targetStakePercent <= oneHundredPercent,
            "SaplingPoolContext: target stake percent is out of bounds");
        targetStakePercent = _targetStakePercent;
        updatePoolLimit();
    }

    /**
     * @notice Set the target liquidity percent for the pool.
     * @dev _targetLiquidityPercent must be inclusively between 0 and oneHundredPercent.
     *      Caller must be the manager.
     * @param _targetLiquidityPercent new target liquidity percent.
     */
    function setTargetLiquidityPercent(uint16 _targetLiquidityPercent) external onlyManager {
        require(0 <= _targetLiquidityPercent && _targetLiquidityPercent <= oneHundredPercent,
            "SaplingPoolContext: target liquidity percent is out of bounds");
        targetLiquidityPercent = _targetLiquidityPercent;
    }

    /**
     * @notice Set the protocol earning percent for the pool.
     * @dev _protocolEarningPercent must be inclusively between 0 and maxProtocolFeePercent.
     *      Caller must be the governance.
     * @param _protocolEarningPercent new protocol earning percent.
     */
    function setProtocolEarningPercent(uint16 _protocolEarningPercent) external onlyGovernance {
        require(0 <= _protocolEarningPercent && _protocolEarningPercent <= maxProtocolFeePercent,
            "SaplingPoolContext: protocol earning percent is out of bounds");
        protocolFeePercent = _protocolEarningPercent;
    }

    /**
     * @notice Set an upper bound for the manager's earn factor percent.
     * @dev _managerEarnFactorMax must be greater than or equal to oneHundredPercent. If the current earn factor is
     *      greater than the new maximum, then the current earn factor is set to the new maximum.
     *      Caller must be the governance.
     * @param _managerEarnFactorMax new maximum for manager's earn factor.
     */
    function setManagerEarnFactorMax(uint16 _managerEarnFactorMax) external onlyGovernance {
        require(oneHundredPercent <= _managerEarnFactorMax ,
            "SaplingPoolContext: _managerEarnFactorMax is out of bounds");
        managerEarnFactorMax = _managerEarnFactorMax;

        if (managerEarnFactor > managerEarnFactorMax) {
            managerEarnFactor = managerEarnFactorMax;
            managerExcessLeverageComponent = uint256(managerEarnFactor).sub(oneHundredPercent);
        }
    }

    /**
     * @notice Set the manager's earn factor percent.
     * @dev _managerEarnFactorMax must be inclusively between oneHundredPercent and managerEarnFactorMax.
     *      Caller must be the manager.
     * @param _managerEarnFactor new manager's earn factor.
     */
    function setManagerEarnFactor(uint16 _managerEarnFactor) external onlyManager whenNotPaused {
        require(oneHundredPercent <= _managerEarnFactor && _managerEarnFactor <= managerEarnFactorMax,
            "SaplingPoolContext: _managerEarnFactor is out of bounds");
        managerEarnFactor = _managerEarnFactor;
        managerExcessLeverageComponent = uint256(managerEarnFactor).sub(oneHundredPercent);
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
        enterPool(amount);
    }

    /**
     * @notice Withdraw liquidity tokens from the pool. Withdrawals redeem equivalent amount of the caller's pool tokens
     *         by burning the tokens in question.
     *         Exact exchange rate depends on the current pool state.
     * @dev Withdrawal amount must be non zero and not exceed amountWithdrawable().
     * @param amount Liquidity token amount to withdraw.
     */
    function withdraw(uint256 amount) external whenNotPaused {
        require(msg.sender != manager, "SaplingPoolContext: pool manager address cannot use withdraw");

        exitPool(amount);
    }

    /**
     * @notice Stake liquidity tokens into the pool. Staking liquidity tokens will mint an equivalent amount of pool
     *         tokens and lock them in the pool. Exact exchange rate depends on the current pool state.
     * @dev Caller must be the manager.
     *      Stake amount must be non zero.
     *      An appropriate spend limit must be present at the token contract.
     * @param amount Liquidity token amount to stake.
     */
    function stake(uint256 amount) external onlyManager whenNotPaused whenNotClosed {
        require(amount > 0, "SaplingPoolContext: stake amount is 0");

        uint256 shares = enterPool(amount);
        stakedShares = stakedShares.add(shares);
        updatePoolLimit();
    }

    /**
     * @notice Unstake liquidity tokens from the pool. Unstaking redeems equivalent amount of the caller's pool tokens
     *         locked in the pool by burning the tokens in question.
     * @dev Caller must be the manager.
     *      Unstake amount must be non zero and not exceed amountUnstakable().
     * @param amount Liquidity token amount to unstake.
     */
    function unstake(uint256 amount) external onlyManager whenNotPaused {
        require(amount > 0, "SaplingPoolContext: unstake amount is 0");
        require(amount <= amountUnstakable(), "SaplingPoolContext: requested amount is not available for unstaking");

        exitPool(amount);
    }

    /**
     * @notice Withdraws protocol revenue belonging to the caller.
     * @dev revenueBalanceOf(msg.sender) must be greater than 0.
     *      Caller's all accumulated earnings will be withdrawn.
     *      Protocol earnings are represented in liquidity tokens.
     */
    function withdrawRevenue() external whenNotPaused {
        require(nonUserRevenues[msg.sender] > 0, "SaplingPoolContext: zero protocol earnings");
        uint256 amount = nonUserRevenues[msg.sender];
        nonUserRevenues[msg.sender] = 0;

        // give tokens
        tokenBalance = tokenBalance.sub(amount);
        bool success = IERC20(liquidityToken).transfer(msg.sender, amount);
        require(success, "SaplingPoolContext: ERC20 transfer failed");
    }

    /**
     * @notice Check liquidity token amount depositable by lenders at this time.
     * @dev Return value depends on the pool state rather than caller's balance.
     * @return Max amount of tokens depositable to the pool.
     */
    function amountDepositable() external view returns (uint256) {
        if (poolFundsLimit <= poolFunds || closed() || paused()) {
            return 0;
        }

        return poolFundsLimit.sub(poolFunds);
    }

    /**
     * @notice Check liquidity token amount withdrawable by the caller at this time.
     * @dev Return value depends on the callers balance, and is limited by pool liquidity.
     * @param wallet Address of the wallet to check the withdrawable balance of.
     * @return Max amount of tokens withdrawable by the caller.
     */
    function amountWithdrawable(address wallet) external view returns (uint256) {
        return paused() ? 0 : MathUpgradeable.min(poolLiquidity, balanceOf(wallet));
    }

    /**
     * @notice Check the manager's staked liquidity token balance in the pool.
     * @return Liquidity token balance of the manager's stake.
     */
    function balanceStaked() external view returns (uint256) {
        return sharesToTokens(stakedShares);
    }

    /**
     * @notice Check the special addresses' revenue from the protocol.
     * @dev This method is useful for manager and protocol addresses.
     *      Calling this method for a non-protocol associated addresses will return 0.
     * @param wallet Address of the wallet to check the earnings balance of.
     * @return Accumulated liquidity token revenue of the wallet from the protocol.
     */
    function revenueBalanceOf(address wallet) external view returns (uint256) {
        return nonUserRevenues[wallet];
    }

    /**
     * @notice Estimated lender APY given the current pool state.
     * @return Estimated current lender APY
     */
    function currentLenderAPY() external view returns (uint16) {
        return lenderAPY(strategizedFunds, weightedAvgStrategyAPR);
    }

    /**
     * @notice Projected lender APY given the current pool state and a specific strategy rate and an average apr.
     * @dev Represent percentage parameter values in contract specific format.
     * @param strategyRate Percentage of pool funds projected to be used in strategies.
     * @return Projected lender APY
     */
    function projectedLenderAPY(uint16 strategyRate, uint256 _avgStrategyAPR) external view returns (uint16) {
        require(strategyRate <= oneHundredPercent, "SaplingPoolContext: invalid borrow rate");
        return lenderAPY(MathUpgradeable.mulDiv(poolFunds, strategyRate, oneHundredPercent), _avgStrategyAPR);
    }

    /**
     * @notice Check wallet's liquidity token balance in the pool. This balance includes deposited balance and acquired
     *         yield. This balance does not included staked balance, leveraged revenue or protocol revenue.
     * @param wallet Address of the wallet to check the balance of.
     * @return Liquidity token balance of the wallet in this pool.
     */
    function balanceOf(address wallet) public view returns (uint256) {
        return sharesToTokens(IPoolToken(poolToken).balanceOf(wallet));
    }

    /**
     * @notice Check liquidity token amount unstakable by the manager at this time.
     * @dev Return value depends on the manager's stake balance and targetStakePercent, and is limited by pool
     *      liquidity.
     * @return Max amount of tokens unstakable by the manager.
     */
    function amountUnstakable() public view returns (uint256) {
        uint256 totalPoolShares = IERC20(poolToken).totalSupply();
        if (paused() || targetStakePercent >= oneHundredPercent && totalPoolShares > stakedShares) {
            return 0;
        } else if (closed() || totalPoolShares == stakedShares) {
            return MathUpgradeable.min(poolLiquidity, sharesToTokens(stakedShares));
        }

        uint256 lenderShares = totalPoolShares.sub(stakedShares);
        uint256 lockedStakeShares = MathUpgradeable.mulDiv(
            lenderShares,
            targetStakePercent,
            oneHundredPercent - targetStakePercent
        );

        return MathUpgradeable.min(poolLiquidity, sharesToTokens(stakedShares.sub(lockedStakeShares)));
    }

    /**
     * @notice Current liquidity available for pool strategies such as lending or investing.
     * @return Strategy liquidity amount.
     */
    function strategyLiquidity() public view returns (uint256) {
        uint256 lenderAllocatedLiquidity = MathUpgradeable.mulDiv(poolFunds, targetLiquidityPercent, oneHundredPercent);

        if (poolLiquidity <= lenderAllocatedLiquidity) {
            return 0;
        }

        return poolLiquidity.sub(lenderAllocatedLiquidity);
    }

    /**
     * @dev Generator for next strategy id. i.e. loan, investment.
     * @return Next available id.
     */
    function getNextStrategyId() internal nonReentrant returns (uint256) {
        uint256 id = nextStrategyId;
        nextStrategyId++;
        return id;
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
    function enterPool(uint256 amount) internal nonReentrant returns (uint256) {
        require(amount > 0, "SaplingPoolContext: pool deposit amount is 0");

        // allow the manager to add funds beyond the current pool limit
        require(msg.sender == manager || (poolFundsLimit > poolFunds && amount <= poolFundsLimit.sub(poolFunds)),
            "SaplingPoolContext: deposit amount is over the remaining pool limit");

        uint256 shares = tokensToShares(amount);

        // charge 'amount' tokens from msg.sender
        bool success = IERC20(liquidityToken).transferFrom(msg.sender, address(this), amount);
        require(success, "SaplingPoolContext: ERC20 transfer failed");
        tokenBalance = tokenBalance.add(amount);

        poolLiquidity = poolLiquidity.add(amount);
        poolFunds = poolFunds.add(amount);

        // mint shares
        IPoolToken(poolToken).mint(msg.sender != manager ? msg.sender : address(this), shares);

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
    function exitPool(uint256 amount) internal returns (uint256) {
        require(amount > 0, "SaplingPoolContext: pool withdrawal amount is 0");
        require(poolLiquidity >= amount, "SaplingPoolContext: insufficient liquidity");

        uint256 shares = tokensToShares(amount);

        require(msg.sender != manager ? shares <= IERC20(poolToken).balanceOf(msg.sender) : shares <= stakedShares,
            "SaplingPoolContext: insufficient balance");

        if (msg.sender == manager) {
            stakedShares = stakedShares.sub(shares);
            updatePoolLimit();
        }

        // burn shares
        IPoolToken(poolToken).burn(msg.sender != manager ? msg.sender : address(this), shares);

        uint256 transferAmount = amount.sub(MathUpgradeable.mulDiv(amount, exitFeePercent, oneHundredPercent));

        poolFunds = poolFunds.sub(transferAmount);
        poolLiquidity = poolLiquidity.sub(transferAmount);

        tokenBalance = tokenBalance.sub(transferAmount);
        bool success = IERC20(liquidityToken).transfer(msg.sender, transferAmount);
        require(success, "SaplingPoolContext: ERC20 transfer failed");

        return shares;
    }

    /**
     * @dev Internal method to update the pool funds limit based on the staked funds.
     */
    function updatePoolLimit() internal {
        poolFundsLimit = sharesToTokens(MathUpgradeable.mulDiv(stakedShares, oneHundredPercent, targetStakePercent));
    }

    /**
     * @notice Get liquidity token value of shares.
     * @dev Shares are equivalent to pool tokens and are represented by them.
     * @param shares Amount of shares
     */
    function sharesToTokens(uint256 shares) internal view returns (uint256) {
        if (shares == 0 || poolFunds == 0) {
             return 0;
        }

        return MathUpgradeable.mulDiv(shares, poolFunds, IERC20(poolToken).totalSupply());
    }

    /**
     * @notice Get a share value of liquidity tokens.
     * @dev Shares are equivalent to pool tokens and are represented by them.
     * @param tokens Amount of liquidity tokens.
     */
    function tokensToShares(uint256 tokens) internal view returns (uint256) {
        uint256 totalPoolShares = IERC20(poolToken).totalSupply();

        if (totalPoolShares == 0) {
            // a pool with no positions
            return tokens;
        } else if (poolFunds == 0) {
            /*
                Handle failed pool case, where: poolFunds == 0, but totalPoolShares > 0
                To minimize loss for the new depositor, assume the total value of existing shares is the minimum
                possible nonzero integer, which is 1.

                Simplify (tokens * totalPoolShares) / 1 as tokens * totalPoolShares.
            */
            return tokens.mul(totalPoolShares);
        }

        return MathUpgradeable.mulDiv(tokens, totalPoolShares, poolFunds);
    }

    /**
     * @dev All time count of created strategies. i.e. Loans and investments
     */
    function strategyCount() internal view returns(uint256) {
        return nextStrategyId - 1;
    }

    /**
     * @notice Lender APY given the current pool state, a specific strategized funds, and an average apr.
     * @dev Represent percentage parameter values in contract specific format.
     * @param _strategizedFunds Pool funds to be borrowed annually.
     * @return Lender APY
     */
    function lenderAPY(uint256 _strategizedFunds, uint256 _avgStrategyAPR) internal view returns (uint16) {
        if (poolFunds == 0 || _strategizedFunds == 0 || _avgStrategyAPR == 0) {
            return 0;
        }

        // pool APY
        uint256 poolAPY = MathUpgradeable.mulDiv(_avgStrategyAPR, _strategizedFunds, poolFunds);

        // protocol APY
        uint256 protocolAPY = MathUpgradeable.mulDiv(poolAPY, protocolFeePercent, oneHundredPercent);

        uint256 remainingAPY = poolAPY.sub(protocolAPY);

        // manager withdrawableAPY
        uint256 currentStakePercent = MathUpgradeable.mulDiv(
            stakedShares,
            oneHundredPercent,
            IERC20(poolToken).totalSupply()
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

        return uint16(remainingAPY.sub(managerWithdrawableAPY));
    }

    /**
     * @notice Check if the pool is functional based on the current stake levels.
     * @return True if the staked funds provide at least a minimum ratio to the pool funds, False otherwise.
     */
    function isPoolFunctional() internal view returns (bool) {
        return !(paused() || closed())
            && stakedShares >= MathUpgradeable.mulDiv(
                IERC20(poolToken).totalSupply(),
                targetStakePercent,
                oneHundredPercent
            );
    }


    /**
     * @dev Implementation of the abstract hook in SaplingManagedContext.
     *      Governance, protocol wallet addresses and lenders with at least 1.00 liquidity tokens are authorised to take
     *      certain actions when the manager is inactive.
     */
    function authorizedOnInactiveManager(address caller) internal view override returns (bool) {
        return isNonUserAddress(caller) || sharesToTokens(IERC20(poolToken).balanceOf(caller)) >= oneToken;
    }

    /**
     * @dev Implementation of the abstract hook in SaplingManagedContext.
     *      Pool can be close when no funds remain committed to strategies.
     */
    function canClose() internal view override returns (bool) {
        return strategizedFunds == 0;
    }
}
