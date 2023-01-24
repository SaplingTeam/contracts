// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

interface IPoolContext {

    /// Tokens configuration
    struct TokenConfig {

        /// Address of an ERC20 token managed and issued by the pool
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

        /// Governance set upper bound for the manager's leveraged earn factor
        uint16 managerEarnFactorMax;


        // Pool manager maintained parameters

        /// Manager's leveraged earn factor represented as a percentage
        uint16 managerEarnFactor;

        /// Target percentage of pool funds to keep liquid.
        uint16 targetLiquidityPercent;


        // Auto or pseudo-constant parameters

        /// Weighted average loan APR on the borrowed funds
        uint16 weightedAvgStrategyAPR;

        /// exit fee percentage
        uint16 exitFeePercent;
    }

    /// Key pool balances
    struct PoolBalance {

        /// Total liquidity tokens currently held by this contract
        uint256 tokenBalance;

        /// Current amount of liquid tokens, available to for pool strategies, withdrawals, withdrawal requests
        uint256 rawLiquidity;

        /// Current amount of liquidity tokens in the pool, including both liquid and allocated funds
        uint256 poolFunds;

        /// Current funds allocated for pool strategies
        uint256 allocatedFunds;

        /// Current funds committed to strategies such as borrowing or investing
        uint256 strategizedFunds;

        /// Withdrawal request
        uint256 withdrawalRequestedShares; 


        // Role specific balances

        /// Manager's staked shares
        uint256 stakedShares;

        /// Accumulated manager revenue from leveraged earnings, withdrawable
        uint256 managerRevenue;

        /// Accumulated protocol revenue, withdrawable
        uint256 protocolRevenue;
    }

    /// Per user state for all of the user's withdrawal requests
    struct WithdrawalRequestState {
        uint256 sharesLocked;
        uint8 countOutstanding;
    }

    /// Helper struct for APY views
    struct APYBreakdown {

        /// Total pool APY
        uint16 totalPoolAPY;

        /// part of the pool APY allocated as protool revenue
        uint16 protocolRevenueComponent;

        /// part of the pool APY allocated as manager revenue
        uint16 managerRevenueComponent;

        /// part of the pool APY allocated as lender APY. Lender APY also applies manager's non-revenue yield on stake.
        uint16 lenderComponent;
    }

    /// Event for when the lender capital is lost due to defaults
    event SharedLenderLoss(uint256 fromLoanId, uint256 amount);

    /// Event for when the staker's funds are lost due to defaults or closures
    event StakerLoss(uint256 fromLoanId, uint256 amount);

    /// Event for when the Manager's staked assets are depleted due to defaults
    event StakedFundsDepleted();

    /// Event for when lender funds are deposited
    event FundsDeposited(address wallet, uint256 amount, uint256 sharesIssued);

    /// Event for when lender funds are withdrawn
    event FundsWithdrawn(address wallet, uint256 amount, uint256 sharesRedeemed);

    /// Event for when pool manager funds are staked
    event FundsStaked(address wallet, uint256 amount, uint256 sharesIssued);

    /// Event for when pool manager funds are unstaked
    event FundsUnstaked(address wallet, uint256 amount, uint256 sharesRedeemed);

    /// Event for when the protocol revenue is collected
    event ProtocolRevenueCollected(address wallet, uint256 amount);

    /// Event for when the staker earnings are collected
    event StakerEarningsCollected(address wallet, uint256 amount);

    /// Event for when a new withdrawal request is made
    event WithdrawalRequested(uint256 id, address wallet, uint256 sharesLocked);

    /// Event for when a withdrawal request amount is updated
    event WithdrawalRequestUpdated(uint256 id, address wallet, uint256 prevSharesLocked, uint256 sharesLocked);

    /// Event for when a withdrawal request is cancelled
    event WithdrawalRequestCancelled(uint256 id, address wallet);

    /// Event for when a withdrawal request is fully fulfilled 
    event WithdrawalRequestFulfilled(uint256 id, address wallet, uint256 amount);

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

    /**
     * @notice Get liquidity token value of shares.
     * @param poolTokens Pool token amount.
     * @return Converted liqudity token value.
     */
    function tokensToFunds(uint256 poolTokens) external view returns (uint256);

    /**
     * @notice Get pool token value of liquidity tokens.
     * @param liquidityTokens Amount of liquidity tokens.
     * @return Converted pool token value.
     */
    function fundsToTokens(uint256 liquidityTokens) external view returns (uint256);
}