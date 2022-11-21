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

    /// Loans by loan ID
    mapping(uint256 => Loan) public loans;

    /// LoanDetails by loan ID
    mapping(uint256 => LoanDetail) public loanDetails;

    /// Recent loan id by address
    mapping(address => uint256) public recentLoanIdOf;

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
    function disableIntitializers() external onlyRole(GOVERNANCE_ROLE) {
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
    function setLoanDesk(address _loanDesk) external onlyRole(GOVERNANCE_ROLE) {
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
            paymentCarry: 0,
            interestPaidTillTime: block.timestamp,
            lastPaymentTime: 0
        });

        recentLoanIdOf[offer.borrower] = loanId;

        uint256 prevStrategizedFunds = poolBalance.strategizedFunds;
        poolBalance.allocatedFunds -= offer.amount;
        poolBalance.strategizedFunds += offer.amount;

        weightedAvgStrategyAPR = (prevStrategizedFunds * weightedAvgStrategyAPR + offer.amount * offer.apr)
            / poolBalance.strategizedFunds;

        poolBalance.tokenBalance -= offer.amount;

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

        if (loanDetail.paymentCarry > 0) {
            poolBalance.strategizedFunds -= loanDetail.paymentCarry;
            poolBalance.poolLiquidity += loanDetail.paymentCarry;

            loanDetail.principalAmountRepaid += loanDetail.paymentCarry;
            loanDetail.lastPaymentTime = block.timestamp;

            loanDetail.paymentCarry = 0;
        }

        uint256 loss = loan.amount > loanDetail.principalAmountRepaid
            ? loan.amount - loanDetail.principalAmountRepaid
            : 0;

        uint256 managerLoss = loss;
        uint256 lenderLoss = 0;

        if (loss > 0) {
            uint256 remainingLostShares = tokensToShares(loss);

            poolBalance.poolFunds -= loss;
            poolBalance.strategizedFunds -= loss;
            updateAvgStrategyApr(loss, loan.apr);

            if (poolBalance.stakedShares > 0) {
                uint256 stakedShareLoss = MathUpgradeable.min(remainingLostShares, poolBalance.stakedShares);
                remainingLostShares -= stakedShareLoss;
                poolBalance.stakedShares -= stakedShareLoss;
                updatePoolLimit();

                if (poolBalance.stakedShares == 0) {
                    emit StakedAssetsDepleted();
                }

                //// interactions

                //burn manager's shares
                IPoolToken(tokenConfig.poolToken).burn(address(this), stakedShareLoss);
            }

            if (remainingLostShares > 0) {
                lenderLoss = sharesToTokens(remainingLostShares);
                managerLoss -= lenderLoss;

                emit UnstakedLoss(lenderLoss);
            }
        }

        emit LoanDefaulted(loanId, loan.borrower, managerLoss, lenderLoss);
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
        onlyRole(POOL_MANAGER_ROLE)
        loanInStatus(loanId, LoanStatus.OUTSTANDING)
        whenNotPaused
        nonReentrant
    {
        //// effect

        Loan storage loan = loans[loanId];
        LoanDetail storage loanDetail = loanDetails[loanId];
        // BorrowerStats storage stats = borrowerStats[loan.borrower];

        uint256 remainingDifference = loanDetail.principalAmountRepaid < loan.amount
            ? loan.amount - loanDetail.principalAmountRepaid
            : 0;

        uint256 amountRepaid = 0;
        uint256 amountCarryUsed = 0;

        // use loan payment carry
        if (remainingDifference > 0 && loanDetail.paymentCarry > 0) {
            amountCarryUsed = loanDetail.paymentCarry;
            loanDetail.paymentCarry = 0;

            remainingDifference = remainingDifference > amountCarryUsed
                ? remainingDifference - amountCarryUsed
                : 0;
            amountRepaid += amountCarryUsed;
        }

        // charge manager's revenue
        if (remainingDifference > 0 && poolBalance.managerRevenue > 0) {
            uint256 amountChargeable = MathUpgradeable.min(remainingDifference, poolBalance.managerRevenue);

            poolBalance.managerRevenue -= amountChargeable;

            remainingDifference -= amountChargeable;
            amountRepaid += amountChargeable;
        }

        // charge manager's stake
        uint256 stakeChargeable = 0;
        if (remainingDifference > 0 && poolBalance.stakedShares > 0) {
            uint256 stakedBalance = sharesToTokens(poolBalance.stakedShares);
            uint256 amountChargeable = MathUpgradeable.min(remainingDifference, stakedBalance);
            stakeChargeable = tokensToShares(amountChargeable);

            poolBalance.stakedShares = poolBalance.stakedShares - stakeChargeable;
            updatePoolLimit();

            if (poolBalance.stakedShares == 0) {
                emit StakedAssetsDepleted();
            }

            remainingDifference -= amountChargeable;
            amountRepaid += amountChargeable;
        }

        if (amountRepaid > 0) {
            poolBalance.strategizedFunds -= amountRepaid;
            poolBalance.poolLiquidity += amountRepaid;

            loanDetail.totalAmountRepaid += amountRepaid - amountCarryUsed;
            loanDetail.principalAmountRepaid += amountRepaid;
            loanDetail.lastPaymentTime = block.timestamp;
        }

        // charge pool (close loan and reduce borrowed funds/poolfunds)
        if (remainingDifference > 0) {
            poolBalance.strategizedFunds -= remainingDifference;
            poolBalance.poolFunds -= remainingDifference;

            emit UnstakedLoss(remainingDifference);
        }

        loan.status = LoanStatus.REPAID;

        updateAvgStrategyApr(amountRepaid + remainingDifference, loan.apr);

        //// interactions
        if (stakeChargeable > 0) {
            IPoolToken(tokenConfig.poolToken).burn(address(this), stakeChargeable);
        }

        emit LoanClosed(loanId, loan.borrower, amountRepaid, remainingDifference);
    }

    /**
     * @notice Handles liquidity state changes on a loan offer.
     * @dev Hook to be called when a new loan offer is made.
     *      Caller must be the LoanDesk.
     * @param amount Loan offer amount.
     */
    function onOffer(uint256 amount) external override onlyLoanDesk whenNotPaused {
        require(strategyLiquidity() >= amount, "SaplingLendingPool: insufficient liquidity");

        poolBalance.poolLiquidity -= amount;
        poolBalance.allocatedFunds += amount;

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

        poolBalance.poolLiquidity = poolBalance.poolLiquidity + prevAmount - amount;
        poolBalance.allocatedFunds = poolBalance.allocatedFunds - prevAmount + amount;

        emit OfferLiquidityUpdated(prevAmount, amount);
    }

    /**
     * @notice View indicating whether or not a given loan can be offered by the manager.
     * @dev Hook for checking if the lending pool can provide liquidity for the total offered loans amount.
     * @param totalOfferedAmount Total sum of offered loan amount including outstanding offers
     * @return True if the pool has sufficient lending liquidity, false otherwise
     */
    function canOffer(uint256 totalOfferedAmount) external view override returns (bool) {
        return isPoolFunctional() && strategyLiquidity() + poolBalance.allocatedFunds >= totalOfferedAmount;
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

        bool isManager = IAccessControl(accessControl).hasRole(POOL_MANAGER_ROLE, caller);

        if (!isManager && !authorizedOnInactiveManager(caller)) {
            return false;
        }

        Loan storage loan = loans[loanId];

        if (loan.status != LoanStatus.OUTSTANDING) {
            return false;
        }

        uint256 fxBandPercent = 200; //20% //TODO: use confgurable parameter on v1.1

        uint256 paymentDueTime;

        if (loan.installments > 1) {
            uint256 installmentPeriod = loan.duration / loan.installments;
            uint256 pastInstallments = (block.timestamp - loan.borrowedTime) / installmentPeriod;
            uint256 minTotalPayment = MathUpgradeable.mulDiv(
                loan.installmentAmount * pastInstallments,
                oneHundredPercent - fxBandPercent,
                oneHundredPercent
            );

            LoanDetail storage detail = loanDetails[loanId];
            uint256 totalRepaid = detail.principalAmountRepaid + detail.interestPaid;
            if (totalRepaid >= minTotalPayment) {
                return false;
            }

            paymentDueTime = loan.borrowedTime + ((totalRepaid / loan.installmentAmount) + 1) * installmentPeriod;
        } else {
            paymentDueTime = loan.borrowedTime + loan.duration;
        }

        return block.timestamp > (
            paymentDueTime + loan.gracePeriod + (isManager ? 0 : MANAGER_INACTIVITY_GRACE_PERIOD)
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
        return principalOutstanding + interestOutstanding - loanDetails[loanId].paymentCarry;
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
        uint256 paymentAmount;
        uint256 interestPayable;
        uint256 payableInterestDays;

        {
            (
                uint256 _transferAmount,
                uint256 _paymentAmount,
                uint256 _interestPayable,
                uint256 _payableInterestDays,
                uint256 _loanBalanceDue
            ) = payableLoanBalance(loanId, amount);

            transferAmount = _transferAmount;
            paymentAmount = _paymentAmount;
            interestPayable = _interestPayable;
            payableInterestDays = _payableInterestDays;

            // enforce a small minimum payment amount, except for the last payment equal to the total amount due
            require(
                _paymentAmount >= 10 ** tokenConfig.decimals || _paymentAmount == _loanBalanceDue,
                "SaplingLendingPool: payment amount is less than the required minimum"
            );
        }

        //// effect

        poolBalance.tokenBalance += transferAmount;

        uint256 principalPaid;
        if (interestPayable == 0) {
            principalPaid = paymentAmount;
            poolBalance.poolLiquidity += paymentAmount;
        } else {
            principalPaid = paymentAmount - interestPayable;

            //share revenue to treasury
            uint256 protocolEarnedInterest = MathUpgradeable.mulDiv(
                interestPayable,
                poolConfig.protocolFeePercent,
                oneHundredPercent
            );

            poolBalance.protocolRevenue += protocolEarnedInterest;

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
                interestPayable - protocolEarnedInterest,
                managerEarningsPercent,
                managerEarningsPercent + oneHundredPercent
            );

            poolBalance.managerRevenue += managerEarnedInterest;

            poolBalance.poolLiquidity += paymentAmount - (protocolEarnedInterest + managerEarnedInterest);
            poolBalance.poolFunds += interestPayable - (protocolEarnedInterest + managerEarnedInterest);

            updatePoolLimit();
        }

        LoanDetail storage loanDetail = loanDetails[loanId];
        loanDetail.totalAmountRepaid += transferAmount;
        loanDetail.principalAmountRepaid += principalPaid;
        loanDetail.lastPaymentTime = block.timestamp;
        loanDetail.interestPaidTillTime += payableInterestDays * 86400;

        if (paymentAmount > transferAmount) {
            loanDetail.paymentCarry -= paymentAmount - transferAmount;
        } else if (paymentAmount < transferAmount) {
            loanDetail.paymentCarry += transferAmount - paymentAmount;
        }

        {
            if (interestPayable != 0) {
                loanDetail.interestPaid += interestPayable;
            }

            poolBalance.strategizedFunds -= principalPaid;

            if (loanDetail.principalAmountRepaid >= loan.amount) {
                loan.status = LoanStatus.REPAID;

                emit LoanRepaid(loanId, loan.borrower);
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

    function getPoolManagerRole() external view returns (bytes32) {
        return POOL_MANAGER_ROLE;
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
        uint256 interestPercent = MathUpgradeable.mulDiv(uint256(loan.apr) * 1e18, daysPassed, 365);

        uint256 principalOutstanding = loan.amount - detail.principalAmountRepaid;
        uint256 interestOutstanding = MathUpgradeable.mulDiv(principalOutstanding, interestPercent, oneHundredPercent);

        return (principalOutstanding, interestOutstanding / 1e18, daysPassed);
    }

    /**
     * @notice Loan balances payable given a max payment amount.
     * @param loanId ID of the loan to check the balance of
     * @param maxPaymentAmount Maximum liquidity token amount user has agreed to pay towards the loan
     * @return Total transfer camount, paymentAmount, interest payable, and the number of payable interest days,
     *         and the current loan balance
     */
    function payableLoanBalance(
        uint256 loanId,
        uint256 maxPaymentAmount
    )
        private
        view
        returns (uint256, uint256, uint256, uint256, uint256)
    {
        (
            uint256 principalOutstanding,
            uint256 interestOutstanding,
            uint256 interestDays
        ) = loanBalanceDueWithInterest(loanId);

        uint256 useCarryAmount = loanDetails[loanId].paymentCarry;
        uint256 balanceDue = principalOutstanding + interestOutstanding - useCarryAmount;

        uint256 transferAmount = MathUpgradeable.min(balanceDue, maxPaymentAmount);
        uint256 paymentAmount = transferAmount + useCarryAmount;

        uint256 interestPayable;
        uint256 payableInterestDays;

        if (paymentAmount >= interestOutstanding) {
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
            payableInterestDays = MathUpgradeable.mulDiv(paymentAmount, interestDays, interestOutstanding);
            interestPayable = MathUpgradeable.mulDiv(interestOutstanding, payableInterestDays, interestDays);

            /*
             Handle "small payment exploit" which unfairly reduces the principal amount by making payments smaller than
             1 day interest, while the interest on the remaining principal is outstanding.

             Do not accept leftover payments towards the principal while any daily interest is outstandig.
             */
            if (payableInterestDays < interestDays) {
                paymentAmount = interestPayable;
            }
        }

        return (transferAmount, paymentAmount, interestPayable, payableInterestDays, balanceDue);
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

        uint256 countSeconds = timeTo - timeFrom;
        uint256 dayCount = countSeconds / 86400;

        if (countSeconds % 86400 > 0) {
            dayCount++;
        }

        return dayCount;
    }
}
