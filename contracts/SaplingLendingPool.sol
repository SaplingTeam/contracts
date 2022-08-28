// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.15;

import "./context/SaplingPoolContext.sol";
import "./interfaces/ILoanDesk.sol";
import "./interfaces/ILoanDeskOwner.sol";

/**
 * @title Sapling Lending Pool
 * @dev Extends SaplingPoolContext with lending strategy.
 */
contract SaplingLendingPool is ILoanDeskOwner, SaplingPoolContext {

    using SafeMath for uint256;

    /**
     * Loan statuses. Initial value is defines as 'NULL' to differentiate the unintitialized state from the logical 
     * initial state.
     */
    enum LoanStatus {
        NULL,
        OUTSTANDING,
        REPAID,
        DEFAULTED
    }

    /// Loan object template
    struct Loan {
        uint256 id;
        address loanDeskAddress;
        uint256 applicationId;
        address borrower;
        uint256 amount;
        uint256 duration; 
        uint256 gracePeriod;
        uint256 installmentAmount;
        uint16 installments;
        uint16 apr;
        uint256 borrowedTime;
        LoanStatus status;
    }

    /// Loan payment details object template
    struct LoanDetail {
        uint256 loanId;
        uint256 totalAmountRepaid;
        uint256 baseAmountRepaid;
        uint256 interestPaid;
        uint256 interestPaidTillTime;
        uint256 lastPaymentTime;
    }

    /// Individual borrower statistics
    struct BorrowerStats {

        /// Wallet address of the borrower
        address borrower; 

        /// All time loan borrow count
        uint256 countBorrowed;

        /// All time loan closure count
        uint256 countRepaid;

        /// All time loan default count
        uint256 countDefaulted;

        /// Current outstanding loan count
        uint256 countOutstanding;

        /// Outstanding loan borrowed amount
        uint256 amountBorrowed;

        /// Outstanding loan repaid principal amount
        uint256 amountBaseRepaid;

        /// Outstanding loan paid interest amount
        uint256 amountInterestPaid;

        /// Most recent loanId
        uint256 recentLoanId;
        }
        
    /// Address of the loan desk contract
    address public loanDesk;

    /// Loans by loan ID
    mapping(uint256 => Loan) public loans;

    /// LoanDetails by loan ID
    mapping(uint256 => LoanDetail) public loanDetails;

    /// Borrower statistics by address 
    mapping(address => BorrowerStats) public borrowerStats;

    /// Event for when a new loan desk is set
    event LoanDeskSet(address from, address to);

    /// Event for when loan offer is accepted and the loan is borrowed
    event LoanBorrowed(uint256 loanId, address indexed borrower, uint256 applicationId);

    /// Event for when a loan is fully repaid
    event LoanRepaid(uint256 loanId, address indexed borrower);

    /// Event for when a loan is defaulted
    event LoanDefaulted(uint256 loanId, address indexed borrower, uint256 amountLost);

    /// A modifier to limit access to when a loan has the specified status
    modifier loanInStatus(uint256 loanId, LoanStatus status) {
        require(loans[loanId].status == status, 
            "SaplingLendingPool: not found or invalid loan status");
        _;
    }

    /// A modifier to limit access only to the loan desk contract
    modifier onlyLoanDesk() {
        require(msg.sender == loanDesk, "SaplingLendingPool: caller is not the LoanDesk");
        _;
    }
    
    /**
     * @notice Creates a Sapling pool.
     * @dev Addresses must not be 0.
     * @param _poolToken ERC20 token contract address to be used as the pool issued token.
     * @param _liquidityToken ERC20 token contract address to be used as pool liquidity currency.
     * @param _governance Governance address
     * @param _protocol Protocol wallet address
     * @param _manager Manager address
     */
    constructor(address _poolToken, address _liquidityToken, address _governance, address _protocol, address _manager) 
        SaplingPoolContext(_poolToken, _liquidityToken, _governance, _protocol, _manager) {
    }

    /**
     * @notice Accept a loan offer and withdraw funds
     * @dev Caller must be the borrower of the loan in question.
     *      The loan must be in OFFER_MADE status.
     * @param appId ID of the loan application to accept the offer of
     */
    function borrow(uint256 appId) external whenNotClosed whenNotPaused {

        require(ILoanDesk(loanDesk).applicationStatus(appId) == ILoanDesk.LoanApplicationStatus.OFFER_MADE, 
            "SaplingLendingPool: invalid offer status");

        ILoanDesk.LoanOffer memory offer = ILoanDesk(loanDesk).loanOfferById(appId);

        require(offer.borrower == msg.sender, "SaplingLendingPool: msg.sender is not the borrower on this loan");
        ILoanDesk(loanDesk).onBorrow(appId);

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
            baseAmountRepaid: 0,
            interestPaid: 0,
            interestPaidTillTime: block.timestamp,
            lastPaymentTime: 0
        });

        borrowerStats[offer.borrower].recentLoanId = loanId;

        uint256 prevStrategizedFunds = strategizedFunds;
        allocatedFunds = allocatedFunds.sub(offer.amount);
        strategizedFunds = strategizedFunds.add(offer.amount);

        weightedAvgStrategyAPR = prevStrategizedFunds.mul(weightedAvgStrategyAPR).add(offer.amount.mul(offer.apr)).div(strategizedFunds);

        tokenBalance = tokenBalance.sub(offer.amount);
        bool success = IERC20(liquidityToken).transfer(msg.sender, offer.amount);
        require(success, "SaplingLendingPool: liquidity token (ERC20) transfer to msg.sender has failed");

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
    function repay(uint256 loanId, uint256 amount) external loanInStatus(loanId, LoanStatus.OUTSTANDING) returns (uint256, uint256) {

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
    function repayOnBehalf(uint256 loanId, uint256 amount, address borrower) external loanInStatus(loanId, LoanStatus.OUTSTANDING) returns (uint256, uint256) {

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
    function defaultLoan(uint256 loanId) external managerOrApprovedOnInactive loanInStatus(loanId, LoanStatus.OUTSTANDING) whenNotPaused {
        require(canDefault(loanId, msg.sender), "SaplingLendingPool: cannot defaulted this loan at this time");

        Loan storage loan = loans[loanId];
        LoanDetail storage loanDetail = loanDetails[loanId];
        
        loan.status = LoanStatus.DEFAULTED;
        borrowerStats[loan.borrower].countDefaulted++;
        borrowerStats[loan.borrower].countOutstanding--;

        (, uint256 loss) = loan.amount.trySub(loanDetail.totalAmountRepaid);
        
        emit LoanDefaulted(loanId, loan.borrower, loss);

        borrowerStats[loan.borrower].amountBorrowed = borrowerStats[loan.borrower].amountBorrowed.sub(loan.amount);
        borrowerStats[loan.borrower].amountBaseRepaid = borrowerStats[loan.borrower].amountBaseRepaid.sub(loanDetail.baseAmountRepaid);
        borrowerStats[loan.borrower].amountInterestPaid = borrowerStats[loan.borrower].amountInterestPaid.sub(loanDetail.interestPaid);

        if (loss > 0) {
            uint256 lostShares = tokensToShares(loss);
            uint256 remainingLostShares = lostShares;

            poolFunds = poolFunds.sub(loss);
            
            if (stakedShares > 0) {
                uint256 stakedShareLoss = Math.min(lostShares, stakedShares);
                remainingLostShares = lostShares.sub(stakedShareLoss);
                stakedShares = stakedShares.sub(stakedShareLoss);
                updatePoolLimit();

                //burn manager's shares
                IPoolToken(poolToken).burn(address(this), stakedShareLoss);
                totalPoolShares = totalPoolShares.sub(stakedShareLoss);

                if (stakedShares == 0) {
                    emit StakedAssetsDepleted();
                }
            }

            if (remainingLostShares > 0) {
                emit UnstakedLoss(loss.sub(sharesToTokens(remainingLostShares)));
            }
        }

        if (loanDetail.baseAmountRepaid < loan.amount) {
            uint256 prevStrategizedFunds = strategizedFunds;
            uint256 baseAmountLost = loan.amount.sub(loanDetail.baseAmountRepaid);
            strategizedFunds = strategizedFunds.sub(baseAmountLost);

            if (strategizedFunds > 0) {
                weightedAvgStrategyAPR = prevStrategizedFunds.mul(weightedAvgStrategyAPR).sub(baseAmountLost.mul(loan.apr)).div(strategizedFunds);
            } else {
                weightedAvgStrategyAPR = 0;//templateLoanAPR;
            }
        }
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
     * @notice Handles liquidity state changes on a loan offer.
     * @dev Hook to be called when a new loan offer is made.
     *      Caller must be the LoanDesk.
     * @param amount Loan offer amount.
     */
    function onOffer(uint256 amount) external override onlyLoanDesk {
        require(strategyLiquidity() >= amount, "SaplingLendingPool: insufficient liquidity");
        poolLiquidity = poolLiquidity.sub(amount);
        allocatedFunds = allocatedFunds.add(amount);
    }

    /**
     * @notice Handles liquidity state changes on a loan offer update.
     * @dev Hook to be called when a loan offer amount is updated. Amount update can be due to offer update or 
     *      cancellation. Caller must be the LoanDesk.
     * @param prevAmount The original, now previous, offer amount.
     * @param amount New offer amount. Cancelled offer must register an amount of 0 (zero).
     */
    function onOfferUpdate(uint256 prevAmount, uint256 amount) external onlyLoanDesk {
        require(strategyLiquidity().add(prevAmount) >= amount, "SaplingLendingPool: insufficient liquidity");

        poolLiquidity = poolLiquidity.add(prevAmount).sub(amount);
        allocatedFunds = allocatedFunds.sub(prevAmount).add(amount);
    }

    /**
     * @notice View indicating whether or not a given loan can be offered by the manager.
     * @dev Hook for checking if the lending pool can provide liquidity for the total offered loans amount. 
     * @param totalOfferedAmount Total sum of offered loan amount including outstanding offers and the one to be offered.
     * @return True if the pool has sufficient lending liquidity, false otherwise.
     */
    function canOffer(uint256 totalOfferedAmount) external view override returns (bool) {
        return isPoolFunctional() && strategyLiquidity().add(allocatedFunds) >= totalOfferedAmount;
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

        uint256 paymentDueTime;

        if (loan.installments > 1) {
            uint256 installmentPeriod = loan.duration.div(loan.installments);
            uint256 pastInstallments = block.timestamp.sub(loan.borrowedTime).div(installmentPeriod);
            uint256 minTotalPayment = loan.installmentAmount.mul(pastInstallments);

            LoanDetail storage detail = loanDetails[loanId];
            if (detail.baseAmountRepaid + detail.interestPaid >= minTotalPayment) {
                return false;
            }

            paymentDueTime = loan.borrowedTime + pastInstallments * installmentPeriod;
        } else {
            paymentDueTime = loan.borrowedTime + loan.duration;
        }
        
        return block.timestamp > (paymentDueTime + loan.gracePeriod + (caller == manager ? 0 : MANAGER_INACTIVITY_GRACE_PERIOD));
    }

    /**
     * @notice Loan balance due including interest if paid in full at this time. 
     * @dev Loan must be in OUTSTANDING status.
     * @param loanId ID of the loan to check the balance of
     * @return Total amount due with interest on this loan
     */
    function loanBalanceDue(uint256 loanId) public view returns(uint256) {
        (uint256 principalOutstanding, uint256 interestOutstanding, ) = loanBalanceDueWithInterest(loanId);
        return principalOutstanding.add(interestOutstanding);
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
        return strategizedFunds;
    }

    /**
     * @notice Transfer the previous protocol wallet's accumulated fees to current protocol wallet.
     * @dev Overrides a hook in SaplingContext.
     * @param from Address of the previous protocol wallet.
     */
    function afterProtocolWalletTransfer(address from) internal override {
        require(from != address(0), "SaplingLendingPool: invalid from address");
        protocolEarnings[protocol] = protocolEarnings[protocol].add(protocolEarnings[from]);
        protocolEarnings[from] = 0;
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
    function repayBase(uint256 loanId, uint256 amount) internal nonReentrant returns (uint256, uint256) {

        Loan storage loan = loans[loanId];
        require(loan.id == loanId && loan.status == LoanStatus.OUTSTANDING, 
            "SaplingLendingPool: not found or invalid loan status");

        (uint256 transferAmount, uint256 interestPayable, uint256 payableInterestDays) = payableLoanBalance(loanId, amount);

        // enforce a small minimum payment amount, except for the last payment equal to the total amount due 
        require(transferAmount >= ONE_TOKEN || transferAmount == loanBalanceDue(loanId), 
            "SaplingLendingPool: payment amount is less than the required minimum of 1.00 token(s)");

        // charge 'amount' tokens from msg.sender
        bool success = IERC20(liquidityToken).transferFrom(msg.sender, address(this), transferAmount);
        require(success, "SaplingLendingPool: liquidity token (ERC20) transfer from msg.sender has failed");
        tokenBalance = tokenBalance.add(transferAmount);

        uint256 principalPaid = transferAmount.sub(interestPayable);

        //share profits to protocol
        uint256 protocolEarnedInterest = Math.mulDiv(interestPayable, protocolEarningPercent, ONE_HUNDRED_PERCENT);
        
        protocolEarnings[protocol] = protocolEarnings[protocol].add(protocolEarnedInterest); 

        //share profits to manager 
        uint256 currentStakePercent = Math.mulDiv(stakedShares, ONE_HUNDRED_PERCENT, totalPoolShares);
        uint256 managerEarnedInterest = Math
            .mulDiv(interestPayable.sub(protocolEarnedInterest),
                    Math.mulDiv(currentStakePercent, managerExcessLeverageComponent, ONE_HUNDRED_PERCENT), // managerEarningsPercent
                    ONE_HUNDRED_PERCENT);

        protocolEarnings[manager] = protocolEarnings[manager].add(managerEarnedInterest);

        LoanDetail storage loanDetail = loanDetails[loanId];
        loanDetail.totalAmountRepaid = loanDetail.totalAmountRepaid.add(transferAmount);
        loanDetail.baseAmountRepaid = loanDetail.baseAmountRepaid.add(principalPaid);
        loanDetail.interestPaid = loanDetail.interestPaid.add(interestPayable);
        loanDetail.lastPaymentTime = block.timestamp;
        loanDetail.interestPaidTillTime = loanDetail.interestPaidTillTime.add(payableInterestDays.mul(86400));

        borrowerStats[loan.borrower].amountBaseRepaid = borrowerStats[loan.borrower].amountBaseRepaid.add(principalPaid);
        borrowerStats[loan.borrower].amountInterestPaid = borrowerStats[loan.borrower].amountInterestPaid.add(interestPayable);

        strategizedFunds = strategizedFunds.sub(principalPaid);
        poolLiquidity = poolLiquidity.add(transferAmount.sub(protocolEarnedInterest.add(managerEarnedInterest)));

        if (loanDetail.baseAmountRepaid >= loan.amount) {
            loan.status = LoanStatus.REPAID;
            borrowerStats[loan.borrower].countRepaid++;
            borrowerStats[loan.borrower].countOutstanding--;
            borrowerStats[loan.borrower].amountBorrowed = borrowerStats[loan.borrower].amountBorrowed.sub(loan.amount);
            borrowerStats[loan.borrower].amountBaseRepaid = borrowerStats[loan.borrower].amountBaseRepaid.sub(loanDetail.baseAmountRepaid);
            borrowerStats[loan.borrower].amountInterestPaid = borrowerStats[loan.borrower].amountInterestPaid.sub(loanDetail.interestPaid);
        }

        if (strategizedFunds > 0) {
            weightedAvgStrategyAPR = strategizedFunds.add(principalPaid).mul(weightedAvgStrategyAPR).sub(principalPaid.mul(loan.apr)).div(strategizedFunds);
        } else {
            weightedAvgStrategyAPR = 0; //templateLoanAPR;
        }

        return (transferAmount, interestPayable);
    }

    /**
     * @notice Loan balances due if paid in full at this time. 
     * @param loanId ID of the loan to check the balance of
     * @return Principal outstanding, interest outstanding, and the number of interest acquired days
     */
    function loanBalanceDueWithInterest(uint256 loanId) internal view returns (uint256, uint256, uint256) {
        Loan storage loan = loans[loanId];
        if (loan.status != LoanStatus.OUTSTANDING) {
            return (0, 0, 0);
        }

        LoanDetail storage detail = loanDetails[loanId];

        uint256 daysPassed = countInterestDays(detail.interestPaidTillTime, block.timestamp);
        uint256 interestPercent = Math.mulDiv(loan.apr, daysPassed, 365);

        uint256 principalOutstanding = loan.amount.sub(detail.baseAmountRepaid);
        uint256 interestOutstanding = Math.mulDiv(principalOutstanding, interestPercent, ONE_HUNDRED_PERCENT);

        return (principalOutstanding, interestOutstanding, daysPassed);
    }

    /**
     * @notice Loan balances payable given a max payment amount. 
     * @param loanId ID of the loan to check the balance of
     * @param maxPaymentAmount Maximum liquidity token amount user has agreed to pay towards the loan
     * @return Total amount payable, interest payable, and the number of payable interest days
     */
    function payableLoanBalance(uint256 loanId, uint256 maxPaymentAmount) private view returns (uint256, uint256, uint256) {
        (uint256 principalOutstanding, uint256 interestOutstanding, uint256 interestDays) = loanBalanceDueWithInterest(loanId);
        uint256 transferAmount = Math.min(principalOutstanding.add(interestOutstanding), maxPaymentAmount);

        uint256 interestPayable;
        uint256 payableInterestDays;
        
        if (transferAmount >= interestOutstanding) {
            payableInterestDays = interestDays;
            interestPayable = interestOutstanding;
        } else {
            /*
             * Round down payable interest amount to cover a whole number of days.
             *
             * payableInterestDays = transferAmount / (interestOutstanding / interestDays) /// gives the whole number of days the transfer amount can cover
             * interestPayable = (interestOutstanding / interestDays) * payableInterestDays
             * 
             * Equations above are transformed into (a * b) / c format for best mulDiv() compatibility.
             */
            payableInterestDays = Math.mulDiv(transferAmount, interestDays, interestOutstanding);
            interestPayable = Math.mulDiv(interestOutstanding, payableInterestDays, interestDays);
        }

        return (transferAmount, interestPayable, payableInterestDays);
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
