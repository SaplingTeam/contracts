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

        // Auto or pseudo-constant parameters

        /// Weighted average loan APR on the borrowed funds
        uint256 weightedAvgStrategyAPR;

        /// exit fee percentage
        uint16 exitFeePercent;

        /// An upper bound for percentage of paid interest to be allocated as protocol fee
        uint16 maxProtocolFeePercent;


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

    /// Event for when the lender capital is lost due to defaults
    event UnstakedLoss(uint256 amount);

    /// Event for when the Manager's staked assets are depleted due to defaults
    event StakedAssetsDepleted();

    /// Event for when lender funds are deposited
    event FundsDeposited(address wallet, uint256 amount, uint256 tokensIssued);

    /// Event for when lender funds are withdrawn
    event FundsWithdrawn(address wallet, uint256 amount, uint256 tokensRedeemed);

    /// Event for when pool manager funds are staked
    event FundsStaked(address wallet, uint256 amount, uint256 tokensIssued);

    /// Event for when pool manager funds are unstaked
    event FundsUnstaked(address wallet, uint256 amount, uint256 tokensRedeemed);

    /// Event for when a non user revenue is withdrawn
    event RevenueWithdrawn(address wallet, uint256 amount);

    /// Setter event
    event TargetStakePercentSet(uint16 prevValue, uint16 newValue);

    /// Setter event
    event TargetLiqudityPercentSet(uint16 prevValue, uint16 newValue);

    /// Setter event
    event ProtocolFeePercentSet(uint16 prevValue, uint16 newValue);

    /// Setter event
    event ManagerEarnFactorMaxSet(uint16 prevValue, uint16 newValue);

    /// Setter event
    event ManagerEarnFactorSet(uint16 prevValue, uint16 newValue);

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