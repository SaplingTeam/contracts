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

    /// Mark loan funds released flags to guards against double withdrawals due to future bugs or compromised LoanDesk
    mapping(uint256 => bool) private loanFundsReleased;

    /// Mark the loans closed to guards against double actions due to future bugs or compromised LoanDesk
    mapping(uint256 => bool) private loanClosed;

    /// A modifier to limit access to when a loan has the specified status
    modifier loanFundsNotReleased(uint256 loanId) {
        require(loanFundsReleased[loanId] == false, "SaplingLendingPool: loan funds already released");
        _;
    }

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
     * @param _managerRole Manager role
     */
    function initialize(
        address _poolToken,
        address _liquidityToken,
        address _accessControl,
        bytes32 _managerRole
    )
        public
        initializer
    {
        __SaplingPoolContext_init(_poolToken, _liquidityToken, _accessControl, _managerRole);
    }

    /**
     * @notice Links a new loan desk for the pool to use. Intended for use upon initial pool deployment.
     * @dev Caller must be the governance.
     * @param _loanDesk New LoanDesk address
     */
    function setLoanDesk(address _loanDesk) external onlyRole(SaplingRoles.GOVERNANCE_ROLE) {
        address prevLoanDesk = loanDesk;
        loanDesk = _loanDesk;
        emit LoanDeskSet(prevLoanDesk, loanDesk);
    }

    /**
     * @notice Accept a loan offer and withdraw funds
     * @dev Caller must be the loan desk.
     *      Loan funds must not have been released before.
     * @param loanId ID of the loan application to accept the offer of
     */
    function onBorrow(uint256 loanId, address borrower, uint256 amount, uint16 apr) external onlyLoanDesk whenNotClosed whenNotPaused {

        // check
        require(loanFundsReleased[loanId] == false, "SaplingLendingPool: loan funds already released");

        // @dev trust the loan validity via LoanDesk checks as the only caller authorized is LoanDesk

        //// effect

        loanFundsReleased[loanId] = true;
        
        uint256 prevStrategizedFunds = balance.strategizedFunds;
        
        balance.tokenBalance -= amount;
        balance.allocatedFunds -= amount;
        balance.strategizedFunds += amount;

        weightedAvgStrategyAPR = (prevStrategizedFunds * weightedAvgStrategyAPR + amount * apr)
            / balance.strategizedFunds;

        //// interactions

        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(tokenConfig.liquidityToken), borrower, amount);

        emit LoanFundsReleased(loanId, borrower, amount);
    }

    // /**
    //  * @notice Default a loan.
    //  * @dev Loan must be in OUTSTANDING status.
    //  *      Caller must be the manager.
    //  *      canDefault(loanId, msg.sender) must return 'true'.
    //  * @param loanId ID of the loan to default
    //  */
    function onDefault(
        uint256 loanId,
        uint16 apr,
        uint256 carryAmountUsed,
        uint256 loss
    )
        public
        whenNotPaused
        onlyLoanDesk
        returns (uint256, uint256)
    {
        //// check
        require(loanClosed[loanId] == false, "SaplingLendingPool: loan is closed");

        // @dev trust the loan validity via LoanDesk checks as the only caller authorized is LoanDesk

        //// effect
        loanClosed[loanId] == true;

        if (carryAmountUsed > 0) {
            balance.strategizedFunds -= carryAmountUsed;
            balance.rawLiquidity += carryAmountUsed;
        }

        uint256 managerLoss = loss;
        uint256 lenderLoss = 0;

        if (loss > 0) {
            uint256 remainingLostShares = tokensToShares(loss);

            balance.poolFunds -= loss;
            balance.strategizedFunds -= loss;
            updateAvgStrategyApr(loss, apr);

            if (balance.stakedShares > 0) {
                uint256 stakedShareLoss = MathUpgradeable.min(remainingLostShares, balance.stakedShares);
                remainingLostShares -= stakedShareLoss;
                balance.stakedShares -= stakedShareLoss;
                updatePoolLimit();

                if (balance.stakedShares == 0) {
                    emit StakedAssetsDepleted();
                }

                //// interactions

                //burn manager's shares; this external interaction must happen before calculating lender loss
                IPoolToken(tokenConfig.poolToken).burn(address(this), stakedShareLoss);
            }

            if (remainingLostShares > 0) {
                lenderLoss = sharesToTokens(remainingLostShares);
                managerLoss -= lenderLoss;

                emit UnstakedLoss(lenderLoss);
            }
        }

        return (managerLoss, lenderLoss);
    }

    // /**
    //  * @notice Closes a loan. Closing a loan will repay the outstanding principal using the pool manager's revenue
    //                         and/or staked funds. If these funds are not sufficient, the lenders will take the loss.
    //  * @dev Loan must be in OUTSTANDING status.
    //  *      Caller must be the manager.
    //  * @param loanId ID of the loan to close
    //  */
    function onCloseLoan(
        uint256 loanId,
        uint16 apr,
        uint256 amountRepaid,
        uint256 remainingDifference
    )
        external
        onlyLoanDesk
        whenNotPaused
        nonReentrant
        returns (uint256)
    {
        //// check
        require(loanClosed[loanId] == false, "SaplingLendingPool: loan is closed");

        // @dev trust the loan validity via LoanDesk checks as the only caller authorized is LoanDesk

        //// effect

        loanClosed[loanId] == true;

        // charge manager's revenue
        if (remainingDifference > 0 && balance.managerRevenue > 0) {
            uint256 amountChargeable = MathUpgradeable.min(remainingDifference, balance.managerRevenue);

            balance.managerRevenue -= amountChargeable;

            remainingDifference -= amountChargeable;
            amountRepaid += amountChargeable;
        }

        // charge manager's stake
        uint256 stakeChargeable = 0;
        if (remainingDifference > 0 && balance.stakedShares > 0) {
            uint256 stakedBalance = sharesToTokens(balance.stakedShares);
            uint256 amountChargeable = MathUpgradeable.min(remainingDifference, stakedBalance);
            stakeChargeable = tokensToShares(amountChargeable);

            balance.stakedShares = balance.stakedShares - stakeChargeable;
            updatePoolLimit();

            if (balance.stakedShares == 0) {
                emit StakedAssetsDepleted();
            }

            remainingDifference -= amountChargeable;
            amountRepaid += amountChargeable;
        }

        if (amountRepaid > 0) {
            balance.strategizedFunds -= amountRepaid;
            balance.rawLiquidity += amountRepaid;
        }

        // charge pool (close loan and reduce borrowed funds/poolfunds)
        if (remainingDifference > 0) {
            balance.strategizedFunds -= remainingDifference;
            balance.poolFunds -= remainingDifference;

            emit UnstakedLoss(remainingDifference);
        }

        updateAvgStrategyApr(amountRepaid + remainingDifference, apr);

        //// interactions
        if (stakeChargeable > 0) {
            IPoolToken(tokenConfig.poolToken).burn(address(this), stakeChargeable);
        }

        return amountRepaid;
    }

    /**
     * @notice Handles liquidity state changes on a loan offer.
     * @dev Hook to be called when a new loan offer is made.
     *      Caller must be the LoanDesk.
     * @param amount Loan offer amount.
     */
    function onOffer(uint256 amount) external override onlyLoanDesk whenNotPaused {
        require(strategyLiquidity() >= amount, "SaplingLendingPool: insufficient liquidity");

        balance.rawLiquidity -= amount;
        balance.allocatedFunds += amount;

        emit OfferLiquidityAllocated(amount);
    }

    /**
     * @notice Handles liquidity state changes on a loan offer update.
     * @dev Hook to be called when a loan offer amount is updated. Amount update can be due to offer update or
     *      cancellation. Caller must be the LoanDesk.
     * @param prevAmount The original, now previous, offer amount.
     * @param amount New offer amount. Cancelled offer must register an amount of 0 (zero).
     */
    function onOfferUpdate(uint256 prevAmount, uint256 amount) external onlyLoanDesk whenNotPaused {
        require(strategyLiquidity() + prevAmount >= amount, "SaplingLendingPool: insufficient liquidity");

        balance.rawLiquidity = balance.rawLiquidity + prevAmount - amount;
        balance.allocatedFunds = balance.allocatedFunds - prevAmount + amount;

        emit OfferLiquidityUpdated(prevAmount, amount);
    }

    /**
     * @notice View indicating whether or not a given loan can be offered by the manager.
     * @dev Hook for checking if the lending pool can provide liquidity for the total offered loans amount.
     * @param totalOfferedAmount Total sum of offered loan amount including outstanding offers
     * @return True if the pool has sufficient lending liquidity, false otherwise
     */
    function canOffer(uint256 totalOfferedAmount) external view override returns (bool) {
        return isPoolFunctional() && strategyLiquidity() + balance.allocatedFunds >= totalOfferedAmount;
    }

    /**
     * @notice Check if the pool can lend based on the current stake levels.
     * @return True if the staked funds provide at least a minimum ratio to the pool funds, false otherwise.
     */
    function poolCanLend() external view returns (bool) {
        return isPoolFunctional();
    }

    /**
     * @notice Current pool funds borrowed.
     * @return Amount of funds borrowed in liquidity tokens.
     */
    function borrowedFunds() external view returns(uint256) {
        return balance.strategizedFunds;
    }

    // /**
    //  * @notice Make a payment towards a loan.
    //  * @dev Loan must be in OUTSTANDING status.
    //  *      Only the necessary sum is charged if amount exceeds amount due.
    //  *      Amount charged will not exceed the amount parameter.
    //  * @param loanId ID of the loan to make a payment towards
    //  * @param borrower Borrower address
    //  * @param payer Actual payer address
    //  * @param amount Payment amount in tokens
    //  * @return A pair of total amount charged including interest, and the interest charged
    //  */
    function onRepay(
        uint256 loanId, 
        address borrower,
        address payer,
        uint16 apr,
        uint256 transferAmount, 
        uint256 paymentAmount, 
        uint256 interestPayable
    ) 
        external 
        override
        nonReentrant 
        whenNotPaused 
        onlyLoanDesk   
    {

        //// check
        require(loanFundsReleased[loanId] == true, "SaplingLendingPool: loan is not borrowed");
        require(loanClosed[loanId] == false, "SaplingLendingPool: loan is closed");

        // @dev trust the loan validity via LoanDesk checks as the only caller authorized is LoanDesk

        //// effect

        balance.tokenBalance += transferAmount;

        uint256 principalPaid;
        if (interestPayable == 0) {
            principalPaid = paymentAmount;
            balance.rawLiquidity += paymentAmount;
        } else {
            principalPaid = paymentAmount - interestPayable;

            //share revenue to treasury
            uint256 protocolEarnedInterest = MathUpgradeable.mulDiv(
                interestPayable,
                config.protocolFeePercent,
                SaplingMath.oneHundredPercent
            );

            balance.protocolRevenue += protocolEarnedInterest;

            //share revenue to manager
            uint256 currentStakePercent = MathUpgradeable.mulDiv(
                balance.stakedShares,
                SaplingMath.oneHundredPercent,
                totalPoolTokenSupply()
            );

            uint256 managerEarningsPercent = MathUpgradeable.mulDiv(
                currentStakePercent,
                config.managerEarnFactor - SaplingMath.oneHundredPercent,
                SaplingMath.oneHundredPercent
            );

            uint256 managerEarnedInterest = MathUpgradeable.mulDiv(
                interestPayable - protocolEarnedInterest,
                managerEarningsPercent,
                managerEarningsPercent + SaplingMath.oneHundredPercent
            );

            balance.managerRevenue += managerEarnedInterest;

            balance.rawLiquidity += paymentAmount - (protocolEarnedInterest + managerEarnedInterest);
            balance.poolFunds += interestPayable - (protocolEarnedInterest + managerEarnedInterest);

            updatePoolLimit();
        }

        balance.strategizedFunds -= principalPaid;

        updateAvgStrategyApr(principalPaid, apr);

        //// interactions

        // charge 'amount' tokens from msg.sender
        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(tokenConfig.liquidityToken),
            payer,
            address(this),
            transferAmount
        );

        emit LoanRepaymentFinalized(loanId, borrower, payer, transferAmount, interestPayable);
    }
}
