// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "./context/SaplingPoolContext.sol";
import "./interfaces/ILendingPool.sol";
import "./interfaces/ILoanDesk.sol";

/**
 * @title Sapling Lending Pool
 * @dev Extends SaplingPoolContext with lending strategy.
 */
contract SaplingLendingPool is ILendingPool, SaplingPoolContext {

    /// Address of the loan desk contract
    address public loanDesk;

    /// Mark the loans closed to guards against double actions due to future bugs or compromised LoanDesk
    mapping(address => mapping(uint256 => bool)) private loanClosed;

    /// A modifier to limit access only to the loan desk contract
    modifier onlyLoanDesk() {
        require(msg.sender == loanDesk, "SaplingLendingPool: caller is not the LoanDesk");
        _;
    }

    /**
     * @dev Disable initializers
     */
    function disableIntitializers() external onlyRole(SaplingRoles.GOVERNANCE_ROLE) {
        _disableInitializers();
    }

    /**
     * @notice Creates a Sapling pool.
     * @dev Addresses must not be 0.
     * @param _poolToken ERC20 token contract address to be used as the pool issued token.
     * @param _liquidityToken ERC20 token contract address to be used as pool liquidity currency.
     * @param _accessControl Access control contract
     * @param _stakerAddress Staker address
     */
    function initialize(
        address _poolToken,
        address _liquidityToken,
        address _accessControl,
        address _stakerAddress
    )
        public
        initializer
    {
        __SaplingPoolContext_init(_poolToken, _liquidityToken, _accessControl, _stakerAddress);
    }

    /**
     * @notice Links a new loan desk for the pool to use. Intended for use upon initial pool deployment.
     * @dev Caller must be the governance.
     *      This setter may also be used to switch loan desks.
     *      If applicable: Outstanding loan operations must be concluded on the loan desk before the switch.
     * @param _loanDesk New LoanDesk address
     */
    function setLoanDesk(address _loanDesk) external onlyRole(SaplingRoles.GOVERNANCE_ROLE) {
        address prevLoanDesk = loanDesk;
        loanDesk = _loanDesk;
        emit LoanDeskSet(prevLoanDesk, _loanDesk);
    }

    /**
     * @dev Hook for a new loan offer. Caller must be the LoanDesk.
     * @param amount Amount to be allocated for loan offers.
     */
    function onOfferAllocate(uint256 amount) external onlyLoanDesk whenNotPaused whenNotClosed {
        require(amount > 0, "SaplingLendingPool: invalid amount");
        require(strategyLiquidity() >= amount, "SaplingLendingPool: insufficient liquidity");

        balances.rawLiquidity -= amount;

        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(tokenConfig.liquidityToken), loanDesk, amount);

        emit OfferLiquidityAllocated(amount);
    }

    /**
     * @dev Hook for a loan offer amount update. Amount update can be due to offer update or
     *      cancellation. Caller must be the LoanDesk.
     * @param amount Previously allocated amount being returned.
     */
    function onOfferDeallocate(uint256 amount) external onlyLoanDesk whenNotPaused whenNotClosed {
        require(amount > 0, "SaplingLendingPool: invalid amount");

        balances.rawLiquidity += amount;

        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(tokenConfig.liquidityToken),
            loanDesk,
            address(this),
            amount
        );

        emit OfferLiquidityDeallocated(amount);
    }

     /**
     * @dev Hook for repayments. Caller must be the LoanDesk. 
     *      
     *      Parameters besides the loanId exists simply to avoid rereading it from the caller via additional inter
     *      contract call. Avoiding loop call reduces gas, contract bytecode size, and reduces the risk of reentrancy.
     *
     * @param loanId ID of the loan which has just been borrowed
     * @param borrower Borrower address
     * @param payer Actual payer address
     * @param transferAmount Amount chargeable
     * @param interestPayable Amount of interest paid, this value is already included in the payment amount
     */
    function onRepay(
        uint256 loanId, 
        address borrower,
        address payer,
        uint256 transferAmount,
        uint256 interestPayable
    ) 
        external 
        onlyLoanDesk
        nonReentrant
        whenNotPaused
        whenNotClosed
    {
        //// check
        require(loanClosed[loanDesk][loanId] == false, "SaplingLendingPool: loan is closed");

        // @dev trust the loan validity via LoanDesk checks as the only caller authorized is LoanDesk

        //// effect

        uint256 principalPaid;
        uint256 stakerEarnedInterest;
        if (interestPayable == 0) {
            principalPaid = transferAmount;
            balances.rawLiquidity += transferAmount;
            stakerEarnedInterest = 0;
        } else {
            principalPaid = transferAmount - interestPayable;

            //share revenue to treasury
            uint256 protocolEarnedInterest = MathUpgradeable.mulDiv(
                interestPayable,
                config.protocolFeePercent,
                SaplingMath.HUNDRED_PERCENT
            );

            balances.protocolRevenue += protocolEarnedInterest;

            //share earnings to staker
            uint256 currentStakePercent = MathUpgradeable.mulDiv(
                balances.stakedShares,
                SaplingMath.HUNDRED_PERCENT,
                totalPoolTokenSupply()
            );

            uint256 stakerEarningsPercent = MathUpgradeable.mulDiv(
                currentStakePercent,
                config.stakerEarnFactor - SaplingMath.HUNDRED_PERCENT,
                SaplingMath.HUNDRED_PERCENT
            );

            stakerEarnedInterest = MathUpgradeable.mulDiv(
                interestPayable - protocolEarnedInterest,
                stakerEarningsPercent,
                stakerEarningsPercent + SaplingMath.HUNDRED_PERCENT
            );

            balances.rawLiquidity += transferAmount - (protocolEarnedInterest + stakerEarnedInterest);
            balances.poolFunds += interestPayable - (protocolEarnedInterest + stakerEarnedInterest);
        }


        //// interactions

        // charge msg.sender
        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(tokenConfig.liquidityToken),
            payer,
            address(this),
            transferAmount
        );

        // send staker earnings
        if (stakerEarnedInterest > 0) {
            SafeERC20Upgradeable.safeTransfer(
                IERC20Upgradeable(tokenConfig.liquidityToken),
                staker,
                stakerEarnedInterest
            );

            emit StakerEarnings(staker, stakerEarnedInterest);
        }

        emit LoanRepaymentProcessed(loanId, borrower, payer, transferAmount, interestPayable);
    }

    /**
     * @dev Hook for defaulting a loan. Caller must be the LoanDesk. Defaulting a loan will cover the loss using 
     *      the staked funds. If these funds are not sufficient, the lenders will share the loss.
     * @param loanId ID of the loan to default
     * @param loss Loss amount to resolve
     */
    function onDefault(
        uint256 loanId,
        uint256 loss
    )
        external
        onlyLoanDesk
        nonReentrant
        whenNotPaused
        whenNotClosed
        returns (uint256, uint256)
    {
        //// check
        require(loanClosed[loanDesk][loanId] == false, "SaplingLendingPool: loan is closed");

        // @dev trust the loan validity via LoanDesk checks as the only caller authorized is LoanDesk

        //// effect
        loanClosed[loanDesk][loanId] = true;

        uint256 stakerLoss = loss;
        uint256 lenderLoss = 0;

        if (loss > 0) {
            uint256 remainingLostShares = fundsToShares(loss);

            balances.poolFunds -= loss;

            if (balances.stakedShares > 0) {
                uint256 stakedShareLoss = MathUpgradeable.min(remainingLostShares, balances.stakedShares);
                remainingLostShares -= stakedShareLoss;
                balances.stakedShares -= stakedShareLoss;

                if (balances.stakedShares == 0) {
                    emit StakedFundsDepleted();
                }

                //// interactions

                //burn staked shares; this external interaction must happen before calculating lender loss
                IPoolToken(tokenConfig.poolToken).burn(address(this), stakedShareLoss);
            }

            if (remainingLostShares > 0) {
                lenderLoss = sharesToFunds(remainingLostShares);
                stakerLoss -= lenderLoss;

                emit SharedLenderLoss(loanId, lenderLoss);
            }
        }

        return (stakerLoss, lenderLoss);
    }

    /**
     * @notice View indicating whether or not a given loan amount can be offered.
     * @dev Hook for checking if the lending pool can provide liquidity for the total offered loans amount.
     * @param amount Amount to check for new loan allocation
     * @return True if the pool has sufficient lending liquidity, false otherwise
     */
    function canOffer(uint256 amount) external view returns (bool) {
        return !paused() 
            && !closed() 
            && maintainsStakeRatio()
            && amount <= strategyLiquidity();
    }

    /**
     * @notice Indicates whether or not the contract can be opened in it's current state.
     * @dev Overrides a hook in SaplingStakerContext.
     * @return True if the conditions to open are met, false otherwise.
     */
    function canOpen() internal view override returns (bool) {
        return loanDesk != address(0);
    }

    /**
     * @dev Implementation of the abstract hook in SaplingManagedContext.
     *      Pool can be close when no funds remain committed to strategies.
     */
    function canClose() internal view override returns (bool) {
        return ILoanDesk(loanDesk).allocatedFunds() == 0
            && ILoanDesk(loanDesk).lentFunds() == 0;
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
            ILoanDesk(loanDesk).lentFunds(),
            ILoanDesk(loanDesk).weightedAvgAPR(),
            config.protocolFeePercent,
            config.stakerEarnFactor
        );
    }
}
