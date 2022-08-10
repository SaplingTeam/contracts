// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.15;

import "./ManagedLendingPool.sol";

/**
 * @title SaplingPool Lender
 * @notice Extends ManagedLendingPool with lending functionality.
 * @dev This contract is abstract. Extend the contract to implement an intended pool functionality.
 */
abstract contract Lender is ManagedLendingPool {

    using SafeMath for uint256;

    // do not use zero enum as it is the default value in an uninitialized struct, and some modifiers may use first logical enum state for validation
    enum LoanApplicationStatus {
        NULL, 
        APPLIED,
        DENIED,
        OFFER_MADE,
        OFFER_ACCEPTED,
        OFFER_CANCELLED
    }

    /// Loan application object
    struct LoanApplication {
        uint256 id;
        address borrower;
        uint256 amount;
        uint256 duration;
        uint256 requestedTime;
        LoanApplicationStatus status;

        //TODO replace personal info fields with metadata id and hash 
        string name;
        string email;
        string phone;
        string businessName;
    }

    struct LoanOffer {
        uint256 applicationId;
        address borrower;
        uint256 amount;
        uint256 duration;
        uint256 gracePeriod;
        uint16 installments;
        uint16 apr; 
        uint16 lateAPRDelta;
        uint256 offeredTime;
    }

    enum LoanStatus {
        NULL,
        OUTSTANDING,
        REPAID,
        DEFAULTED
    }

    /// Loan object
    struct Loan {
        uint256 id;
        uint256 applicationId;
        address borrower;
        uint256 amount;
        uint256 duration; 
        uint256 gracePeriod;
        uint16 installments;
        uint16 apr;
        uint16 lateAPRDelta;
        uint256 borrowedTime;
        LoanStatus status;
    }

    struct LoanDetail {
        uint256 loanId;
        uint256 totalAmountRepaid; //total amount paid including interest
        uint256 baseAmountRepaid;
        uint256 interestPaid;
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

    event LoanRequested(uint256 applicationId, address indexed borrower);
    event LoanRequestDenied(uint256 applicationId, address indexed borrower);
    event LoanOffered(uint256 applicationId, address indexed borrower);
    event LoanOfferUpdated(uint256 applicationId, address indexed borrower);
    event LoanOfferCancelled(uint256 applicationId, address indexed borrower);

    event LoanBorrowed(uint256 loanId, address indexed borrower, uint256 applicationId);
    event LoanRepaid(uint256 loanId, address indexed borrower);
    event LoanDefaulted(uint256 loanId, address indexed borrower, uint256 amountLost);

    modifier loanInStatus(uint256 loanId, LoanStatus status) {
        Loan storage loan = loans[loanId];
        require(loan.id != 0, "Loan is not found.");
        require(loan.status == status, "Loan does not have a valid status for this operation.");
        _;
    }

    modifier applicationInStatus(uint256 applicationId, LoanApplicationStatus status) {
        LoanApplication storage app = loanApplications[applicationId];
        require(app.id != 0, "Loan application is not found.");
        require(app.status == status, "Loan application does not have a valid status for this operation.");
        _;
    }

    modifier onlyUser() {
        require(msg.sender != manager && msg.sender != protocol && msg.sender != governance, "SaplingPool: Caller is not a valid lender.");
        _;
    }

    // APR, to represent a percentage value as int, multiply by (10 ^ percentDecimals)

    /// Safe minimum for APR values
    uint16 public constant SAFE_MIN_APR = 0; // 0%

    /// Safe maximum for APR values
    uint16 public immutable SAFE_MAX_APR;

    /// Loan APR to be applied for the new loan requests
    uint16 public templateLoanAPR;

    /// Loan late payment APR delta to be applied fot the new loan requests
    uint16 public templateLateLoanAPRDelta;

    /// Weighted average loan APR on the borrowed funds
    uint256 internal weightedAvgLoanAPR;

    /// Contract math safe minimum loan amount including token decimals
    uint256 public immutable SAFE_MIN_AMOUNT;

    /// Minimum allowed loan amount 
    uint256 public minLoanAmount;

    /// Contract math safe minimum loan duration in seconds
    uint256 public constant SAFE_MIN_DURATION = 1 days;

    /// Contract math safe maximum loan duration in seconds
    uint256 public constant SAFE_MAX_DURATION = 51 * 365 days;

    /// Minimum loan duration in seconds
    uint256 public minLoanDuration;

    /// Maximum loan duration in seconds
    uint256 public maxLoanDuration;

    /// Loan payment grace period after which a loan can be defaulted
    uint256 public templateLoanGracePeriod = 60 days;

    /// Maximum allowed loan payment grace period
    uint256 public constant MIN_LOAN_GRACE_PERIOD = 3 days;
    uint256 public constant MAX_LOAN_GRACE_PERIOD = 365 days;

    /**
     * @notice Grace period for the manager to be inactive on a given loan /cancel/default decision. 
     *         After this grace period of managers inaction on a given loan, lenders who stayed longer than EARLY_EXIT_COOLDOWN 
     *         can also call cancel() and default(). Other requirements for loan cancellation/default still apply.
     */
    uint256 public constant MANAGER_INACTIVITY_GRACE_PERIOD = 90 days;

    /// Loan application id generator counter
    uint256 private nextApplicationId;

    /// Loan id generator counter
    uint256 private nextLoanId;

    /// Quick lookup to check an address has pending loan applications
    mapping(address => bool) private hasOpenApplication;

    mapping(address => uint256) public recentApplicationIdOf;

    /// Total borrowed funds allocated for withdrawal but not yet withdrawn by the borrowers
    uint256 public loanFundsPendingWithdrawal;

    /// Loan applications by applicationId
    mapping(uint256 => LoanApplication) public loanApplications;

    /// Loan offers by applicationId
    mapping(uint256 => LoanOffer) public loanOffers;

    /// Loans by loanId
    mapping(uint256 => Loan) public loans;

    mapping(uint256 => LoanDetail) public loanDetails;

    /// Borrower statistics by address 
    mapping(address => BorrowerStats) public borrowerStats;

    /**
     * @notice Create a Lender that ManagedLendingPool.
     * @dev _minAmount must be greater than or equal to SAFE_MIN_AMOUNT.
     * @param _poolToken ERC20 token contract address to be used as the pool issued token.
     * @param _liquidityToken ERC20 token contract address to be used as main pool liquid currency.
     * @param _governance Address of the protocol governance.
     * @param _protocol Address of a wallet to accumulate protocol earnings.
     * @param _manager Address of the pool manager.
     */
    constructor(address _poolToken, address _liquidityToken, address _governance, address _protocol, address _manager) ManagedLendingPool(_poolToken, _liquidityToken, _governance, _protocol, _manager) {
        
        SAFE_MIN_AMOUNT = ONE_TOKEN;
        minLoanAmount = ONE_TOKEN.mul(100);

        SAFE_MAX_APR = ONE_HUNDRED_PERCENT;
        templateLoanAPR = uint16(30 * 10 ** PERCENT_DECIMALS); // 30%
        templateLateLoanAPRDelta = uint16(5 * 10 ** PERCENT_DECIMALS); //5%
        weightedAvgLoanAPR = templateLoanAPR;
        
        minLoanDuration = SAFE_MIN_DURATION;
        maxLoanDuration = SAFE_MAX_DURATION;

        nextLoanId = 1;
        nextApplicationId = 1;

        poolLiquidity = 0;
        borrowedFunds = 0;
        loanFundsPendingWithdrawal = 0;
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
    function setTemplateLoanAPR(uint16 apr) external onlyManager notPaused {
        require(SAFE_MIN_APR <= apr && apr <= SAFE_MAX_APR, "APR is out of bounds");
        templateLoanAPR = apr;
    }

    /**
     * @notice Set late payment annual loan interest rate delta for the future loans.
     * @dev lateAPRDelta must be inclusively between SAFE_MIN_APR and SAFE_MAX_APR.
     *      Caller must be the manager.
     * @param lateAPRDelta Loan late payment APR delta to be applied for the new loan requests.
     */
    function setTemplateLateLoanAPRDelta(uint16 lateAPRDelta) external onlyManager notPaused {
        require(SAFE_MIN_APR <= lateAPRDelta && lateAPRDelta <= SAFE_MAX_APR, "APR is out of bounds");
        templateLateLoanAPRDelta = lateAPRDelta;
    }

    /**
     * @notice Set a minimum loan amount for the future loans.
     * @dev minLoanAmount must be greater than or equal to SAFE_MIN_AMOUNT.
     *      Caller must be the manager.
     * @param _minLoanAmount minimum loan amount to be enforced for the new loan requests.
     */
    function setMinLoanAmount(uint256 _minLoanAmount) external onlyManager notPaused {
        require(SAFE_MIN_AMOUNT <= _minLoanAmount, "New min loan amount is less than the safe limit");
        minLoanAmount = _minLoanAmount;
    }

    /**
     * @notice Set maximum loan duration for the future loans.
     * @dev Duration must be in seconds and inclusively between SAFE_MIN_DURATION and maxLoanDuration.
     *      Caller must be the manager.
     * @param duration Maximum loan duration to be enforced for the new loan requests.
     */
    function setMinLoanDuration(uint256 duration) external onlyManager notPaused {
        require(SAFE_MIN_DURATION <= duration && duration <= maxLoanDuration, "New min duration is out of bounds");
        minLoanDuration = duration;
    }

    /**
     * @notice Set maximum loan duration for the future loans.
     * @dev Duration must be in seconds and inclusively between minLoanDuration and SAFE_MAX_DURATION.
     *      Caller must be the manager.
     * @param duration Maximum loan duration to be enforced for the new loan requests.
     */
    function setMaxLoanDuration(uint256 duration) external onlyManager notPaused {
        require(minLoanDuration <= duration && duration <= SAFE_MAX_DURATION, "New max duration is out of bounds");
        maxLoanDuration = duration;
    }

    /**
     * @notice Set loan payment grace period for the future loans.
     * @dev Duration must be in seconds and inclusively between MIN_LOAN_GRACE_PERIOD and MAX_LOAN_GRACE_PERIOD.
     *      Caller must be the manager.
     * @param gracePeriod Loan payment grace period for new loan requests.
     */
    function setTemplateLoanGracePeriod(uint256 gracePeriod) external onlyManager notPaused {
        require(MIN_LOAN_GRACE_PERIOD <= gracePeriod && gracePeriod <= MAX_LOAN_GRACE_PERIOD, "Lender: New grace period is out of bounds.");
        templateLoanGracePeriod = gracePeriod;
    }

    /**
     * @notice Request a new loan.
     * @dev Requested amount must be greater or equal to minLoanAmount().
     *      Loan duration must be between minLoanDuration() and maxLoanDuration().
     *      Caller must not be a lender, protocol, or the manager. 
     *      Multiple pending applications from the same address are not allowed,
     *      most recent loan/application of the caller must not have APPLIED status.
     * @param requestedAmount Token amount to be borrowed.
     * @param loanDuration Loan duration in seconds. 
     * @return ID of a new loan application.
     */
    function requestLoan(
        uint256 requestedAmount, 
        uint256 loanDuration, 
        string memory _name, 
        string memory _email, 
        string memory _phone, 
        string memory _businessName
    ) 
        external 
        onlyUser
        whenLendingNotPaused 
        whenNotClosed 
        notPaused 
        returns (uint256)
    {

        require(hasOpenApplication[msg.sender] == false, "Another loan application is pending.");
        require(requestedAmount >= minLoanAmount, "Loan amount is less than the minimum allowed");
        require(minLoanDuration <= loanDuration, "Loan duration is less than minimum allowed.");
        require(maxLoanDuration >= loanDuration, "Loan duration is more than maximum allowed.");

        uint256 appId = nextApplicationId;
        nextApplicationId++;

        loanApplications[appId] = LoanApplication({
            id: appId,
            borrower: msg.sender,
            amount: requestedAmount,
            duration: loanDuration,
            requestedTime: block.timestamp,
            status: LoanApplicationStatus.APPLIED,
            name: _name,
            email: _email,
            phone: _phone,
            businessName: _businessName
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
                recentLoanId: 0
            });
        } else {
            borrowerStats[msg.sender].countRequested++;
        }

        recentApplicationIdOf[msg.sender] = appId;

        emit LoanRequested(appId, msg.sender);

        return appId;
    }

    /**
     * @notice Approve a loan application and offer a loan.
     * @dev Loan application must be in APPLIED status.
     *      Caller must be the manager.
     *      Loan amount must not exceed poolLiquidity();
     *      Stake to pool funds ratio must be good - poolCanLend() must be true.
     */
    function offerLoan(
        uint256 appId, 
        uint256 _amount, 
        uint256 _duration, 
        uint256 _gracePeriod, 
        uint16 _installments, 
        uint16 _apr, 
        uint16 _lateAPRDelta
    ) 
        external 
        onlyManager 
        applicationInStatus(appId, LoanApplicationStatus.APPLIED) 
        whenLendingNotPaused 
        whenNotClosed 
        notPaused 
    {
        LoanApplication storage app = loanApplications[appId];

        require(poolLiquidity >= _amount + Math.mulDiv(poolFunds, targetLiquidityPercent, ONE_HUNDRED_PERCENT), 
            "SaplingPool: Pool liquidity is insufficient to approve this loan.");
        require(poolCanLend(), "SaplingPool: Stake amount is too low to approve new loans.");

        borrowerStats[app.borrower].countApproved++;
        borrowerStats[app.borrower].countCurrentApproved++;

        LoanOffer memory offer = LoanOffer({
            applicationId: appId,
            borrower: app.borrower,
            amount: _amount,
            duration: _duration,
            gracePeriod: _gracePeriod,
            installments: _installments,
            apr: _apr,
            lateAPRDelta: _lateAPRDelta,
            offeredTime: block.timestamp
        });

        loanOffers[appId] = offer;

        loanApplications[appId].status = LoanApplicationStatus.OFFER_MADE;
        // hasOpenApplication[loan.borrower] = false; //todo set this on deny, cancel or borrow

        loanFundsPendingWithdrawal = loanFundsPendingWithdrawal.add(offer.amount);
        poolLiquidity = poolLiquidity.sub(offer.amount);
        uint256 prevBorrowedFunds = borrowedFunds;
        borrowedFunds = borrowedFunds.add(offer.amount);

        emit LoanOffered(appId, offer.borrower);

        weightedAvgLoanAPR = prevBorrowedFunds.mul(weightedAvgLoanAPR).add(offer.amount.mul(offer.apr)).div(borrowedFunds);
    }

    /**
     * @notice Update an existing loan offer offer a loan.
     * @dev Loan application must be in OFFER_MADE status.
     *      Caller must be the manager.
     *      Loan amount must not exceed poolLiquidity();
     *      Stake to pool funds ratio must be good - poolCanLend() must be true.
     */
    function updateOffer(uint256 appId, uint256 _amount, uint256 _duration, uint256 _gracePeriod, uint16 _installments, uint16 _apr, uint16 _lateAPRDelta) external onlyManager applicationInStatus(appId, LoanApplicationStatus.OFFER_MADE) whenLendingNotPaused whenNotClosed notPaused {
        LoanOffer memory offer = loanOffers[appId];

        require(offer.amount <= _amount || poolLiquidity + offer.amount >= _amount + Math.mulDiv(poolFunds, targetLiquidityPercent, ONE_HUNDRED_PERCENT), 
            "SaplingPool: Pool liquidity is insufficient to approve this loan.");
        require(offer.amount <= _amount || poolCanLend(), "SaplingPool: Stake amount is too low to approve new loans.");

        offer.duration = _duration;
        offer.gracePeriod = _gracePeriod;
        offer.installments = _installments;
        offer.lateAPRDelta = _lateAPRDelta;
        offer.offeredTime = block.timestamp;

        if (offer.amount != _amount || offer.apr != _apr) {

            // undo effect of previous amount and apt to pool state
            loanFundsPendingWithdrawal = loanFundsPendingWithdrawal.sub(offer.amount);
            poolLiquidity = poolLiquidity.add(offer.amount);
            uint256 prevBorrowedFunds = borrowedFunds;
            borrowedFunds = borrowedFunds.sub(offer.amount);

            if (borrowedFunds > 0) {
                weightedAvgLoanAPR = prevBorrowedFunds.mul(weightedAvgLoanAPR).sub(offer.amount.mul(offer.apr)).div(borrowedFunds);
            } else {
                weightedAvgLoanAPR = templateLoanAPR;
            }

            //set new amount and apr
            offer.amount = _amount;
            offer.apr = _apr;

            // apply effect of the new amount and apr to the pool state
            loanFundsPendingWithdrawal = loanFundsPendingWithdrawal.add(offer.amount);
            poolLiquidity = poolLiquidity.sub(offer.amount);
            prevBorrowedFunds = borrowedFunds;
            borrowedFunds = borrowedFunds.add(offer.amount);

            weightedAvgLoanAPR = prevBorrowedFunds.mul(weightedAvgLoanAPR).add(offer.amount.mul(offer.apr)).div(borrowedFunds);
        }
        emit LoanOfferUpdated(appId, offer.borrower);
    }

    /**
     * @notice Deny a loan.
     * @dev Loan must be in APPLIED status.
     *      Caller must be the manager.
     */
    function denyLoan(uint256 appId) external onlyManager applicationInStatus(appId, LoanApplicationStatus.APPLIED) {
        LoanApplication storage app = loanApplications[appId];
        app.status = LoanApplicationStatus.DENIED;
        hasOpenApplication[app.borrower] = false;
        borrowerStats[app.borrower].countDenied++;

        emit LoanRequestDenied(appId, app.borrower);
    }

     /**
     * @notice Cancel a loan.
     * @dev Loan must be in APPROVED status.
     *      Caller must be the manager.
     */
    function cancelLoan(uint256 appId) external managerOrApprovedOnInactive applicationInStatus(appId, LoanApplicationStatus.OFFER_MADE) {
        LoanOffer storage offer = loanOffers[appId];

        // check if the call was made by an eligible non manager party, due to manager's inaction on the loan.
        if (msg.sender != manager) {
            // require inactivity grace period
            require(block.timestamp > offer.offeredTime + MANAGER_INACTIVITY_GRACE_PERIOD, 
                "It is too early to cancel this loan as a non-manager.");
        }

        loanApplications[appId].status = LoanApplicationStatus.OFFER_CANCELLED;
        loanFundsPendingWithdrawal = loanFundsPendingWithdrawal.sub(offer.amount);
        poolLiquidity = poolLiquidity.add(offer.amount);
        uint256 prevBorrowedFunds = borrowedFunds;
        borrowedFunds = borrowedFunds.sub(offer.amount);

        borrowerStats[offer.borrower].countCancelled++;
        borrowerStats[offer.borrower].countCurrentApproved--;
        
        emit LoanOfferCancelled(appId, offer.borrower);

        if (borrowedFunds > 0) {
            weightedAvgLoanAPR = prevBorrowedFunds.mul(weightedAvgLoanAPR).sub(offer.amount.mul(offer.apr)).div(borrowedFunds);
        } else {
            weightedAvgLoanAPR = templateLoanAPR;
        }
    }

    /**
     * @notice Accept loan offer and withdraw funds
     * @dev Caller must be the borrower. 
     *      The loan must be in APPROVED status.
     * @param appId id of the loan application to accept the offer of. 
     */
    function borrow(uint256 appId) external applicationInStatus(appId, LoanApplicationStatus.OFFER_MADE) whenLendingNotPaused whenNotClosed notPaused {
        LoanOffer storage offer = loanOffers[appId];
        require(offer.borrower == msg.sender, "SaplingPool: Withdrawal requester is not the borrower on this loan.");

        borrowerStats[offer.borrower].countCurrentApproved--;
        borrowerStats[offer.borrower].countOutstanding++;
        borrowerStats[offer.borrower].amountBorrowed = borrowerStats[offer.borrower].amountBorrowed.add(offer.amount);
        
        loanApplications[appId].status = LoanApplicationStatus.OFFER_ACCEPTED;

        uint256 loanId = nextLoanId;
        nextLoanId++;

        loans[loanId] = Loan({
            id: loanId,
            applicationId: appId,
            borrower: offer.borrower,
            amount: offer.amount,
            duration: offer.duration,
            gracePeriod: offer.gracePeriod,
            installments: offer.installments,
            apr: offer.apr,
            lateAPRDelta: offer.lateAPRDelta,
            borrowedTime: block.timestamp,
            status: LoanStatus.OUTSTANDING
        });

        loanDetails[loanId] = LoanDetail({
            loanId: loanId,
            totalAmountRepaid: 0,
            baseAmountRepaid: 0,
            interestPaid: 0,
            lastPaymentTime: 0
        });

        borrowerStats[offer.borrower].recentLoanId = loanId;

        loanFundsPendingWithdrawal = loanFundsPendingWithdrawal.sub(offer.amount);

        tokenBalance = tokenBalance.sub(offer.amount);
        bool success = IERC20(liquidityToken).transfer(msg.sender, offer.amount);
        require(success);

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
     * @return A pair of total amount changed including interest, and the interest charged.
     */
    function repay(uint256 loanId, uint256 amount) external loanInStatus(loanId, LoanStatus.OUTSTANDING) returns (uint256, uint256) {

        // require the payer and the borrower to be the same to avoid mispayment
        require(loans[loanId].borrower == msg.sender, "Payer is not the borrower.");

        return repayBase(loanId, amount);
    }

    /**
     * @notice Make a payment towards a loan on behalf od a borrower
     * @dev Loan must be in OUTSTANDING status.
     *      Only the necessary sum is charged if amount exceeds amount due.
     *      Amount charged will not exceed the amount parameter. 
     * @param loanId ID of the loan to make a payment towards.
     * @param amount Payment amount in tokens.
     * @param borrower address of the borrower to make a payment in behalf of.
     * @return A pair of total amount changed including interest, and the interest charged.
     */
    function repayOnBehalf(uint256 loanId, uint256 amount, address borrower) external loanInStatus(loanId, LoanStatus.OUTSTANDING) returns (uint256, uint256) {

        // require the payer and the borrower to be the same to avoid mispayment
        require(loans[loanId].borrower == borrower, "The specified loan does not belong to the borrower.");

        return repayBase(loanId, amount);
    }

    /**
     * @notice Make a payment towards a loan.
     * @dev Loan must be in OUTSTANDING status.
     *      Only the necessary sum is charged if amount exceeds amount due.
     *      Amount charged will not exceed the amount parameter. 
     * @param loanId ID of the loan to make a payment towards.
     * @param amount Payment amount in tokens.
     * @return A pair of total amount charged including interest, and the interest charged.
     */
    function repayBase(uint256 loanId, uint256 amount) internal loanInStatus(loanId, LoanStatus.OUTSTANDING) returns (uint256, uint256) {

        (uint256 amountDue, uint256 interestPercent) = loanBalanceDueWithInterest(loanId);
        uint256 transferAmount = Math.min(amountDue, amount);

        // enforce a small minimum payment amount, except for the last payment 
        require(transferAmount == amountDue || transferAmount >= ONE_TOKEN, "Sapling: Payment amount is less than the required minimum of 1 token.");

        // charge 'amount' tokens from msg.sender
        bool success = IERC20(liquidityToken).transferFrom(msg.sender, address(this), transferAmount);
        require(success);
        tokenBalance = tokenBalance.add(transferAmount);

        Loan storage loan = loans[loanId];
        LoanDetail storage loanDetail = loanDetails[loanId];
        // loan.lastPaymentTime = block.timestamp;
        
        uint256 interestPaid = Math.mulDiv(transferAmount, interestPercent, ONE_HUNDRED_PERCENT + interestPercent);
        uint256 baseAmountPaid = transferAmount.sub(interestPaid);

        //share profits to protocol
        uint256 protocolEarnedInterest = Math.mulDiv(interestPaid, protocolEarningPercent, ONE_HUNDRED_PERCENT);
        
        protocolEarnings[protocol] = protocolEarnings[protocol].add(protocolEarnedInterest); 

        //share profits to manager 
        uint256 currentStakePercent = Math.mulDiv(stakedShares, ONE_HUNDRED_PERCENT, totalPoolShares);
        uint256 managerEarnedInterest = Math
            .mulDiv(interestPaid.sub(protocolEarnedInterest),
                    Math.mulDiv(currentStakePercent, managerExcessLeverageComponent, ONE_HUNDRED_PERCENT), // managerEarningsPercent
                    ONE_HUNDRED_PERCENT);

        protocolEarnings[manager] = protocolEarnings[manager].add(managerEarnedInterest);

        loanDetail.totalAmountRepaid = loanDetail.totalAmountRepaid.add(transferAmount);
        loanDetail.baseAmountRepaid = loanDetail.baseAmountRepaid.add(baseAmountPaid);
        loanDetail.interestPaid = loanDetail.interestPaid.add(interestPaid);
        loanDetail.lastPaymentTime = block.timestamp;

        borrowerStats[loan.borrower].amountBaseRepaid = borrowerStats[loan.borrower].amountBaseRepaid.add(baseAmountPaid);
        borrowerStats[loan.borrower].amountInterestPaid = borrowerStats[loan.borrower].amountInterestPaid.add(interestPaid);

        borrowedFunds = borrowedFunds.sub(baseAmountPaid);
        poolLiquidity = poolLiquidity.add(transferAmount.sub(protocolEarnedInterest.add(managerEarnedInterest)));

        if (transferAmount == amountDue) {
            loan.status = LoanStatus.REPAID;
            borrowerStats[loan.borrower].countRepaid++;
            borrowerStats[loan.borrower].countOutstanding--;
            borrowerStats[loan.borrower].amountBorrowed = borrowerStats[loan.borrower].amountBorrowed.sub(loan.amount);
            borrowerStats[loan.borrower].amountBaseRepaid = borrowerStats[loan.borrower].amountBaseRepaid.sub(loanDetail.baseAmountRepaid);
            borrowerStats[loan.borrower].amountInterestPaid = borrowerStats[loan.borrower].amountInterestPaid.sub(loanDetail.interestPaid);
        }

        if (borrowedFunds > 0) {
            weightedAvgLoanAPR = borrowedFunds.add(baseAmountPaid).mul(weightedAvgLoanAPR).sub(baseAmountPaid.mul(loan.apr)).div(borrowedFunds);
        } else {
            weightedAvgLoanAPR = templateLoanAPR;
        }

        return (transferAmount, interestPaid);
    }

    /**
     * @notice Default a loan.
     * @dev Loan must be in OUTSTANDING status.
     *      Caller must be the manager.
     *      canDefault(loanId) must return 'true'.
     * @param loanId ID of the loan to default
     */
    function defaultLoan(uint256 loanId) external managerOrApprovedOnInactive loanInStatus(loanId, LoanStatus.OUTSTANDING) notPaused {
        Loan storage loan = loans[loanId];
        LoanDetail storage loanDetail = loanDetails[loanId];

        // check if the call was made by an eligible non manager party, due to manager's inaction on the loan.
        if (msg.sender != manager) {
            // require inactivity grace period
            require(block.timestamp > loan.borrowedTime + loan.duration + loan.gracePeriod + MANAGER_INACTIVITY_GRACE_PERIOD, 
                "It is too early to default this loan as a non-manager.");
        }
        
        require(block.timestamp > (loan.borrowedTime + loan.duration + loan.gracePeriod), "Lender: It is too early to default this loan.");

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
                weightedAvgLoanAPR = templateLoanAPR;
            }
        }
    }

    /**
     * @notice View indicating whether or not a given loan can be approved by the manager.
     * @param appId application ID to check
     * @return True if the given loan can be approved, false otherwise
     */
    function canOffer(uint256 appId) external view returns (bool) {
        return poolCanLend() 
            && poolLiquidity >= loanApplications[appId].amount + Math.mulDiv(poolFunds, targetLiquidityPercent, ONE_HUNDRED_PERCENT);
    }

    /**
     * @notice View indicating whether or not a given loan approval qualifies to be cancelled by a given caller.
     * @param appId application ID to check
     * @param caller address that intends to call cancel() on the loan
     * @return True if the given loan approval can be cancelled, false otherwise
     */
    function canCancel(uint256 appId, address caller) external view returns (bool) {
        if (caller != manager && !authorizedOnInactiveManager(caller)) {
            return false;
        }

        return loanApplications[appId].status == LoanApplicationStatus.OFFER_MADE 
            && block.timestamp >= (loanOffers[appId].offeredTime + (caller == manager ? 0 : MANAGER_INACTIVITY_GRACE_PERIOD));
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

        return loan.status == LoanStatus.OUTSTANDING 
            && block.timestamp > (loan.borrowedTime + loan.duration + loan.gracePeriod + (caller == manager ? 0 : MANAGER_INACTIVITY_GRACE_PERIOD));
    }

    /**
     * @notice Loan balance due including interest if paid in full at this time. 
     * @dev Loan must be in OUTSTANDING status.
     * @param loanId ID of the loan to check the balance of.
     * @return Total amount due with interest on this loan.
     */
    function loanBalanceDue(uint256 loanId) external view returns(uint256) {
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
        if (loan.status != LoanStatus.OUTSTANDING) {
            return (0, 0);
        }

        // calculate interest percent
        uint256 daysPassed = countInterestDays(loan.borrowedTime, block.timestamp);
        uint256 apr;
        uint256 loanDueTime = loan.borrowedTime.add(loan.duration);
        if (block.timestamp <= loanDueTime) { 
            apr = loan.apr;
        } else {
            uint256 lateDays = countInterestDays(loanDueTime, block.timestamp);
            apr = daysPassed
                .mul(loan.apr)
                .add(lateDays.mul(loan.lateAPRDelta))
                .div(daysPassed);
        }

        uint256 interestPercent = Math.mulDiv(apr, daysPassed, 365);

        uint256 baseAmountDue = loan.amount.sub(loanDetails[loanId].baseAmountRepaid);
        uint256 balanceDue = baseAmountDue.add(Math.mulDiv(baseAmountDue, interestPercent, ONE_HUNDRED_PERCENT));

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
}
