// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @title SaplingPoolContext Interface
 */
interface IPoolContext {

    /// Tokens configuration
    struct TokenConfig {

        /// Address of an ERC20 token issued by the pool
        address poolToken;

        /// Address of an ERC20 liquidity token accepted by the pool
        address liquidityToken;

        /// Decimals value retrieved from the liquidity token contract upon contract construction
        uint8 decimals;
    }

    /// Pool configuration
    struct PoolConfig {
        // Governance maintained parameters

        /// Minimum liquidity token amount for withdrawal requests
        uint256 minWithdrawalRequestAmount;
        
        /// Target percentage ratio of staked shares to total shares
        uint32 targetStakePercent;

        /// Percentage of paid interest to be allocated as protocol fee
        uint32 protocolFeePercent;

        /// Governance set upper bound for the staker's leveraged earn factor
        uint32 stakerEarnFactorMax;


        // Staker maintained parameters

        /// Staker's leveraged earn factor represented as a percentage
        uint32 stakerEarnFactor;

        /// Target percentage of pool funds to keep liquid.
        uint32 targetLiquidityPercent;


        // Auto or pseudo-constant parameters

        /// exit fee percentage
        uint32 exitFeePercent;
    }

    /// Key pool balances
    struct PoolBalance {

        // The interest yield to be paid to the pool token holders and is included in dynamic poolFunds()
        uint256 preSettledYield;

        // Role specific balances

        /// Staker's shares
        uint256 stakedShares;
    }

    /// Per user withdrawal allowance with a time window
    struct WithdrawalAllowance {
        uint256 amount;
        uint256 timeFrom;
        uint256 timeTo;
    }

    /// Helper struct for APY views
    struct APYBreakdown {

        /// Total pool APY
        uint32 totalPoolAPY;

        /// part of the pool APY allocated as protocol revenue
        uint32 protocolRevenueComponent;

        /// part of the pool APY allocated as staker earnings
        uint32 stakerEarningsComponent;

        /// part of the pool APY allocated as lender APY. Lender APY also includes staker's non-leveraged yield
        uint32 lenderComponent;
    }

    /// Event for when the lender capital is lost due to defaults
    event SharedLenderLoss(uint256 fromLoanId, uint256 amount);

    /// Event for when the staker's funds are lost due to defaults or closures
    event StakerLoss(uint256 fromLoanId, uint256 amount);

    /// Event for when the staked assets are depleted due to defaults
    event StakedFundsDepleted();

    /// Event for when lender funds are deposited
    event FundsDeposited(address wallet, uint256 amount, uint256 sharesIssued);

    /// Event for when lender funds are withdrawn
    event FundsWithdrawn(address wallet, uint256 amount, uint256 sharesRedeemed);

    /// Event for when staker funds are staked
    event FundsStaked(address wallet, uint256 amount, uint256 sharesIssued);

    /// Event for when staker funds are unstaked
    event FundsUnstaked(address wallet, uint256 amount, uint256 sharesRedeemed);

    /// Event for when the staker earnings are transferred
    event StakerEarnings(address wallet, uint256 amount);

    /// Event for when a withdrawal allowance request is made
    event WithdrawalAllowanceRequested(address indexed wallet, uint256 amount, uint256 timeFrom, uint256 timeTo);

    /// Setter event
    event TargetStakePercentSet(uint32 prevValue, uint32 newValue);

    /// Setter event
    event TargetLiquidityPercentSet(uint32 prevValue, uint32 newValue);

    /// Setter event
    event ProtocolFeePercentSet(uint32 prevValue, uint32 newValue);

    /// Setter event
    event StakerEarnFactorMaxSet(uint32 prevValue, uint32 newValue);

    /// Setter event
    event StakerEarnFactorSet(uint32 prevValue, uint32 newValue);

    /**
     * @notice Settle pending yield.
     */
    function settleYield() external;
}