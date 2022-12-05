// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

interface IPoolContext {

    struct TokenConfig {

        /// Address of an ERC20 token managed and issued by the pool
        address poolToken;

        /// Address of an ERC20 liquidity token accepted by the pool
        address liquidityToken;

        /// decimals value retrieved from the liquidity token contract upon contract construction
        uint8 decimals;
    }

    struct PoolConfig {

        // auto or psuedoconstant parameters

        /// MAX amount of liquidity tokens allowed in the pool based on staked assets
        uint256 poolFundsLimit;

        /// exit fee percentage
        uint16 exitFeePercent;

        /// An upper bound for percentage of paid interest to be allocated as protocol fee
        uint16 maxProtocolFeePercent;


        // governance maintained parameters
        
        /// Target percentage ratio of staked shares to total shares
        uint16 targetStakePercent;

        /// Percentage of paid interest to be allocated as protocol fee
        uint16 protocolFeePercent;

        /// Governance set upper bound for the manager's leveraged earn factor
        uint16 managerEarnFactorMax;


        // pool manager maintained parameters

        /// Manager's leveraged earn factor represented as a percentage
        uint16 managerEarnFactor;

        /// Target percentage of pool funds to keep liquid.
        uint16 targetLiquidityPercent;
    }

    struct PoolBalance {

        /// Total liquidity tokens currently held by this contract
        uint256 tokenBalance;

        /// Current amount of liquidity tokens in the pool, including both liquid and allocated funds
        uint256 poolFunds;

        /// Current amount of liquid tokens, available to for pool strategies, withdrawals, withdrawal requests
        uint256 rawLiquidity;

        /// Current funds allocated for pool strategies
        uint256 allocatedFunds;

        /// Current funds committed to strategies such as borrowing or investing
        uint256 strategizedFunds;

        /// Withdrawal request
        uint256 withdrawalRequestedShares; 

        /// Manager's staked shares
        uint256 stakedShares;

        uint256 protocolRevenue;
        
        uint256 managerRevenue;
    }

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
     * @dev Shares are equivalent to pool tokens and are represented by them.
     * @param shares Amount of shares
     */
    function sharesToTokens(uint256 shares) external view returns (uint256);

    /**
     * @notice Get a share value of liquidity tokens.
     * @dev Shares are equivalent to pool tokens and are represented by them.
     * @param tokens Amount of liquidity tokens.
     */
    function tokensToShares(uint256 tokens) external view returns (uint256);
}