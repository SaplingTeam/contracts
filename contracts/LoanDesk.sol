// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.15;

import "./context/SaplingManagerContext.sol";
import "./context/SaplingMathContext.sol";
import "./interfaces/ILoanDesk.sol";
import "./interfaces/ILoanDeskOwner.sol";

/**
 * @title SaplingPool Lender
 * @notice Extends ManagedLendingPool with lending functionality.
 * @dev This contract is abstract. Extend the contract to implement an intended pool functionality.
 */
contract LoanDesk is ILoanDesk, SaplingManagerContext, SaplingMathContext {

    using SafeMath for uint256;

    /// Loan application object
    struct LoanApplication {
        uint256 id;
        address borrower;
        uint256 amount;
        uint256 duration;
        uint256 requestedTime;
        LoanApplicationStatus status;

        string profileId;
        string profileDigest;
    }

    /// Individual borrower statistics
    struct BorrowerStats {

        /// Wallet address of the borrower
        address borrower; 

        /// All time loan request count
        uint256 countRequested;

        /// All time loan denial count
        uint256 countDenied;

        /// All time loan offer count
        uint256 countOffered;

        /// All time loan borrow count
        uint256 countBorrowed;

        /// All time loan cancellation count
        uint256 countCancelled;

        /// most recent applicationId
        uint256 recentApplicationId;

        bool hasOpenApplication;
    }

    event LoanRequested(uint256 applicationId, address indexed borrower);
    event LoanRequestDenied(uint256 applicationId, address indexed borrower);
    event LoanOffered(uint256 applicationId, address indexed borrower);
    event LoanOfferUpdated(uint256 applicationId, address indexed borrower);
    event LoanOfferCancelled(uint256 applicationId, address indexed borrower);

    address public pool;

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

    // APR, to represent a percentage value as int, multiply by (10 ^ percentDecimals)

    /// Safe minimum for APR values
    uint16 public constant SAFE_MIN_APR = 0; // 0%

    /// Safe maximum for APR values
    uint16 public immutable SAFE_MAX_APR;

    /// Loan APR to be applied for the new loan requests
    uint16 public templateLoanAPR;

    /// Loan late payment APR delta to be applied fot the new loan requests
    uint16 public templateLateLoanAPRDelta;

    /// Loan application id generator counter
    uint256 private nextApplicationId;

    /// Loan applications by applicationId
    mapping(uint256 => LoanApplication) public loanApplications;

    /// Loan offers by applicationId
    mapping(uint256 => LoanOffer) public loanOffers;

    /// Borrower statistics by address 
    mapping(address => BorrowerStats) public borrowerStats;

    uint256 public offeredFunds;

    modifier onlyPool() {
        require(msg.sender == pool, "Sapling: caller is not the lending pool");
        _;
    }

    modifier applicationInStatus(uint256 applicationId, LoanApplicationStatus status) {
        LoanApplication storage app = loanApplications[applicationId];
        require(app.id != 0, "Loan application is not found.");
        require(app.status == status, "Loan application does not have a valid status for this operation.");
        _;
    }

    /**
     * @notice Create a Lender that ManagedLendingPool.
     * @param _governance Address of the protocol governance.
     * @param _protocol Address of a wallet to accumulate protocol earnings.
     * @param _manager Address of the pool manager.
     */
    constructor(address _pool, address _governance, address _protocol, address _manager, uint256 _oneToken) 
        SaplingManagerContext(_governance, _protocol, _manager) {
        require(_pool != address(0), "Sapling: Pool address is not set");

        pool = _pool;

        SAFE_MIN_AMOUNT = _oneToken;
        minLoanAmount = _oneToken.mul(100);

        minLoanDuration = SAFE_MIN_DURATION;
        maxLoanDuration = SAFE_MAX_DURATION;

        SAFE_MAX_APR = ONE_HUNDRED_PERCENT;
        templateLoanAPR = uint16(30 * 10 ** PERCENT_DECIMALS); // 30%
        templateLateLoanAPRDelta = uint16(5 * 10 ** PERCENT_DECIMALS); //5%

        offeredFunds = 0;
        nextApplicationId = 1;
    }

    /**
     * @notice Set a minimum loan amount for the future loans.
     * @dev minLoanAmount must be greater than or equal to SAFE_MIN_AMOUNT.
     *      Caller must be the manager.
     * @param _minLoanAmount minimum loan amount to be enforced for the new loan requests.
     */
    function setMinLoanAmount(uint256 _minLoanAmount) external onlyManager whenNotPaused {
        require(SAFE_MIN_AMOUNT <= _minLoanAmount, "New min loan amount is less than the safe limit");
        minLoanAmount = _minLoanAmount;
    }

    /**
     * @notice Set maximum loan duration for the future loans.
     * @dev Duration must be in seconds and inclusively between SAFE_MIN_DURATION and maxLoanDuration.
     *      Caller must be the manager.
     * @param duration Maximum loan duration to be enforced for the new loan requests.
     */
    function setMinLoanDuration(uint256 duration) external onlyManager whenNotPaused {
        require(SAFE_MIN_DURATION <= duration && duration <= maxLoanDuration, "New min duration is out of bounds");
        minLoanDuration = duration;
    }

    /**
     * @notice Set maximum loan duration for the future loans.
     * @dev Duration must be in seconds and inclusively between minLoanDuration and SAFE_MAX_DURATION.
     *      Caller must be the manager.
     * @param duration Maximum loan duration to be enforced for the new loan requests.
     */
    function setMaxLoanDuration(uint256 duration) external onlyManager whenNotPaused {
        require(minLoanDuration <= duration && duration <= SAFE_MAX_DURATION, "New max duration is out of bounds");
        maxLoanDuration = duration;
    }

    /**
     * @notice Set loan payment grace period for the future loans.
     * @dev Duration must be in seconds and inclusively between MIN_LOAN_GRACE_PERIOD and MAX_LOAN_GRACE_PERIOD.
     *      Caller must be the manager.
     * @param gracePeriod Loan payment grace period for new loan requests.
     */
    function setTemplateLoanGracePeriod(uint256 gracePeriod) external onlyManager whenNotPaused {
        require(MIN_LOAN_GRACE_PERIOD <= gracePeriod && gracePeriod <= MAX_LOAN_GRACE_PERIOD, "Lender: New grace period is out of bounds.");
        templateLoanGracePeriod = gracePeriod;
    }

    /**
     * @notice Set annual loan interest rate for the future loans.
     * @dev apr must be inclusively between SAFE_MIN_APR and SAFE_MAX_APR.
     *      Caller must be the manager.
     * @param apr Loan APR to be applied for the new loan requests.
     */
    function setTemplateLoanAPR(uint16 apr) external onlyManager whenNotPaused {
        require(SAFE_MIN_APR <= apr && apr <= SAFE_MAX_APR, "APR is out of bounds");
        templateLoanAPR = apr;
    }

    /**
     * @notice Set late payment annual loan interest rate delta for the future loans.
     * @dev lateAPRDelta must be inclusively between SAFE_MIN_APR and SAFE_MAX_APR.
     *      Caller must be the manager.
     * @param lateAPRDelta Loan late payment APR delta to be applied for the new loan requests.
     */
    function setTemplateLateLoanAPRDelta(uint16 lateAPRDelta) external onlyManager whenNotPaused {
        require(SAFE_MIN_APR <= lateAPRDelta && lateAPRDelta <= SAFE_MAX_APR, "APR is out of bounds");
        templateLateLoanAPRDelta = lateAPRDelta;
    }

    /**
     * @notice Request a new loan.
     * @dev Requested amount must be greater or equal to minLoanAmount().
     *      Loan duration must be between minLoanDuration() and maxLoanDuration().
     *      Caller must not be a lender, protocol, or the manager. 
     *      Multiple pending applications from the same address are not allowed,
     *      most recent loan/application of the caller must not have APPLIED status.
     * @param _amount Token amount to be borrowed.
     * @param _duration Loan duration in seconds. 
     */
    function requestLoan(
        uint256 _amount, 
        uint256 _duration, 
        string memory _profileId, 
        string memory _profileDigest
    ) 
        external 
        onlyUser
        whenNotClosed 
        whenNotPaused
    {

        require(borrowerStats[msg.sender].hasOpenApplication == false, "Sapling: another loan application is pending.");
        require(_amount >= minLoanAmount, "Sapling: loan amount is less than the minimum allowed");
        require(minLoanDuration <= _duration, "Sapling: loan duration is less than minimum allowed.");
        require(maxLoanDuration >= _duration, "Sapling: loan duration is more than maximum allowed.");

        uint256 appId = nextApplicationId;
        nextApplicationId++;

        loanApplications[appId] = LoanApplication({
            id: appId,
            borrower: msg.sender,
            amount: _amount,
            duration: _duration,
            requestedTime: block.timestamp,
            status: LoanApplicationStatus.APPLIED,
            profileId: _profileId,
            profileDigest: _profileDigest
        });

        if (borrowerStats[msg.sender].borrower == address(0)) {
            borrowerStats[msg.sender] = BorrowerStats({
                borrower: msg.sender,
                countRequested: 1, 
                countDenied: 0,
                countOffered: 0, 
                countBorrowed: 0,
                countCancelled: 0, 
                recentApplicationId: appId,
                hasOpenApplication: true
            });
        } else {
            borrowerStats[msg.sender].countRequested++;
            borrowerStats[msg.sender].recentApplicationId = appId;
            borrowerStats[msg.sender].hasOpenApplication = true;
        }

        emit LoanRequested(appId, msg.sender);
    }

    /**
     * @notice Deny a loan.
     * @dev Loan must be in APPLIED status.
     *      Caller must be the manager.
     */
    function denyLoan(uint256 appId) external onlyManager applicationInStatus(appId, LoanApplicationStatus.APPLIED) {
        LoanApplication storage app = loanApplications[appId];
        app.status = LoanApplicationStatus.DENIED;
        borrowerStats[app.borrower].countDenied++;
        borrowerStats[app.borrower].hasOpenApplication = false;
        
        emit LoanRequestDenied(appId, app.borrower);
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
        whenNotClosed 
        whenNotPaused 
    {
        require(validLoanParams(_amount, _duration, _gracePeriod, _installments, _apr, _lateAPRDelta));

        LoanApplication storage app = loanApplications[appId];

        require(ILoanDeskOwner(pool).canOffer(offeredFunds.add(_amount)), "Sapling: lending pool cannot offer this loan at this time");
        ILoanDeskOwner(pool).onOffer(_amount);

        loanOffers[appId] = LoanOffer({
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

        offeredFunds = offeredFunds.add(_amount);
        borrowerStats[app.borrower].countOffered++;
        loanApplications[appId].status = LoanApplicationStatus.OFFER_MADE;
        
        emit LoanOffered(appId, app.borrower);
    }

    /**
     * @notice Update an existing loan offer offer a loan.
     * @dev Loan application must be in OFFER_MADE status.
     *      Caller must be the manager.
     *      Loan amount must not exceed poolLiquidity();
     *      Stake to pool funds ratio must be good - poolCanLend() must be true.
     */
    function updateOffer(
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
        applicationInStatus(appId, LoanApplicationStatus.OFFER_MADE)
        whenNotClosed
        whenNotPaused 
    {
        require(validLoanParams(_amount, _duration, _gracePeriod, _installments, _apr, _lateAPRDelta));

        LoanOffer memory offer = loanOffers[appId];

        if (offer.amount != _amount) {
            uint256 nextOfferedFunds = offeredFunds.sub(offer.amount).add(_amount);
            
            require(ILoanDeskOwner(pool).canOffer(nextOfferedFunds), "Sapling: lending pool cannot offer this loan at this time");
            ILoanDeskOwner(pool).onOfferUpdate(offer.amount, _amount);

            offeredFunds = nextOfferedFunds;
        }

        offer.amount = _amount;
        offer.duration = _duration;
        offer.gracePeriod = _gracePeriod;
        offer.installments = _installments;
        offer.apr = _apr;
        offer.lateAPRDelta = _lateAPRDelta;
        offer.offeredTime = block.timestamp;

        emit LoanOfferUpdated(appId, offer.borrower);
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
        borrowerStats[offer.borrower].countCancelled++;
        borrowerStats[offer.borrower].hasOpenApplication = false;
        
        offeredFunds = offeredFunds.sub(offer.amount);

        emit LoanOfferCancelled(appId, offer.borrower);
    }

    function onBorrow(uint256 appId) external override onlyPool applicationInStatus(appId, LoanApplicationStatus.OFFER_MADE) {
        LoanApplication storage app = loanApplications[appId];
        app.status = LoanApplicationStatus.OFFER_ACCEPTED;
        borrowerStats[app.borrower].hasOpenApplication = false;
        offeredFunds = offeredFunds.sub(loanOffers[appId].amount);
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

    function applicationStatus(uint256 appId) external view override returns (LoanApplicationStatus) {
        return loanApplications[appId].status;
    }

    function loanOfferById(uint256 appId) external view override returns (LoanOffer memory) {
        return loanOffers[appId];
    }

    function authorizedOnInactiveManager(address caller) override internal view returns (bool) {
        return caller == governance || caller == protocol;
    }

    function canClose() override internal pure returns (bool) {
        return true;
    }

    function validLoanParams(
        uint256 _amount, 
        uint256 _duration, 
        uint256 _gracePeriod, 
        uint16 _installments, 
        uint16 _apr, 
        uint16 _lateAPRDelta
    ) private view returns (bool)
    {
        require(_amount >= minLoanAmount);
        require(minLoanDuration <= _duration && _duration <= maxLoanDuration);
        require(MIN_LOAN_GRACE_PERIOD <= _gracePeriod && _gracePeriod <= MAX_LOAN_GRACE_PERIOD);
        require(1 <= _installments && _installments <= 4096); //FIXME set upper bound for installments
        require(SAFE_MIN_APR <= _apr && _apr <= SAFE_MAX_APR, "APR is out of bounds");
        require(SAFE_MIN_APR <= _lateAPRDelta && _lateAPRDelta <= SAFE_MAX_APR, "APR is out of bounds");
        return true;
    }
}
