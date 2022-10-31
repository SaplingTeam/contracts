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

    using SafeMathUpgradeable for uint256;

    /// Address of the loan desk contract
    address public loanDesk;

    /// Loans by loan ID
    mapping(uint256 => Loan) public loans;

    /// LoanDetails by loan ID
    mapping(uint256 => LoanDetail) public loanDetails;

    /// Borrower statistics by address
    mapping(address => BorrowerStats) public borrowerStats;

    /// A modifier to limit access to when a loan has the specified status
    modifier loanInStatus(uint256 loanId, LoanStatus status) {
        require(loans[loanId].status == status, "SaplingLendingPool: not found or invalid loan status");
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
    function disableIntitializers() external onlyGovernance {
        _disableInitializers();
    }

    /**
     * @notice Creates a Sapling pool.
     * @dev Addresses must not be 0.
     * @param _poolToken ERC20 token contract address to be used as the pool issued token.
     * @param _liquidityToken ERC20 token contract address to be used as pool liquidity currency.
     * @param _governance Governance address
     * @param _treasury Treasury wallet address
     * @param _manager Manager address
     */
    function initialize(
        address _poolToken,
        address _liquidityToken,
        address _governance,
        address _treasury,
        address _manager
    )
        public
        initializer
    {
        __SaplingPoolContext_init(_poolToken, _liquidityToken, _governance, _treasury, _manager);
    }

    /**
     * @notice Links a new loan desk for the pool to use. Intended for use upon initial pool deployment.
     * @dev Caller must be the governance.
     * @param _loanDesk New LoanDesk address
     */
    function setLoanDesk(address _loanDesk) external onlyGovernance {
        address prevLoanDesk = loanDesk;
        loanDesk = _loanDesk;
        emit LoanDeskSet(prevLoanDesk, loanDesk);
    }

    /**
     * @notice Accept a loan offer and withdraw funds
     * @dev Caller must be the borrower of the loan in question.
     *      The loan must be in OFFER_MADE status.
     * @param appId ID of the loan application to accept the offer of
     */
    function borrow(uint256 appId) external whenNotClosed whenNotPaused {

        //// check

        require(
            ILoanDesk(loanDesk).applicationStatus(appId) == ILoanDesk.LoanApplicationStatus.OFFER_MADE,
            "SaplingLendingPool: invalid offer status"
        );

        ILoanDesk.LoanOffer memory offer = ILoanDesk(loanDesk).loanOfferById(appId);

        require(offer.borrower == msg.sender, "SaplingLendingPool: msg.sender is not the borrower on this loan");

        //// effect

        borrowerStats[offer.borrower].countOutstanding++;
        borrowerStats[offer.borrower].amountBorrowed = borrowerStats[offer.borrower].amountBorrowed.add(offer.amount);

        uint256 loanId = getNextStrategyId();

        loans[loanId] = Loan({
            id: loanId,
            loanDeskAddress: loanDesk,
            applicationId: appId,
            borrower: offer.borrower,
            amount: offer.amount,
            duration: offer.duration,
            gracePeriod: offer.gracePeriod,
            installmentAmount: offer.installmentAmount,
            installments: offer.installments,
            apr: offer.apr,
            borrowedTime: block.timestamp,
            status: LoanStatus.OUTSTANDING
        });

        loanDetails[loanId] = LoanDetail({
            loanId: loanId,
            totalAmountRepaid: 0,
            principalAmountRepaid: 0,
            interestPaid: 0,
            interestPaidTillTime: block.timestamp,
            lastPaymentTime: 0
        });

        borrowerStats[offer.borrower].recentLoanId = loanId;

        uint256 prevStrategizedFunds = poolBalance.strategizedFunds;
        poolBalance.allocatedFunds = poolBalance.allocatedFunds.sub(offer.amount);
        poolBalance.strategizedFunds = poolBalance.strategizedFunds.add(offer.amount);

        weightedAvgStrategyAPR = prevStrategizedFunds
            .mul(weightedAvgStrategyAPR)
            .add(offer.amount.mul(offer.apr))
            .div(poolBalance.strategizedFunds);

        poolBalance.tokenBalance = poolBalance.tokenBalance.sub(offer.amount);

        //// interactions

        ILoanDesk(loanDesk).onBorrow(appId);

        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(tokenConfig.liquidityToken), msg.sender, offer.amount);

        emit LoanBorrowed(loanId, offer.borrower, appId);
    }

    /**
     * @notice Make a payment towards a loan.
     * @dev Caller must be the borrower.
     *      Loan must be in OUTSTANDING status.
     *      Only the necessary sum is charged if amount exceeds amount due.
     *      Amount charged will not exceed the amount parameter.
     * @param loanId ID of the loan to make a payment towards.
     * @param amount Payment amount in tokens.
     * @return A pair of total amount charged including interest, and the interest charged.
     */
    function repay(uint256 loanId, uint256 amount) external returns (uint256, uint256) {
        // require the payer and the borrower to be the same to avoid mispayment
        require(loans[loanId].borrower == msg.sender, "SaplingLendingPool: payer is not the borrower");

        return repayBase(loanId, amount);
    }

    /**
     * @notice Make a payment towards a loan on behalf of a borrower.
     * @dev Loan must be in OUTSTANDING status.
     *      Only the necessary sum is charged if amount exceeds amount due.
     *      Amount charged will not exceed the amount parameter.
     * @param loanId ID of the loan to make a payment towards.
     * @param amount Payment amount in tokens.
     * @param borrower address of the borrower to make a payment on behalf of.
     * @return A pair of total amount charged including interest, and the interest charged.
     */
    function repayOnBehalf(uint256 loanId, uint256 amount, address borrower ) external returns (uint256, uint256) {
        // require the borrower being paid on behalf off and the loan borrower to be the same to avoid mispayment
        require(loans[loanId].borrower == borrower, "SaplingLendingPool: invalid borrower");

        return repayBase(loanId, amount);
    }

    /**
     * @notice Default a loan.
     * @dev Loan must be in OUTSTANDING status.
     *      Caller must be the manager.
     *      canDefault(loanId, msg.sender) must return 'true'.
     * @param loanId ID of the loan to default
     */
    function defaultLoan(
        uint256 loanId
    )
        public
        managerOrApprovedOnInactive
        loanInStatus(loanId, LoanStatus.OUTSTANDING)
        whenNotPaused
    {
        //// check

        require(canDefault(loanId, msg.sender), "SaplingLendingPool: cannot defaulted this loan at this time");

        //// effect

        Loan storage loan = loans[loanId];
        LoanDetail storage loanDetail = loanDetails[loanId];

        loan.status = LoanStatus.DEFAULTED;
        borrowerStats[loan.borrower].countDefaulted++;
        borrowerStats[loan.borrower].countOutstanding--;

        (, uint256 loss) = loan.amount.trySub(loanDetail.principalAmountRepaid);

        borrowerStats[loan.borrower].amountBorrowed = borrowerStats[loan.borrower].amountBorrowed.sub(loan.amount);
        borrowerStats[loan.borrower].amountBaseRepaid = borrowerStats[loan.borrower].amountBaseRepaid
            .sub(loanDetail.principalAmountRepaid);
        borrowerStats[loan.borrower].amountInterestPaid = borrowerStats[loan.borrower].amountInterestPaid
            .sub(loanDetail.interestPaid);

        if (loanDetail.principalAmountRepaid < loan.amount) {
            uint256 baseAmountLost = loan.amount.sub(loanDetail.principalAmountRepaid);
            poolBalance.strategizedFunds = poolBalance.strategizedFunds.sub(baseAmountLost);

            updateAvgStrategyApr(baseAmountLost, loan.apr);
        }

        emit LoanDefaulted(loanId, loan.borrower, loss);

        if (loss > 0) {
            uint256 remainingLostShares = tokensToShares(loss);

            poolBalance.poolFunds = poolBalance.poolFunds.sub(loss);

            if (poolBalance.stakedShares > 0) {
                uint256 stakedShareLoss = MathUpgradeable.min(remainingLostShares, poolBalance.stakedShares);
                remainingLostShares = remainingLostShares.sub(stakedShareLoss);
                poolBalance.stakedShares = poolBalance.stakedShares.sub(stakedShareLoss);
                updatePoolLimit();

                if (poolBalance.stakedShares == 0) {
                    emit StakedAssetsDepleted();
                }

                //// interactions

                //burn manager's shares
                IPoolToken(tokenConfig.poolToken).burn(address(this), stakedShareLoss);
            }

            if (remainingLostShares > 0) {
                emit UnstakedLoss(sharesToTokens(remainingLostShares));
            }
        }
    }

    /**
     * @notice Closes a loan. Closing a loan will repay the outstanding principal using the pool manager's revenue
                            and/or staked funds. If these funds are not sufficient, the lenders will take the loss.
     * @dev Loan must be in OUTSTANDING status.
     *      Caller must be the manager.
     * @param loanId ID of the loan to close
     */
    function closeLoan(
        uint256 loanId
    )
        external
        onlyManager
        loanInStatus(loanId, LoanStatus.OUTSTANDING)
        whenNotPaused
        nonReentrant
    {
        //// effect

        Loan storage loan = loans[loanId];
        LoanDetail storage loanDetail = loanDetails[loanId];
        BorrowerStats storage stats = borrowerStats[loan.borrower];

        uint256 remainingDifference = loanDetail.principalAmountRepaid < loan.amount
            ? loan.amount.sub(loanDetail.principalAmountRepaid)
            : 0;

        uint256 amountRepaid = 0;

        // charge manager's revenue
        if (remainingDifference > 0 && nonUserRevenues[manager] > 0) {
            uint256 amountChargeable = MathUpgradeable.min(remainingDifference, nonUserRevenues[manager]);

            nonUserRevenues[manager] = nonUserRevenues[manager].sub(amountChargeable);

            remainingDifference = remainingDifference.sub(amountChargeable);
            amountRepaid = amountRepaid.add(amountChargeable);
        }

        // charge manager's stake
        uint256 stakeChargeable = 0;
        if (remainingDifference > 0 && poolBalance.stakedShares > 0) {
            uint256 stakedBalance = sharesToTokens(poolBalance.stakedShares);
            uint256 amountChargeable = MathUpgradeable.min(remainingDifference, stakedBalance);
            stakeChargeable = tokensToShares(amountChargeable);

            poolBalance.stakedShares = poolBalance.stakedShares.sub(stakeChargeable);
            updatePoolLimit();

            if (poolBalance.stakedShares == 0) {
                emit StakedAssetsDepleted();
            }

            remainingDifference = remainingDifference.sub(amountChargeable);
            amountRepaid = amountRepaid.add(amountChargeable);
        }

        if (amountRepaid > 0) {
            poolBalance.strategizedFunds = poolBalance.strategizedFunds.sub(amountRepaid);
            poolBalance.poolLiquidity = poolBalance.poolLiquidity.add(amountRepaid);

            loanDetail.totalAmountRepaid = loanDetail.totalAmountRepaid.add(amountRepaid);
            loanDetail.principalAmountRepaid = loanDetail.principalAmountRepaid.add(amountRepaid);
            loanDetail.lastPaymentTime = block.timestamp;

            stats.amountBaseRepaid = stats.amountBaseRepaid.add(amountRepaid);
        }

        // charge pool (close loan and reduce borrowed funds/poolfunds)
        if (remainingDifference > 0) {
            poolBalance.strategizedFunds = poolBalance.strategizedFunds.sub(remainingDifference);
            poolBalance.poolFunds = poolBalance.poolFunds.sub(remainingDifference);
        }

        loan.status = LoanStatus.REPAID; // Note: add and switch to CLOSED status in next migration version of the pool

        //update stats
        stats.countRepaid++;
        stats.countOutstanding--;
        stats.amountBorrowed = stats.amountBorrowed.sub(loan.amount);
        stats.amountBaseRepaid = stats.amountBaseRepaid.sub(loanDetail.principalAmountRepaid);
        stats.amountInterestPaid = stats.amountInterestPaid.sub(loanDetail.interestPaid);

        updateAvgStrategyApr(amountRepaid.add(remainingDifference), loan.apr);

        //// interactions
        if (stakeChargeable > 0) {
            IPoolToken(tokenConfig.poolToken).burn(address(this), stakeChargeable);
        }

        emit LoanClosed(loanId, loan.borrower);
    }

    /**
     * @notice Handles liquidity state changes on a loan offer.
     * @dev Hook to be called when a new loan offer is made.
     *      Caller must be the LoanDesk.
     * @param amount Loan offer amount.
     */
    function onOffer(uint256 amount) external override onlyLoanDesk whenNotPaused {
        require(strategyLiquidity() >= amount, "SaplingLendingPool: insufficient liquidity");

        poolBalance.poolLiquidity = poolBalance.poolLiquidity.sub(amount);
        poolBalance.allocatedFunds = poolBalance.allocatedFunds.add(amount);

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
        require(strategyLiquidity().add(prevAmount) >= amount, "SaplingLendingPool: insufficient liquidity");

        poolBalance.poolLiquidity = poolBalance.poolLiquidity.add(prevAmount).sub(amount);
        poolBalance.allocatedFunds = poolBalance.allocatedFunds.sub(prevAmount).add(amount);

        emit OfferLiquidityUpdated(prevAmount, amount);
    }

    /**
     * @notice View indicating whether or not a given loan can be offered by the manager.
     * @dev Hook for checking if the lending pool can provide liquidity for the total offered loans amount.
     * @param totalOfferedAmount Total sum of offered loan amount including outstanding offers
     * @return True if the pool has sufficient lending liquidity, false otherwise
     */
    function canOffer(uint256 totalOfferedAmount) external view override returns (bool) {
        return isPoolFunctional() && strategyLiquidity().add(poolBalance.allocatedFunds) >= totalOfferedAmount;
    }

    /**
     * @notice Check if the pool can lend based on the current stake levels.
     * @return True if the staked funds provide at least a minimum ratio to the pool funds, false otherwise.
     */
    function poolCanLend() external view returns (bool) {
        return isPoolFunctional();
    }

    /**
     * @notice Count of all loan requests in this pool.
     * @return Loans count.
     */
    function loansCount() external view returns(uint256) {
        return strategyCount();
    }

    /**
     * @notice Current pool funds borrowed.
     * @return Amount of funds borrowed in liquidity tokens.
     */
    function borrowedFunds() external view returns(uint256) {
        return poolBalance.strategizedFunds;
    }

    /**
     * @notice View indicating whether or not a given loan qualifies to be defaulted by a given caller.
     * @param loanId ID of the loan to check
     * @param caller An address that intends to call default() on the loan
     * @return True if the given loan can be defaulted, false otherwise
     */
    function canDefault(uint256 loanId, address caller) public view returns (bool) {
        if (caller != manager && !authorizedOnInactiveManager(caller)) {
            return false;
        }

        Loan storage loan = loans[loanId];

        if (loan.status != LoanStatus.OUTSTANDING) {
            return false;
        }

        uint256 fxBandPercent = 200; //20% //TODO: use confgurable parameter on v1.1

        uint256 paymentDueTime;

        if (loan.installments > 1) {
            uint256 installmentPeriod = loan.duration.div(loan.installments);
            uint256 pastInstallments = block.timestamp.sub(loan.borrowedTime).div(installmentPeriod);
            uint256 minTotalPayment = MathUpgradeable.mulDiv(
                loan.installmentAmount.mul(pastInstallments),
                fxBandPercent,
                oneHundredPercent
            );

            LoanDetail storage detail = loanDetails[loanId];
            uint256 totalRepaid = detail.principalAmountRepaid + detail.interestPaid;
            if (totalRepaid >= minTotalPayment) {
                return false;
            }

            paymentDueTime = loan.borrowedTime + (totalRepaid.div(loan.installmentAmount) + 1) * installmentPeriod;
        } else {
            paymentDueTime = loan.borrowedTime + loan.duration;
        }

        return block.timestamp > (
            paymentDueTime + loan.gracePeriod + (caller == manager ? 0 : MANAGER_INACTIVITY_GRACE_PERIOD)
        );
    }

    /**
     * @notice Loan balance due including interest if paid in full at this time.
     * @dev Loan must be in OUTSTANDING status.
     * @param loanId ID of the loan to check the balance of
     * @return Total amount due with interest on this loan
     */
    function loanBalanceDue(uint256 loanId) public view loanInStatus(loanId, LoanStatus.OUTSTANDING) returns(uint256) {
        (uint256 principalOutstanding, uint256 interestOutstanding, ) = loanBalanceDueWithInterest(loanId);
        return principalOutstanding.add(interestOutstanding);
    }

    /**
     * @notice Transfer the previous treasury wallet's accumulated fees to current treasury wallet.
     * @dev Overrides a hook in SaplingContext.
     * @param from Address of the previous treasury wallet.
     */
    function afterTreasuryWalletTransfer(address from) internal override {
        require(from != address(0), "SaplingLendingPool: invalid from address");

        nonUserRevenues[treasury] = nonUserRevenues[treasury].add(nonUserRevenues[from]);
        nonUserRevenues[from] = 0;
    }

    /**
     * @notice Make a payment towards a loan.
     * @dev Loan must be in OUTSTANDING status.
     *      Only the necessary sum is charged if amount exceeds amount due.
     *      Amount charged will not exceed the amount parameter.
     * @param loanId ID of the loan to make a payment towards
     * @param amount Payment amount in tokens
     * @return A pair of total amount charged including interest, and the interest charged
     */
    function repayBase(uint256 loanId, uint256 amount) internal nonReentrant whenNotPaused returns (uint256, uint256) {

        //// check

        Loan storage loan = loans[loanId];
        require(
            loan.id == loanId && loan.status == LoanStatus.OUTSTANDING,
            "SaplingLendingPool: not found or invalid loan status"
        );


        uint256 transferAmount;
        uint256 interestPayable;
        uint256 payableInterestDays;

        {
            (
                uint256 _transferAmount,
                uint256 _interestPayable,
                uint256 _payableInterestDays,
                uint256 _loanBalanceDue
            ) = payableLoanBalance(loanId, amount);

            transferAmount = _transferAmount;
            interestPayable = _interestPayable;
            payableInterestDays = _payableInterestDays;

            // enforce a small minimum payment amount, except for the last payment equal to the total amount due
            require(
                transferAmount >= 10 ** tokenConfig.tokenDecimals || transferAmount == _loanBalanceDue,
                "SaplingLendingPool: payment amount is less than the required minimum"
            );
        }

        //// effect

        poolBalance.tokenBalance = poolBalance.tokenBalance.add(transferAmount);

        uint256 principalPaid;
        if (interestPayable == 0) {
            principalPaid = transferAmount;
            poolBalance.poolLiquidity = poolBalance.poolLiquidity.add(transferAmount);
        } else {
            principalPaid = transferAmount.sub(interestPayable);

            //share revenue to treasury
            uint256 protocolEarnedInterest = MathUpgradeable.mulDiv(
                interestPayable,
                poolConfig.protocolFeePercent,
                oneHundredPercent
            );

            nonUserRevenues[treasury] = nonUserRevenues[treasury].add(protocolEarnedInterest);

            //share revenue to manager
            uint256 currentStakePercent = MathUpgradeable.mulDiv(
                poolBalance.stakedShares,
                oneHundredPercent,
                IERC20(tokenConfig.poolToken).totalSupply()
            );

            uint256 managerEarningsPercent = MathUpgradeable.mulDiv(
                currentStakePercent,
                managerExcessLeverageComponent,
                oneHundredPercent
            );

            uint256 managerEarnedInterest = MathUpgradeable.mulDiv(
                interestPayable.sub(protocolEarnedInterest),
                managerEarningsPercent,
                managerEarningsPercent.add(oneHundredPercent)
            );

            nonUserRevenues[manager] = nonUserRevenues[manager].add(managerEarnedInterest);

            poolBalance.poolLiquidity = poolBalance.poolLiquidity.add(
                transferAmount.sub(protocolEarnedInterest.add(managerEarnedInterest))
            );
            poolBalance.poolFunds = poolBalance.poolFunds.add(
                interestPayable.sub(protocolEarnedInterest.add(managerEarnedInterest))
            );

            updatePoolLimit();
        }

        LoanDetail storage loanDetail = loanDetails[loanId];
        loanDetail.totalAmountRepaid = loanDetail.totalAmountRepaid.add(transferAmount);
        loanDetail.principalAmountRepaid = loanDetail.principalAmountRepaid.add(principalPaid);
        loanDetail.lastPaymentTime = block.timestamp;
        loanDetail.interestPaidTillTime = loanDetail.interestPaidTillTime.add(payableInterestDays.mul(86400));

        {
            BorrowerStats storage stats = borrowerStats[loan.borrower];
            stats.amountBaseRepaid = stats.amountBaseRepaid.add(principalPaid);

            if (interestPayable != 0) {
                loanDetail.interestPaid = loanDetail.interestPaid.add(interestPayable);

                stats.amountInterestPaid = stats.amountInterestPaid
                .add(interestPayable);
            }

            poolBalance.strategizedFunds = poolBalance.strategizedFunds.sub(principalPaid);

            if (loanDetail.principalAmountRepaid >= loan.amount) {
                loan.status = LoanStatus.REPAID;
                stats.countRepaid++;
                stats.countOutstanding--;
                stats.amountBorrowed = stats.amountBorrowed.sub(loan.amount);
                stats.amountBaseRepaid = stats.amountBaseRepaid
                    .sub(loanDetail.principalAmountRepaid);
                stats.amountInterestPaid = stats.amountInterestPaid
                    .sub(loanDetail.interestPaid);
            }
        }

        updateAvgStrategyApr(principalPaid, loan.apr);

        //// interactions

        // charge 'amount' tokens from msg.sender
        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(tokenConfig.liquidityToken),
            msg.sender,
            address(this),
            transferAmount
        );

        emit LoanRepaymentMade(loanId, loan.borrower, msg.sender, transferAmount, interestPayable);

        return (transferAmount, interestPayable);
    }

    /**
     * @notice Loan balances due if paid in full at this time.
     * @param loanId ID of the loan to check the balance of
     * @return Principal outstanding, interest outstanding, and the number of interest acquired days
     */
    function loanBalanceDueWithInterest(uint256 loanId) internal view returns (uint256, uint256, uint256) {
        Loan storage loan = loans[loanId];
        LoanDetail storage detail = loanDetails[loanId];

        uint256 daysPassed = countInterestDays(detail.interestPaidTillTime, block.timestamp);
        uint256 interestPercent = MathUpgradeable.mulDiv(loan.apr, daysPassed, 365);

        uint256 principalOutstanding = loan.amount.sub(detail.principalAmountRepaid);
        uint256 interestOutstanding = MathUpgradeable.mulDiv(principalOutstanding, interestPercent, oneHundredPercent);

        return (principalOutstanding, interestOutstanding, daysPassed);
    }

    /**
     * @notice Loan balances payable given a max payment amount.
     * @param loanId ID of the loan to check the balance of
     * @param maxPaymentAmount Maximum liquidity token amount user has agreed to pay towards the loan
     * @return Total amount payable, interest payable, and the number of payable interest days
     */
    function payableLoanBalance(
        uint256 loanId,
        uint256 maxPaymentAmount
    )
        private
        view
        returns (uint256, uint256, uint256, uint256)
    {
        (
            uint256 principalOutstanding,
            uint256 interestOutstanding,
            uint256 interestDays
        ) = loanBalanceDueWithInterest(loanId);

        uint256 transferAmount = MathUpgradeable.min(principalOutstanding.add(interestOutstanding), maxPaymentAmount);

        uint256 interestPayable;
        uint256 payableInterestDays;

        if (transferAmount >= interestOutstanding) {
            payableInterestDays = interestDays;
            interestPayable = interestOutstanding;
        } else {
            /*
             Round down payable interest amount to cover a whole number of days.

             Whole number of days the transfer amount can cover:
             payableInterestDays = transferAmount / (interestOutstanding / interestDays)

             interestPayable = (interestOutstanding / interestDays) * payableInterestDays

             Equations above are transformed into (a * b) / c format for best mulDiv() compatibility.
             */
            payableInterestDays = MathUpgradeable.mulDiv(transferAmount, interestDays, interestOutstanding);
            interestPayable = MathUpgradeable.mulDiv(interestOutstanding, payableInterestDays, interestDays);

            /*
             Handle "small payment exploit" which unfairly reduces the principal amount by making payments smaller than
             1 day interest, while the interest on the remaining principal is outstanding.

             Do not accept leftover payments towards the principal while any daily interest is outstandig.
             */
            if (payableInterestDays < interestDays) {
                transferAmount = interestPayable;
            }
        }

        return (transferAmount, interestPayable, payableInterestDays, principalOutstanding.add(interestOutstanding));
    }

    /**
     * @notice Get the number of days in a time period to witch an interest can be applied.
     * @dev Returns the ceiling of the count.
     * @param timeFrom Epoch timestamp of the start of the time period.
     * @param timeTo Epoch timestamp of the end of the time period.
     * @return Ceil count of days in a time period to witch an interest can be applied.
     */
    function countInterestDays(uint256 timeFrom, uint256 timeTo) private pure returns(uint256) {
        if (timeTo <= timeFrom) {
            return 0;
        }

        uint256 countSeconds = timeTo.sub(timeFrom);
        uint256 dayCount = countSeconds.div(86400);

        if (countSeconds.mod(86400) > 0) {
            dayCount++;
        }

        return dayCount;
    }
}
