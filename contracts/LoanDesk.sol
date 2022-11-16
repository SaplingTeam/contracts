// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "./context/SaplingManagerContext.sol";
import "./interfaces/ILoanDesk.sol";
import "./interfaces/ILendingPool.sol";

/**
 * @title Loan Desk
 * @notice Provides loan application and offer management.
 */
contract LoanDesk is ILoanDesk, SaplingManagerContext {

    /// Math safe minimum loan duration in seconds
    uint256 public constant SAFE_MIN_DURATION = 1 days;

    /// Math safe maximum loan duration in seconds
    uint256 public constant SAFE_MAX_DURATION = 51 * 365 days;

    /// Minimum allowed loan payment grace period
    uint256 public constant MIN_LOAN_GRACE_PERIOD = 3 days;

    /// Maximum allowed loan payment grace period
    uint256 public constant MAX_LOAN_GRACE_PERIOD = 365 days;

    /// Safe minimum for APR values
    uint16 public constant SAFE_MIN_APR = 0; // 0%

    /// Safe maximum for APR values
    uint16 public safeMaxApr;

    /// Math safe minimum loan amount including token decimals
    uint256 public safeMinAmount;

    LoanTemplate public loanTemplate;

    /// Address of the lending pool contract
    address public pool;

    /// Total liquidity tokens allocated for loan offers and pending acceptance by the borrowers
    uint256 public offeredFunds;

    /// Loan applications by applicationId
    mapping(uint256 => LoanApplication) public loanApplications;

    /// Loan offers by applicationId
    mapping(uint256 => LoanOffer) public loanOffers;

    /// Recent application id by address
    mapping(address => uint256) public recentApplicationIdOf;

    /// Loan application id generator counter
    uint256 private nextApplicationId;

    /// A modifier to limit access only to the lending pool contract
    modifier onlyPool() {
        require(msg.sender == pool, "LoanDesk: caller is not the lending pool");
        _;
    }

    /// A modifier to limit access only to when the application exists and has the specified status
    modifier applicationInStatus(uint256 applicationId, LoanApplicationStatus status) {
        LoanApplication storage app = loanApplications[applicationId];
        require(app.id != 0, "LoanDesk: loan application is not found");
        require(app.status == status, "LoanDesk: invalid application status");
        _;
    }

    /**
     * @dev Disable initializers
     */
    function disableIntitializers() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _disableInitializers();
    }

    /**
     * @notice Initializer a new LoanDesk.
     * @dev Addresses must not be 0.
     * @param _pool Lending pool address
     * @param _governance Governance address
     * @param _treasury Treasury wallet address
     * @param _manager Manager address
     * @param _decimals Lending pool liquidity token decimals
     */
    function initialize(
        address _pool,
        address _governance,
        address _treasury,
        address _manager,
        uint8 _decimals
    )
        public
        initializer
    {
        __SaplingManagerContext_init(_governance, _treasury, _manager);

        /*
            Additional check for single init:
                do not init again if a non-zero value is present in the values yet to be initialized.
        */
        assert(pool == address(0) && nextApplicationId == 0);

        require(_pool != address(0), "LoanDesk: invalid pool address");

        uint256 _oneToken = 10 ** uint256(_decimals);
        safeMinAmount = _oneToken;
        safeMaxApr = oneHundredPercent;

        loanTemplate = LoanTemplate({
            minAmount: _oneToken * 100,
            minDuration: SAFE_MIN_DURATION,
            maxDuration: SAFE_MAX_DURATION,
            gracePeriod: 60 days,
            apr: uint16(30 * 10 ** percentDecimals) // 30%
        });

        pool = _pool;
        offeredFunds = 0;
        nextApplicationId = 1;
    }

    /**
     * @notice Set a minimum loan amount.
     * @dev minAmount must be greater than or equal to safeMinAmount.
     *      Caller must be the manager.
     * @param minAmount Minimum loan amount to be enforced on new loan requests and offers
     */
    function setMinLoanAmount(uint256 minAmount) external onlyRole(POOL_MANAGER_ROLE) {
        require(safeMinAmount <= minAmount, "LoanDesk: new min loan amount is less than the safe limit");

        uint256 prevValue = loanTemplate.minAmount;
        loanTemplate.minAmount = minAmount;

        emit MinLoanAmountSet(prevValue, loanTemplate.minAmount);
    }

    /**
     * @notice Set the minimum loan duration
     * @dev Duration must be in seconds and inclusively between SAFE_MIN_DURATION and maxDuration.
     *      Caller must be the manager.
     * @param duration Minimum loan duration to be enforced on new loan requests and offers
     */
    function setMinLoanDuration(uint256 duration) external onlyRole(POOL_MANAGER_ROLE) {
        require(
            SAFE_MIN_DURATION <= duration && duration <= loanTemplate.maxDuration,
            "LoanDesk: new min duration is out of bounds"
        );

        uint256 prevValue = loanTemplate.minDuration;
        loanTemplate.minDuration = duration;

        emit MinLoanDurationSet(prevValue, loanTemplate.minDuration);
    }

    /**
     * @notice Set the maximum loan duration.
     * @dev Duration must be in seconds and inclusively between minDuration and SAFE_MAX_DURATION.
     *      Caller must be the manager.
     * @param duration Maximum loan duration to be enforced on new loan requests and offers
     */
    function setMaxLoanDuration(uint256 duration) external onlyRole(POOL_MANAGER_ROLE) {
        require(
            loanTemplate.minDuration <= duration && duration <= SAFE_MAX_DURATION,
            "LoanDesk: new max duration is out of bounds"
        );

        uint256 prevValue = loanTemplate.maxDuration;
        loanTemplate.maxDuration = duration;

        emit MaxLoanDurationSet(prevValue, loanTemplate.maxDuration);
    }

    /**
     * @notice Set the template loan payment grace period.
     * @dev Grace period must be in seconds and inclusively between MIN_LOAN_GRACE_PERIOD and MAX_LOAN_GRACE_PERIOD.
     *      Caller must be the manager.
     * @param gracePeriod Loan payment grace period for new loan offers
     */
    function setTemplateLoanGracePeriod(uint256 gracePeriod) external onlyRole(POOL_MANAGER_ROLE) {
        require(
            MIN_LOAN_GRACE_PERIOD <= gracePeriod && gracePeriod <= MAX_LOAN_GRACE_PERIOD,
            "LoanDesk: new grace period is out of bounds."
        );

        uint256 prevValue = loanTemplate.gracePeriod;
        loanTemplate.gracePeriod = gracePeriod;

        emit TemplateLoanGracePeriodSet(prevValue, loanTemplate.gracePeriod);
    }

    /**
     * @notice Set a template loan APR
     * @dev APR must be inclusively between SAFE_MIN_APR and safeMaxApr.
     *      Caller must be the manager.
     * @param apr Loan APR to be enforced on the new loan offers.
     */
    function setTemplateLoanAPR(uint16 apr) external onlyRole(POOL_MANAGER_ROLE) {
        require(SAFE_MIN_APR <= apr && apr <= safeMaxApr, "LoanDesk: APR is out of bounds");

        uint256 prevValue = loanTemplate.apr;
        loanTemplate.apr = apr;

        emit TemplateLoanAPRSet(prevValue, loanTemplate.apr);
    }

    /**
     * @notice Request a new loan.
     * @dev Requested amount must be greater or equal to minLoanAmount().
     *      Loan duration must be between minDuration() and maxDuration().
     *      Multiple pending applications from the same address are not allowed -
     *      most recent loan/application of the caller must not have APPLIED status.
     * @param _amount Liquidity token amount to be borrowed
     * @param _duration Loan duration in seconds
     * @param _profileId Borrower metadata profile id obtained from the borrower service
     * @param _profileDigest Borrower metadata digest obtained from the borrower service
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
        LoanApplicationStatus recentAppStatus = loanApplications[recentApplicationIdOf[msg.sender]].status;
        require(
            recentAppStatus != LoanApplicationStatus.APPLIED && recentAppStatus != LoanApplicationStatus.OFFER_MADE,
            "LoanDesk: another loan application is pending"
        );
        require(_amount >= loanTemplate.minAmount, "LoanDesk: loan amount is less than the minimum allowed");
        require(loanTemplate.minDuration <= _duration, "LoanDesk: loan duration is less than minimum allowed");
        require(loanTemplate.maxDuration >= _duration, "LoanDesk: loan duration is greater than maximum allowed");

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

        recentApplicationIdOf[msg.sender] = appId;

        emit LoanRequested(appId, msg.sender, _amount);
    }

    /**
     * @notice Deny a loan.
     * @dev Loan must be in APPLIED status.
     *      Caller must be the manager.
     */
    function denyLoan(
        uint256 appId
    )
        external
        onlyRole(POOL_MANAGER_ROLE)
        applicationInStatus(appId, LoanApplicationStatus.APPLIED)
        whenNotPaused
    {
        LoanApplication storage app = loanApplications[appId];
        app.status = LoanApplicationStatus.DENIED;

        emit LoanRequestDenied(appId, app.borrower, app.amount);
    }

    /**
     * @notice Approve a loan application and offer a loan.
     * @dev Loan application must be in APPLIED status.
     *      Caller must be the manager.
     *      Loan amount must not exceed available liquidity -
     *      canOffer(offeredFunds.add(_amount)) must be true on the lending pool.
     * @param appId Loan application id
     * @param _amount Loan amount in liquidity tokens
     * @param _duration Loan term in seconds
     * @param _gracePeriod Loan payment grace period in seconds
     * @param _installmentAmount Minimum payment amount on each instalment in liquidity tokens
     * @param _installments The number of payment installments
     * @param _apr Annual percentage rate of this loan
     */
    function offerLoan(
        uint256 appId,
        uint256 _amount,
        uint256 _duration,
        uint256 _gracePeriod,
        uint256 _installmentAmount,
        uint16 _installments,
        uint16 _apr
    )
        external
        onlyRole(POOL_MANAGER_ROLE)
        applicationInStatus(appId, LoanApplicationStatus.APPLIED)
        whenNotClosed
        whenNotPaused
    {
        //// check

        validateLoanParams(_amount, _duration, _gracePeriod, _installmentAmount, _installments, _apr);

        LoanApplication storage app = loanApplications[appId];

        require(ILendingPool(pool).canOffer(offeredFunds + _amount),
            "LoanDesk: lending pool cannot offer this loan at this time");

        //// effect

        loanOffers[appId] = LoanOffer({
            applicationId: appId,
            borrower: app.borrower,
            amount: _amount,
            duration: _duration,
            gracePeriod: _gracePeriod,
            installmentAmount: _installmentAmount,
            installments: _installments,
            apr: _apr,
            offeredTime: block.timestamp
        });

        offeredFunds = offeredFunds + _amount;
        loanApplications[appId].status = LoanApplicationStatus.OFFER_MADE;

        //// interactions

        ILendingPool(pool).onOffer(_amount);

        emit LoanOffered(appId, app.borrower, _amount);
    }

    /**
     * @notice Update an existing loan offer.
     * @dev Loan application must be in OFFER_MADE status.
     *      Caller must be the manager.
     *      Loan amount must not exceed available liquidity -
     *      canOffer(offeredFunds.add(offeredFunds.sub(offer.amount).add(_amount))) must be true on the lending pool.
     * @param appId Loan application id
     * @param _amount Loan amount in liquidity tokens
     * @param _duration Loan term in seconds
     * @param _gracePeriod Loan payment grace period in seconds
     * @param _installmentAmount Minimum payment amount on each instalment in liquidity tokens
     * @param _installments The number of payment installments
     * @param _apr Annual percentage rate of this loan
     */
    function updateOffer(
        uint256 appId,
        uint256 _amount,
        uint256 _duration,
        uint256 _gracePeriod,
        uint256 _installmentAmount,
        uint16 _installments,
        uint16 _apr
    )
        external
        onlyRole(POOL_MANAGER_ROLE)
        applicationInStatus(appId, LoanApplicationStatus.OFFER_MADE)
        whenNotClosed
        whenNotPaused
    {
        //// check

        validateLoanParams(_amount, _duration, _gracePeriod, _installmentAmount, _installments, _apr);

        LoanOffer storage offer = loanOffers[appId];

        uint256 prevAmount = offer.amount;

        if (prevAmount != _amount) {
            uint256 nextOfferedFunds = offeredFunds - prevAmount + _amount;
            require(ILendingPool(pool).canOffer(nextOfferedFunds),
                "LoanDesk: lending pool cannot offer this loan at this time");

            //// effect
            offeredFunds = nextOfferedFunds;
        }

        //// effect
        offer.amount = _amount;
        offer.duration = _duration;
        offer.gracePeriod = _gracePeriod;
        offer.installmentAmount = _installmentAmount;
        offer.installments = _installments;
        offer.apr = _apr;
        offer.offeredTime = block.timestamp;

        emit LoanOfferUpdated(appId, offer.borrower, prevAmount, offer.amount);

        //// interactions
        if (prevAmount != offer.amount) {
            ILendingPool(pool).onOfferUpdate(prevAmount, offer.amount);
        }
    }


    /**
     * @notice Cancel a loan.
     * @dev Loan application must be in OFFER_MADE status.
     *      Caller must be the manager or approved party when the manager is inactive.
     */
    function cancelLoan(
        uint256 appId
    )
        external
        managerOrApprovedOnInactive
        applicationInStatus(appId, LoanApplicationStatus.OFFER_MADE)
        whenNotPaused
    {
        //// check

        LoanOffer storage offer = loanOffers[appId];

        // check if the call was made by an eligible non manager party, due to manager's inaction on the loan.
        if (msg.sender != manager) {
            // require inactivity grace period
            require(
                block.timestamp > offer.offeredTime + MANAGER_INACTIVITY_GRACE_PERIOD,
                "LoanDesk: too early to cancel this loan as a non-manager"
            );
        }

        //// effect

        loanApplications[appId].status = LoanApplicationStatus.OFFER_CANCELLED;

        offeredFunds -= offer.amount;

        emit LoanOfferCancelled(appId, offer.borrower, offer.amount);

        //// interactions
        ILendingPool(pool).onOfferUpdate(offer.amount, 0);
    }

    /**
     * @notice Hook to be called when a loan offer is accepted. Updates the loan offer and liquidity state.
     * @dev Loan application must be in OFFER_MADE status.
     *      Caller must be the lending pool.
     * @param appId ID of the application the accepted offer was made for.
     */
    function onBorrow(
        uint256 appId
    )
        external
        override
        onlyPool
        applicationInStatus(appId, LoanApplicationStatus.OFFER_MADE)
        whenNotPaused
    {
        LoanApplication storage app = loanApplications[appId];
        app.status = LoanApplicationStatus.OFFER_ACCEPTED;

        uint256 offerAmount = loanOffers[appId].amount;
        offeredFunds -= offerAmount;

        emit LoanOfferAccepted(appId, app.borrower, offerAmount);
    }

    /**
     * @notice View indicating whether or not a given loan offer qualifies to be cancelled by a given caller.
     * @param appId Application ID of the loan offer in question
     * @param caller Address that intends to call cancel() on the loan offer
     * @return True if the given loan approval can be cancelled and can be cancelled by the specified caller,
     *         false otherwise.
     */
    function canCancel(uint256 appId, address caller) external view returns (bool) {
        if (caller != manager && !authorizedOnInactiveManager(caller)) {
            return false;
        }

        return loanApplications[appId].status == LoanApplicationStatus.OFFER_MADE && block.timestamp >= (
                loanOffers[appId].offeredTime + (caller == manager ? 0 : MANAGER_INACTIVITY_GRACE_PERIOD)
            );
    }

    /**
     * @notice Accessor for application status.
     * @dev NULL status is returned for nonexistent applications.
     * @param appId ID of the application in question.
     * @return Current status of the application with the specified ID.
     */
    function applicationStatus(uint256 appId) external view override returns (LoanApplicationStatus) {
        return loanApplications[appId].status;
    }

    /**
     * @notice Accessor for loan offer.
     * @dev Loan offer is valid when the loan application is present and has OFFER_MADE status.
     * @param appId ID of the application the offer was made for.
     * @return LoanOffer struct instance for the specified application ID.
     */
    function loanOfferById(uint256 appId) external view override returns (LoanOffer memory) {
        return loanOffers[appId];
    }

    /**
     * @notice Indicates whether or not the the caller is authorized to take applicable managing actions when the
     *         manager is inactive.
     * @dev Overrides a hook in SaplingManagerContext.
     * @param caller Caller's address.
     * @return True if the caller is authorized at this time, false otherwise.
     */
    function authorizedOnInactiveManager(address caller) override internal view returns (bool) {
        return caller == governance || caller == treasury;
    }

    /**
     * @notice Indicates whether or not the contract can be closed in it's current state.
     * @dev Overrides a hook in SaplingManagerContext.
     * @return True if the contract is closed, false otherwise.
     */
    function canClose() override internal pure returns (bool) {
        return true;
    }

    /**
     * @notice Validates loan offer parameters
     * @dev Throws a require-type exception on invalid loan parameter
     * @param _amount Loan amount in liquidity tokens
     * @param _duration Loan term in seconds
     * @param _gracePeriod Loan payment grace period in seconds
     * @param _installmentAmount Minimum payment amount on each instalment in liquidity tokens
     * @param _installments The number of payment installments
     * @param _apr Annual percentage rate of this loan
     */
    function validateLoanParams(
        uint256 _amount,
        uint256 _duration,
        uint256 _gracePeriod,
        uint256 _installmentAmount,
        uint16 _installments,
        uint16 _apr
    ) private view
    {
        require(_amount >= loanTemplate.minAmount, "LoanDesk: invalid amount");
        require(
            loanTemplate.minDuration <= _duration && _duration <= loanTemplate.maxDuration,
            "LoanDesk: invalid duration"
        );
        require(MIN_LOAN_GRACE_PERIOD <= _gracePeriod && _gracePeriod <= MAX_LOAN_GRACE_PERIOD,
            "LoanDesk: invalid grace period");
        require(
            _installmentAmount == 0 || _installmentAmount >= safeMinAmount,
            "LoanDesk: invalid installment amount"
        );
        require(
            1 <= _installments && _installments <= _duration / (1 days),
            "LoanDesk: invalid number of installments"
        );
        require(SAFE_MIN_APR <= _apr && _apr <= safeMaxApr, "LoanDesk: invalid APR");
    }
}
