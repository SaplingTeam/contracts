// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

interface IPoolContext {

    /// Tokens configuration
    struct TokenConfig {

        /// Address of an ERC20 token issued by the pool
        address poolToken;

        /// Address of an ERC20 liquidity token accepted by the pool
        address liquidityToken;

        /// decimals value retrieved from the liquidity token contract upon contract construction
        uint8 decimals;
    }

    /// Pool configuration
    struct PoolConfig {
        // Governance maintained parameters

        /// Minimum liquidity token amount for withdrawal requests
        uint256 minWithdrawalRequestAmount;
        
        /// Target percentage ratio of staked shares to total shares
        uint16 targetStakePercent;

        /// Percentage of paid interest to be allocated as protocol fee
        uint16 protocolFeePercent;

        /// Governance set upper bound for the staker's leveraged earn factor
        uint16 stakerEarnFactorMax;


        // Staker maintained parameters

        /// Staker's leveraged earn factor represented as a percentage
        uint16 stakerEarnFactor;

        /// Target percentage of pool funds to keep liquid.
        uint16 targetLiquidityPercent;


        // Auto or pseudo-constant parameters

        /// exit fee percentage
        uint16 exitFeePercent;
    }

    /// Key pool balances
    struct PoolBalance {

        /// Current amount of liquid tokens, available to for pool strategies, withdrawals, withdrawal requests
        uint256 rawLiquidity;

        /// Current amount of liquidity tokens in the pool, including both liquid and allocated funds
        uint256 poolFunds;

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
        uint16 totalPoolAPY;

        /// part of the pool APY allocated as protool revenue
        uint16 protocolRevenueComponent;

        /// part of the pool APY allocated as staker earnings
        uint16 stakerEarningsComponent;

        /// part of the pool APY allocated as lender APY. Lender APY also includes stakers's non-leveraged yield
        uint16 lenderComponent;
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
    event TargetStakePercentSet(uint16 prevValue, uint16 newValue);

    /// Setter event
    event TargetLiquidityPercentSet(uint16 prevValue, uint16 newValue);

    /// Setter event
    event ProtocolFeePercentSet(uint16 prevValue, uint16 newValue);

    /// Setter event
    event StakerEarnFactorMaxSet(uint16 prevValue, uint16 newValue);

    /// Setter event
    event StakerEarnFactorSet(uint16 prevValue, uint16 newValue);
}