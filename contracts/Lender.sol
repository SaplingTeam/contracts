// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./ManagedLendingPool.sol";

/**
 * @title SaplingPool Lender
 * @notice Extends ManagedLendingPool with lending functionality.
 * @dev This contract is abstract. Extend the contract to implement an intended pool functionality.
 */
abstract contract Lender is ManagedLendingPool {

    using SafeMath for uint256;

    enum LoanStatus {
        APPLIED,
        DENIED,
        APPROVED,
        CANCELLED,
        FUNDS_WITHDRAWN,
        REPAID,
        DEFAULTED
    }

    /// Loan application object
    struct Loan {
        uint256 id;
        address borrower;
        uint256 amount;
        uint256 duration; 
        uint256 gracePeriod;
        uint16 apr; 
        uint16 lateAPRDelta; 
        uint256 requestedTime;
        LoanStatus status;
    }

    /// Loan payment details object
    struct LoanDetail {
        uint256 loanId;
        uint256 totalAmountRepaid; //total amount paid including interest
        uint256 baseAmountRepaid;
        uint256 interestPaid;
        uint256 approvedTime;
        uint256 lastPaymentTime;
    }

    /// Individual borrower statistics
    struct BorrowerStats {

        /// Wallet address of the borrower
        address borrower; 

        /// All time loan request count
        uint256 countRequested;

        /// All time loan approval count
        uint256 countApproved;

        /// All time loan denial count
        uint256 countDenied;

        /// All time loan cancellation count
        uint256 countCancelled;

        /// All time loan closure count
        uint256 countRepaid;

        /// All time loan default count
        uint256 countDefaulted;

        /// Current approved loan count
        uint256 countCurrentApproved;

        /// Current outstanding loan count
        uint256 countOutstanding;

        /// Outstanding loan borrowed amount
        uint256 amountBorrowed;

        /// Outstanding loan repaid base amount
        uint256 amountBaseRepaid;

        /// Outstanding loan paid interest amount
        uint256 amountInterestPaid;

        /// most recent loanId
        uint256 recentLoanId;
    }

    event LoanRequested(uint256 loanId, address indexed borrower);
    event LoanApproved(uint256 loanId, address indexed borrower);
    event LoanDenied(uint256 loanId, address indexed borrower);
    event LoanCancelled(uint256 loanId, address indexed borrower);
    event LoanRepaid(uint256 loanId, address indexed borrower);
    event LoanDefaulted(uint256 loanId, address indexed borrower, uint256 amountLost);

    modifier loanInStatus(uint256 loanId, LoanStatus status) {
        Loan storage loan = loans[loanId];
        require(loan.id != 0, "Loan is not found.");
        require(loan.status == status, "Loan does not have a valid status for this operation.");
        _;
    }

    modifier validLender() {
        require(isValidLender(msg.sender), "SaplingPool: Caller is not a valid lender.");
        _;
    }

    modifier validBorrower() {
        require(isValidBorrower(msg.sender), "SaplingPool: Caller is not a valid borrower.");
        _;
    }

    // APR, to represent a percentage value as int, multiply by (10 ^ percentDecimals)

    /// Safe minimum for APR values
    uint16 public constant SAFE_MIN_APR = 0; // 0%

    /// Safe maximum for APR values
    uint16 public constant SAFE_MAX_APR = ONE_HUNDRED_PERCENT;

    /// Loan APR to be applied for the new loan requests
    uint16 public defaultAPR;

    /// Loan late payment APR delta to be applied fot the new loan requests
    uint16 public defaultLateAPRDelta;

    /// Weighted average loan APR on the borrowed funds
    uint256 internal weightedAvgLoanAPR;

    /// Contract math safe minimum loan amount including token decimals
    uint256 public constant SAFE_MIN_AMOUNT = 1000000; // 1 token unit with 6 decimals. i.e. 1 USDC

    /// Minimum allowed loan amount 
    uint256 public minAmount;

    /// Contract math safe minimum loan duration in seconds
    uint256 public constant SAFE_MIN_DURATION = 1 days;

    /// Contract math safe maximum loan duration in seconds
    uint256 public constant SAFE_MAX_DURATION = 51 * 365 days;

    /// Minimum loan duration in seconds
    uint256 public minDuration;

    /// Maximum loan duration in seconds
    uint256 public maxDuration;

    /// Loan payment grace period after which a loan can be defaulted
    uint256 public loanGracePeriod = 60 days;

    /// Maximum allowed loan payment grace period
    uint256 public constant MIN_LOAN_GRACE_PERIOD = 3 days;
    uint256 public constant MAX_LOAN_GRACE_PERIOD = 365 days;

    /**
     * @notice Grace period for the manager to be inactive on a given loan /cancel/default decision. 
     *         After this grace period of managers inaction on a given loan, lenders who stayed longer than EARLY_EXIT_COOLDOWN 
     *         can also call cancel() and default(). Other requirements for loan cancellation/default still apply.
     */
    uint256 public constant MANAGER_INACTIVITY_GRACE_PERIOD = 90 days;

    /// Loan id generator counter
    uint256 private nextLoanId;

    /// Quick lookup to check an address has pending loan applications
    mapping(address => bool) private hasOpenApplication;

    /// Total borrowed funds allocated for withdrawal but not yet withdrawn by the borrowers
    uint256 public loanFundsPendingWithdrawal;

    /// Borrowed funds allocated for withdrawal by borrower addresses
    mapping(address => uint256) internal loanFunds;

    /// Loan applications by loanId
    mapping(uint256 => Loan) public loans;

    /// Loan payment details by loanId. Loan detail is available only after a loan has been approved.
    mapping(uint256 => LoanDetail) public loanDetails;

    /// Borrower statistics by address 
    mapping(address => BorrowerStats) public borrowerStats;

    /**
     * @notice Create a Lender that ManagedLendingPool.
     * @dev _minAmount must be greater than or equal to SAFE_MIN_AMOUNT.
     * @param _token ERC20 token contract address to be used as main pool liquid currency.
     * @param _governance Address of the protocol governance.
     * @param _protocol Address of a wallet to accumulate protocol earnings.
     * @param _minAmount Minimum amount to be borrowed per loan.
     */
    constructor(address _token, address _governance, address _protocol, uint256 _minAmount) ManagedLendingPool(_token, _governance, _protocol) {
        
        nextLoanId = 1;

        require(SAFE_MIN_AMOUNT <= _minAmount, "New min loan amount is less than the safe limit");
        minAmount = _minAmount;
        
        defaultAPR = 300; // 30%
        defaultLateAPRDelta = 50; //5%
        minDuration = SAFE_MIN_DURATION;
        maxDuration = SAFE_MAX_DURATION;

        poolLiquidity = 0;
        borrowedFunds = 0;
        loanFundsPendingWithdrawal = 0;

        weightedAvgLoanAPR = defaultAPR;
    }

    /**
     * @notice Count of all loan requests in this pool.
     * @return Loans count.
     */
    function loansCount() external view returns(uint256) {
        return nextLoanId - 1;
    }

    /**
     * @notice Set annual loan interest rate for the future loans.
     * @dev apr must be inclusively between SAFE_MIN_APR and SAFE_MAX_APR.
     *      Caller must be the manager.
     * @param apr Loan APR to be applied for the new loan requests.
     */
    function setDefaultAPR(uint16 apr) external onlyManager notPaused {
        require(SAFE_MIN_APR <= apr && apr <= SAFE_MAX_APR, "APR is out of bounds");
        defaultAPR = apr;
    }

    /**
     * @notice Set late payment annual loan interest rate delta for the future loans.
     * @dev lateAPRDelta must be inclusively between SAFE_MIN_APR and SAFE_MAX_APR.
     *      Caller must be the manager.
     * @param lateAPRDelta Loan late payment APR delta to be applied for the new loan requests.
     */
    function setDefaultLateAPRDelta(uint16 lateAPRDelta) external onlyManager notPaused {
        require(SAFE_MIN_APR <= lateAPRDelta && lateAPRDelta <= SAFE_MAX_APR, "APR is out of bounds");
        defaultLateAPRDelta = lateAPRDelta;
    }

    /**
     * @notice Set a minimum loan amount for the future loans.
     * @dev minLoanAmount must be greater than or equal to SAFE_MIN_AMOUNT.
     *      Caller must be the manager.
     * @param minLoanAmount minimum loan amount to be enforced for the new loan requests.
     */
    function setMinLoanAmount(uint256 minLoanAmount) external onlyManager notPaused {
        require(SAFE_MIN_AMOUNT <= minLoanAmount, "New min loan amount is less than the safe limit");
        minAmount = minLoanAmount;
    }

    /**
     * @notice Set maximum loan duration for the future loans.
     * @dev Duration must be in seconds and inclusively between SAFE_MIN_DURATION and maxDuration.
     *      Caller must be the manager.
     * @param duration Maximum loan duration to be enforced for the new loan requests.
     */
    function setLoanMinDuration(uint256 duration) external onlyManager notPaused {
        require(SAFE_MIN_DURATION <= duration && duration <= maxDuration, "New min duration is out of bounds");
        minDuration = duration;
    }

    /**
     * @notice Set maximum loan duration for the future loans.
     * @dev Duration must be in seconds and inclusively between minDuration and SAFE_MAX_DURATION.
     *      Caller must be the manager.
     * @param duration Maximum loan duration to be enforced for the new loan requests.
     */
    function setLoanMaxDuration(uint256 duration) external onlyManager notPaused {
        require(minDuration <= duration && duration <= SAFE_MAX_DURATION, "New max duration is out of bounds");
        maxDuration = duration;
    }

    /**
     * @notice Set loan payment grace period for the future loans.
     * @dev Duration must be in seconds and inclusively between MIN_LOAN_GRACE_PERIOD and MAX_LOAN_GRACE_PERIOD.
     *      Caller must be the manager.
     * @param gracePeriod Loan payment grace period for new loan requests.
     */
    function setLoanGracePeriod(uint256 gracePeriod) external onlyManager notPaused {
        require(MIN_LOAN_GRACE_PERIOD <= gracePeriod && gracePeriod <= MAX_LOAN_GRACE_PERIOD, "Lender: New grace period is out of bounds.");
        loanGracePeriod = gracePeriod;
    }

    /**
     * @notice Request a new loan.
     * @dev Requested amount must be greater or equal to minAmount().
     *      Loan duration must be between minDuration() and maxDuration().
     *      Caller must not be a lender, protocol, or the manager. 
     *      Multiple pending applications from the same address are not allowed,
     *      most recent loan/application of the caller must not have APPLIED status.
     * @param requestedAmount Token amount to be borrowed.
     * @param loanDuration Loan duration in seconds. 
     * @return ID of a new loan application.
     */
    function requestLoan(uint256 requestedAmount, uint256 loanDuration) external validBorrower whenLendingNotPaused whenNotClosed notPaused returns (uint256) {

        require(hasOpenApplication[msg.sender] == false, "Another loan application is pending.");
        require(requestedAmount >= minAmount, "Loan amount is less than the minimum allowed");
        require(minDuration <= loanDuration, "Loan duration is less than minimum allowed.");
        require(maxDuration >= loanDuration, "Loan duration is more than maximum allowed.");

        uint256 loanId = nextLoanId;
        nextLoanId++;

        loans[loanId] = Loan({
            id: loanId,
            borrower: msg.sender,
            amount: requestedAmount,
            duration: loanDuration,
            gracePeriod: loanGracePeriod,
            apr: defaultAPR,
            lateAPRDelta: defaultLateAPRDelta,
            requestedTime: block.timestamp,
            status: LoanStatus.APPLIED
        });

        hasOpenApplication[msg.sender] = true;

        if (borrowerStats[msg.sender].borrower == address(0)) {
            borrowerStats[msg.sender] = BorrowerStats({
                borrower: msg.sender,
                countRequested: 1, 
                countApproved: 0, 
                countDenied: 0, 
                countCancelled: 0, 
                countRepaid: 0, 
                countDefaulted: 0, 
                countCurrentApproved: 0,
                countOutstanding: 0, 
                amountBorrowed: 0, 
                amountBaseRepaid: 0,
                amountInterestPaid: 0,
                recentLoanId: loanId
            });
        }

        borrowerStats[msg.sender].recentLoanId = loanId; 
        borrowerStats[msg.sender].countRequested++;

        emit LoanRequested(loanId, msg.sender);

        return loanId;
    }

    /**
     * @notice Approve a loan.
     * @dev Loan must be in APPLIED status.
     *      Caller must be the manager.
     *      Loan amount must not exceed poolLiquidity();
     *      Stake to pool funds ratio must be good - poolCanLend() must be true.
     */
    function approveLoan(uint256 _loanId) external onlyManager loanInStatus(_loanId, LoanStatus.APPLIED) whenLendingNotPaused whenNotClosed notPaused {
        Loan storage loan = loans[_loanId];

        require(poolLiquidity >= loan.amount + multiplyByFraction(poolFunds, targetLiquidityPercent, ONE_HUNDRED_PERCENT) + totalRequestedLiquidity, 
            "SaplingPool: Pool liquidity is insufficient to approve this loan.");
        require(poolCanLend(), "SaplingPool: Stake amount is too low to approve new loans.");

        borrowerStats[loan.borrower].countApproved++;
        borrowerStats[loan.borrower].countCurrentApproved++;

        loanDetails[_loanId] = LoanDetail({
            loanId: _loanId,
            totalAmountRepaid: 0,
            baseAmountRepaid: 0,
            interestPaid: 0,
            approvedTime: block.timestamp,
            lastPaymentTime: 0
        });

        loan.status = LoanStatus.APPROVED;
        hasOpenApplication[loan.borrower] = false;

        increaseLoanFunds(loan.borrower, loan.amount);
        poolLiquidity = poolLiquidity.sub(loan.amount);
        uint256 prevBorrowedFunds = borrowedFunds;
        borrowedFunds = borrowedFunds.add(loan.amount);

        emit LoanApproved(_loanId, loan.borrower);

        weightedAvgLoanAPR = prevBorrowedFunds.mul(weightedAvgLoanAPR).add(loan.amount.mul(loan.apr)).div(borrowedFunds);
    }

    /**
     * @notice Deny a loan.
     * @dev Loan must be in APPLIED status.
     *      Caller must be the manager.
     */
    function denyLoan(uint256 loanId) external onlyManager loanInStatus(loanId, LoanStatus.APPLIED) {
        Loan storage loan = loans[loanId];
        loan.status = LoanStatus.DENIED;
        hasOpenApplication[loan.borrower] = false;
        borrowerStats[loan.borrower].countDenied++;

        emit LoanDenied(loanId, loan.borrower);
    }

     /**
     * @notice Cancel a loan.
     * @dev Loan must be in APPROVED status.
     *      Caller must be the manager.
     */
    function cancelLoan(uint256 loanId) external managerOrApprovedOnInactive loanInStatus(loanId, LoanStatus.APPROVED) {
        Loan storage loan = loans[loanId];

        // check if the call was made by an eligible non manager party, due to manager's inaction on the loan.
        if (msg.sender != manager) {
            // require inactivity grace period
            require(block.timestamp > loanDetails[loanId].approvedTime + MANAGER_INACTIVITY_GRACE_PERIOD, 
                "It is too early to cancel this loan as a non-manager.");
        }

        loan.status = LoanStatus.CANCELLED;
        decreaseLoanFunds(loan.borrower, loan.amount);
        poolLiquidity = poolLiquidity.add(loan.amount);
        uint256 prevBorrowedFunds = borrowedFunds;
        borrowedFunds = borrowedFunds.sub(loan.amount);

        borrowerStats[loan.borrower].countCancelled++;
        borrowerStats[loan.borrower].countCurrentApproved--;
        
        emit LoanCancelled(loanId, loan.borrower);

        if (borrowedFunds > 0) {
            weightedAvgLoanAPR = prevBorrowedFunds.mul(weightedAvgLoanAPR).sub(loan.amount.mul(loan.apr)).div(borrowedFunds);
        } else {
            weightedAvgLoanAPR = defaultAPR;
        }
    }

    /**
     * @notice Make a payment towards a loan.
     * @dev Caller must be the borrower.
     *      Loan must be in FUNDS_WITHDRAWN status.
     *      Only the necessary sum is charged if amount exceeds amount due.
     *      Amount charged will not exceed the amount parameter. 
     * @param loanId ID of the loan to make a payment towards.
     * @param amount Payment amount in tokens.
     * @return A pair of total amount changed including interest, and the interest charged.
     */
    function repay(uint256 loanId, uint256 amount) external loanInStatus(loanId, LoanStatus.FUNDS_WITHDRAWN) returns (uint256, uint256) {
        Loan storage loan = loans[loanId];

        // require the payer and the borrower to be the same to avoid mispayment
        require(loan.borrower == msg.sender, "Payer is not the borrower.");

        //TODO enforce a small minimum payment amount, except for the last payment 

        (uint256 amountDue, uint256 interestPercent) = loanBalanceDueWithInterest(loanId);
        uint256 transferAmount = Math.min(amountDue, amount);

        chargeTokensFrom(msg.sender, transferAmount);

        LoanDetail storage loanDetail = loanDetails[loanId];
        loanDetail.lastPaymentTime = block.timestamp;
        
        uint256 interestPaid = multiplyByFraction(transferAmount, interestPercent, ONE_HUNDRED_PERCENT + interestPercent);
        uint256 baseAmountPaid = transferAmount.sub(interestPaid);

        //share profits to protocol
        uint256 protocolEarnedInterest = multiplyByFraction(interestPaid, protocolEarningPercent, ONE_HUNDRED_PERCENT);
        
        protocolEarnings[protocol] = protocolEarnings[protocol].add(protocolEarnedInterest); 

        //share profits to manager 
        //TODO optimize manager earnings calculation

        uint256 currentStakePercent = multiplyByFraction(stakedShares, ONE_HUNDRED_PERCENT, totalPoolShares);
        uint256 managerEarningsPercent = multiplyByFraction(currentStakePercent, managerExcessLeverageComponent, ONE_HUNDRED_PERCENT);
        uint256 managerEarnedInterest = multiplyByFraction(interestPaid.sub(protocolEarnedInterest), managerEarningsPercent, ONE_HUNDRED_PERCENT);

        protocolEarnings[manager] = protocolEarnings[manager].add(managerEarnedInterest);

        loanDetail.totalAmountRepaid = loanDetail.totalAmountRepaid.add(transferAmount);
        loanDetail.baseAmountRepaid = loanDetail.baseAmountRepaid.add(baseAmountPaid);
        loanDetail.interestPaid = loanDetail.interestPaid.add(interestPaid);

        borrowedFunds = borrowedFunds.sub(baseAmountPaid);
        poolLiquidity = poolLiquidity.add(transferAmount.sub(protocolEarnedInterest.add(managerEarnedInterest)));

        if (transferAmount == amountDue) {
            loan.status = LoanStatus.REPAID;
            borrowerStats[loan.borrower].countRepaid++;
            borrowerStats[loan.borrower].countOutstanding--;
        }

        if (borrowedFunds > 0) {
            weightedAvgLoanAPR = borrowedFunds.add(baseAmountPaid).mul(weightedAvgLoanAPR).sub(baseAmountPaid.mul(loan.apr)).div(borrowedFunds);
        } else {
            weightedAvgLoanAPR = defaultAPR;
        }

        return (transferAmount, interestPaid);
    }

    /**
     * @notice Default a loan.
     * @dev Loan must be in FUNDS_WITHDRAWN status.
     *      Caller must be the manager.
     *      canDefault(loanId) must return 'true'.
     * @param loanId ID of the loan to default
     */
    function defaultLoan(uint256 loanId) external managerOrApprovedOnInactive loanInStatus(loanId, LoanStatus.FUNDS_WITHDRAWN) notPaused {
        Loan storage loan = loans[loanId];
        LoanDetail storage loanDetail = loanDetails[loanId];

        // check if the call was made by an eligible non manager party, due to manager's inaction on the loan.
        if (msg.sender != manager) {
            // require inactivity grace period
            require(block.timestamp > loanDetail.approvedTime + loan.duration + loan.gracePeriod + MANAGER_INACTIVITY_GRACE_PERIOD, 
                "It is too early to default this loan as a non-manager.");
        }
        
        require(block.timestamp > (loanDetail.approvedTime + loan.duration + loan.gracePeriod), "Lender: It is too early to default this loan.");

        loan.status = LoanStatus.DEFAULTED;
        borrowerStats[loan.borrower].countOutstanding--;

        (, uint256 loss) = loan.amount.trySub(loanDetail.totalAmountRepaid);
        
        emit LoanDefaulted(loanId, loan.borrower, loss);

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
                poolShares[manager] = poolShares[manager].sub(stakedShareLoss);
                lockedShares[manager] = lockedShares[manager].sub(stakedShareLoss);
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
            uint256 prevBorrowedFunds = borrowedFunds;
            uint256 baseAmountLost = loan.amount.sub(loanDetail.baseAmountRepaid);
            borrowedFunds = borrowedFunds.sub(baseAmountLost);

            if (borrowedFunds > 0) {
                weightedAvgLoanAPR = prevBorrowedFunds.mul(weightedAvgLoanAPR).sub(baseAmountLost.mul(loan.apr)).div(borrowedFunds);
            } else {
                weightedAvgLoanAPR = defaultAPR;
            }
        }
    }

    /**
     * @notice View indicating whether or not a given loan can be approved by the manager.
     * @param loanId loanId ID of the loan to check
     * @return True if the given loan can be approved, false otherwise
     */
    function canApprove(uint256 loanId) external view returns (bool) {
        return poolCanLend() 
            && poolLiquidity >= loans[loanId].amount + multiplyByFraction(poolFunds, targetLiquidityPercent, ONE_HUNDRED_PERCENT) + totalRequestedLiquidity;
    }

    /**
     * @notice View indicating whether or not a given loan approval qualifies to be cancelled by a given caller.
     * @param loanId loanId ID of the loan to check
     * @param caller address that intends to call cancel() on the loan
     * @return True if the given loan approval can be cancelled, false otherwise
     */
    function canCancel(uint256 loanId, address caller) external view returns (bool) {
        if (caller != manager && !authorizedOnInactiveManager(caller)) {
            return false;
        }

        return loans[loanId].status == LoanStatus.APPROVED 
            && block.timestamp > (loanDetails[loanId].approvedTime + (caller == manager ? 0 : MANAGER_INACTIVITY_GRACE_PERIOD));
    }

    /**
     * @notice View indicating whether or not a given loan qualifies to be defaulted by a given caller.
     * @param loanId loanId ID of the loan to check
     * @param caller address that intends to call default() on the loan
     * @return True if the given loan can be defaulted, false otherwise
     */
    function canDefault(uint256 loanId, address caller) external view returns (bool) {
        if (caller != manager && !authorizedOnInactiveManager(caller)) {
            return false;
        }

        Loan storage loan = loans[loanId];

        return loan.status == LoanStatus.FUNDS_WITHDRAWN 
            && block.timestamp > (loanDetails[loanId].approvedTime + loan.duration + loan.gracePeriod + (caller == manager ? 0 : MANAGER_INACTIVITY_GRACE_PERIOD));
    }

    /**
     * @notice Loan balance due including interest if paid in full at this time. 
     * @dev Loan must be in FUNDS_WITHDRAWN status.
     * @param loanId ID of the loan to check the balance of.
     * @return Total amount due with interest on this loan.
     */
    function loanBalanceDue(uint256 loanId) external view loanInStatus(loanId, LoanStatus.FUNDS_WITHDRAWN) returns(uint256) {
        (uint256 amountDue,) = loanBalanceDueWithInterest(loanId);
        return amountDue;
    }

    function recentLoanIdOf(address borrower) external view returns (uint256) {
        return borrowerStats[borrower].recentLoanId;
    }

    /**
     * @notice Loan balance due including interest if paid in full at this time. 
     * @dev Internal method to get the amount due and the interest rate applied.
     * @param loanId ID of the loan to check the balance of.
     * @return A pair of a total amount due with interest on this loan, and a percentage representing the interest part of the due amount.
     */
    function loanBalanceDueWithInterest(uint256 loanId) internal view returns (uint256, uint256) {
        Loan storage loan = loans[loanId];
        if (loan.status == LoanStatus.REPAID) {
            return (0, 0);
        }

        LoanDetail storage loanDetail = loanDetails[loanId];

        // calculate interest percent
        uint256 daysPassed = countInterestDays(loanDetail.approvedTime, block.timestamp);
        uint256 apr;
        uint256 loanDueTime = loanDetail.approvedTime.add(loan.duration);
        if (block.timestamp <= loanDueTime) { 
            apr = loan.apr;
        } else {
            uint256 lateDays = countInterestDays(loanDueTime, block.timestamp);
            apr = daysPassed
                .mul(loan.apr)
                .add(lateDays.mul(loan.lateAPRDelta))
                .div(daysPassed);
        }

        uint256 interestPercent = multiplyByFraction(apr, daysPassed, 365);

        uint256 baseAmountDue = loan.amount.sub(loanDetail.baseAmountRepaid);
        uint256 balanceDue = baseAmountDue.add(multiplyByFraction(baseAmountDue, interestPercent, ONE_HUNDRED_PERCENT));

        return (balanceDue, interestPercent);
    }

    /**
     * @notice Get the number of days in a time period to witch an interest can be applied.
     * @dev Internal helper method. Returns the ceiling of the count. 
     * @param timeFrom Epoch timestamp of the start of the time period.
     * @param timeTo Epoch timestamp of the end of the time period. 
     * @return Ceil count of days in a time period to witch an interest can be applied.
     */
    function countInterestDays(uint256 timeFrom, uint256 timeTo) private pure returns(uint256) {
        uint256 countSeconds = timeTo.sub(timeFrom);
        uint256 dayCount = countSeconds.div(86400);

        if (countSeconds.mod(86400) > 0) {
            dayCount++;
        }

        return dayCount;
    }

    //TODO consider security implications of having the following internal function
    /**
     * @dev Internal method to allocate funds to borrow upon loan approval
     * @param wallet Address to allocate funds to.
     * @param amount Token amount to allocate.
     */
    function increaseLoanFunds(address wallet, uint256 amount) private {
        loanFunds[wallet] = loanFunds[wallet].add(amount);
        loanFundsPendingWithdrawal = loanFundsPendingWithdrawal.add(amount);
    }

    //TODO consider security implications of having the following internal function
    /**
     * @dev Internal method to deallocate funds to borrow upon borrow()
     * @param wallet Address to deallocate the funds of.
     * @param amount Token amount to deallocate.
     */
    function decreaseLoanFunds(address wallet, uint256 amount) internal {
        require(loanFunds[wallet] >= amount, "SaplingPool: requested amount is not available in the funding account");
        loanFunds[wallet] = loanFunds[wallet].sub(amount);
        loanFundsPendingWithdrawal = loanFundsPendingWithdrawal.sub(amount);
    }

    /**
     * @notice Determine if a wallet address qualifies as a lender or not.
     * @dev deposit() will reject if the wallet cannot be a lender.
     * @return True if the specified wallet can make deposits as a lender, false otherwise. 
     */
    function isValidLender(address wallet) public view returns (bool) {
        return wallet != address(0) && wallet != manager && wallet != protocol && wallet != governance 
            && hasOpenApplication[wallet] == false && borrowerStats[msg.sender].countApproved == 0 
            && borrowerStats[msg.sender].countOutstanding == 0; 
    }

    /**
     * @notice Determine if a wallet address qualifies as a borrower or not.
     * @dev requestLoan() will reject if the wallet cannot be a borrower.
     * @return True if the specified wallet can make loan requests as a borrower, false otherwise. 
     */
    function isValidBorrower(address wallet) public view returns (bool) {
        return wallet != address(0) && wallet != manager && wallet != protocol && wallet != governance 
            && sharesToTokens(poolShares[wallet]) <= ONE_TOKEN;
    }
}
