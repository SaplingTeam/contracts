// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "./context/SaplingManagerContext.sol";
import "./interfaces/ILoanDesk.sol";
import "./interfaces/IPoolContext.sol";
import "./interfaces/ILendingPool.sol";

import "./lib/SaplingMath.sol";

/**
 * @title Loan Desk
 * @notice Provides loan application and offer management.
 */
contract LoanDesk is ILoanDesk, SaplingManagerContext, ReentrancyGuardUpgradeable {

    /**
     * Lender governance role
     * @notice Role given to the address of the timelock contract that executes a loan offer upon a passing vote
     * @dev The value of this role should be unique for each pool. Role must be created before the pool contract
     *      deployment, then passed during construction/initialization.
     */
    bytes32 public lenderGovernanceRole;

    /// Address of the lending pool contract
    address public pool;

    /// Default loan parameter values
    LoanTemplate public loanTemplate;


    // Loan applications state 

    /// Loan application id generator counter
    uint256 private nextApplicationId;

    /// Total liquidity tokens allocated for loan offers and pending acceptance by the borrowers
    uint256 public offeredFunds;

    /// Loan applications by applicationId
    mapping(uint256 => LoanApplication) public loanApplications;

    /// Loan offers by applicationId
    mapping(uint256 => LoanOffer) public loanOffers;

    /// Recent application id by address
    mapping(address => uint256) public recentApplicationIdOf;


    // Loans state

    /// Loan id generator counter
    uint256 private nextLoanId;

    uint256 public outstandingLoansCount;

    /// Loans by loan ID
    mapping(uint256 => Loan) public loans;

    /// LoanDetails by loan ID
    mapping(uint256 => LoanDetail) public loanDetails;


    /// A modifier to limit access only to when the application exists and has the specified status
    modifier applicationInStatus(uint256 applicationId, LoanApplicationStatus status) {
        require(applicationId != 0, "LoanDesk: invalid id");
        require(loanApplications[applicationId].id == applicationId, "LoanDesk: not found");
        require(loanApplications[applicationId].status == status, "LoanDesk: invalid status");
        _;
    }

    modifier loanInStatus(uint256 loanId, LoanStatus status) {
        require(loanId != 0, "LoanDesk: invalid id");
        require(loans[loanId].id == loanId, "LoanDesk: not found");
        require(loans[loanId].status == status, "LoanDesk: invalid status");
        _;
    }

    /**
     * @dev Disable initializers
     */
    function disableIntitializers() external onlyRole(SaplingRoles.GOVERNANCE_ROLE) {
        _disableInitializers();
    }

    /**
     * @notice Initializer a new LoanDesk.
     * @dev Addresses must not be 0.
     * @param _pool Lending pool address
     * @param _accessControl Access control contract
     * @param _managerRole Manager role
     * @param _lenderGovernanceRole Role held by the timelock control that executed passed lender votes
     * @param _decimals Lending pool liquidity token decimals
     */
    function initialize(
        address _pool,
        address _accessControl,
        bytes32 _managerRole,
        bytes32 _lenderGovernanceRole,
        uint8 _decimals
    )
        public
        initializer
    {
        __SaplingManagerContext_init(_accessControl, _managerRole);

        /*
            Additional check for single init:
                do not init again if a non-zero value is present in the values yet to be initialized.
        */
        assert(pool == address(0) && nextApplicationId == 0);

        require(_pool != address(0), "LoanDesk: invalid pool address");

        loanTemplate = LoanTemplate({
            minAmount: 100 * 10 ** uint256(_decimals),
            minDuration: SaplingMath.SAFE_MIN_DURATION,
            maxDuration: SaplingMath.SAFE_MAX_DURATION,
            gracePeriod: 60 days,
            apr: uint16(30 * 10 ** SaplingMath.PERCENT_DECIMALS) // 30%
        });

        lenderGovernanceRole = _lenderGovernanceRole;
        pool = _pool;
        offeredFunds = 0;
        outstandingLoansCount = 0;
        nextApplicationId = 1;
        nextLoanId = 1;
    }

    /**
     * @notice Set a minimum loan amount.
     * @dev minAmount must be greater than or equal to safeMinAmount.
     *      Caller must be the manager.
     * @param minAmount Minimum loan amount to be enforced on new loan requests and offers
     */
    function setMinLoanAmount(uint256 minAmount) external onlyRole(poolManagerRole) {
        require(SaplingMath.SAFE_MIN_AMOUNT <= minAmount, "LoanDesk: new min loan amount is less than the safe limit");

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
    function setMinLoanDuration(uint256 duration) external onlyRole(poolManagerRole) {
        require(
            SaplingMath.SAFE_MIN_DURATION <= duration && duration <= loanTemplate.maxDuration,
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
    function setMaxLoanDuration(uint256 duration) external onlyRole(poolManagerRole) {
        require(
            loanTemplate.minDuration <= duration && duration <= SaplingMath.SAFE_MAX_DURATION,
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
    function setTemplateLoanGracePeriod(uint256 gracePeriod) external onlyRole(poolManagerRole) {
        require(
            SaplingMath.MIN_LOAN_GRACE_PERIOD <= gracePeriod && gracePeriod <= SaplingMath.MAX_LOAN_GRACE_PERIOD,
            "LoanDesk: new grace period is out of bounds."
        );

        uint256 prevValue = loanTemplate.gracePeriod;
        loanTemplate.gracePeriod = gracePeriod;

        emit TemplateLoanGracePeriodSet(prevValue, loanTemplate.gracePeriod);
    }

    /**
     * @notice Set a template loan APR
     * @dev APR must be inclusively between SAFE_MIN_APR and 100%.
     *      Caller must be the manager.
     * @param apr Loan APR to be enforced on the new loan offers.
     */
    function setTemplateLoanAPR(uint16 apr) external onlyRole(poolManagerRole) {
        require(
            SaplingMath.SAFE_MIN_APR <= apr && apr <= SaplingMath.HUNDRED_PERCENT,
            "LoanDesk: APR is out of bounds"
        );

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
        whenNotPaused
        whenNotClosed
    {
        require(!hasOpenApplication(msg.sender), "LoanDesk: another loan application is pending");
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
        onlyRole(poolManagerRole)
        applicationInStatus(appId, LoanApplicationStatus.APPLIED)
        whenNotPaused
    {
        LoanApplication storage app = loanApplications[appId];
        app.status = LoanApplicationStatus.DENIED;

        emit LoanRequestDenied(appId, app.borrower, app.amount);
    }

    /**
     * @notice Draft a loan offer for an application.
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
    function draftOffer(
        uint256 appId,
        uint256 _amount,
        uint256 _duration,
        uint256 _gracePeriod,
        uint256 _installmentAmount,
        uint16 _installments,
        uint16 _apr
    )
        external
        onlyRole(poolManagerRole)
        applicationInStatus(appId, LoanApplicationStatus.APPLIED)
        whenNotClosed
        whenNotPaused
    {
        //// check

        validateLoanParams(_amount, _duration, _gracePeriod, _installmentAmount, _installments, _apr);

        LoanApplication storage app = loanApplications[appId];

        require(
            ILendingPool(pool).canOffer(offeredFunds + _amount),
            "LoanDesk: lending pool cannot offer this loan at this time"
        );

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
            lockedTime: 0,
            offeredTime: 0
        });

        offeredFunds = offeredFunds + _amount;
        loanApplications[appId].status = LoanApplicationStatus.OFFER_DRAFTED;

        //// interactions

        ILendingPool(pool).onOffer(_amount);

        emit LoanOfferDrafted(appId, app.borrower, _amount);
    }

    /**
     * @notice Update an existing draft loan offer.
     * @dev Loan application must be in OFFER_DRAFTED status.
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
    function updateDraftOffer(
        uint256 appId,
        uint256 _amount,
        uint256 _duration,
        uint256 _gracePeriod,
        uint256 _installmentAmount,
        uint16 _installments,
        uint16 _apr
    )
        external
        onlyRole(poolManagerRole)
        applicationInStatus(appId, LoanApplicationStatus.OFFER_DRAFTED)
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

        emit OfferDraftUpdated(appId, offer.borrower, prevAmount, offer.amount);

        //// interactions
        if (prevAmount != offer.amount) {
            ILendingPool(pool).onOfferUpdate(prevAmount, offer.amount);
        }
    }

    /**
     * @notice Lock a draft loan offer.
     * @dev Loan application must be in OFFER_DRAFTED status.
     *      Caller must be the manager.
     *      Loan amount must not exceed available liquidity -
     *      canOffer(offeredFunds.add(offeredFunds.sub(offer.amount).add(_amount))) must be true on the lending pool.
     * @param appId Loan application id
     */
    function lockDraftOffer(
        uint256 appId
    )
        external
        onlyRole(poolManagerRole)
        applicationInStatus(appId, LoanApplicationStatus.OFFER_DRAFTED)
        whenNotClosed
        whenNotPaused
    {
        //// effect
        loanApplications[appId].status = LoanApplicationStatus.OFFER_DRAFT_LOCKED;
        loanOffers[appId].lockedTime = block.timestamp;

        emit LoanOfferDraftLocked(appId);
    }

    /**
     * @notice Make a loan offer.
     * @dev Loan application must be in OFFER_DRAFT_LOCKED status.
     *      Caller must be the manager.
     *      Loan amount must not exceed available liquidity -
     *      canOffer(offeredFunds.add(offeredFunds.sub(offer.amount).add(_amount))) must be true on the lending pool.
     * @param appId Loan application id
     */
    function offerLoan(
        uint256 appId
    )
        external
        onlyRole(poolManagerRole)
        applicationInStatus(appId, LoanApplicationStatus.OFFER_DRAFT_LOCKED)
        whenNotClosed
        whenNotPaused
    {
        LoanOffer storage offer = loanOffers[appId];

        //// check
        require(
            block.timestamp > offer.lockedTime + SaplingMath.LOAN_LOCK_PERIOD,
            "LoanDesk: voting lock period is in effect"
        );

        //// effect
        loanApplications[appId].status = LoanApplicationStatus.OFFER_MADE;
        loanOffers[appId].offeredTime = block.timestamp;

        emit LoanOfferMade(appId);
    }

    /**
     * @notice Cancel a loan.
     * @dev Loan application must be in OFFER_MADE status. Caller must be the manager.
     */
    function cancelLoan(
        uint256 appId
    )
        external
        whenNotPaused
    {
        /// check
        require(appId != 0, "LoanDesk: invalid id");
        LoanApplicationStatus status = loanApplications[appId].status;
        require(
            status == LoanApplicationStatus.OFFER_DRAFTED 
            || status == LoanApplicationStatus.OFFER_DRAFT_LOCKED 
            || status == LoanApplicationStatus.OFFER_MADE, 
            "LoanDesk: invalid status"
        );

        LoanOffer storage offer = loanOffers[appId];

        if(!hasRole(poolManagerRole, msg.sender)) {
            require(
                hasRole(lenderGovernanceRole, msg.sender) && status == LoanApplicationStatus.OFFER_DRAFT_LOCKED
                && block.timestamp < offer.lockedTime + SaplingMath.LOAN_LOCK_PERIOD,
                    "SaplingContext: unauthorized"
            );
        }

        //// effect
        loanApplications[appId].status = LoanApplicationStatus.CANCELLED;
        offeredFunds -= offer.amount;

        emit LoanOfferCancelled(appId, offer.borrower, offer.amount);

        //// interactions
        ILendingPool(pool).onOfferUpdate(offer.amount, 0);
    }

    /**
     * @notice Accept a loan offer and withdraw funds
     * @dev Caller must be the borrower of the loan in question.
     *      The loan must be in OFFER_MADE status.
     * @param appId ID of the loan application to accept the offer of
     */
    function borrow(uint256 appId) external whenNotClosed whenNotPaused {

        //// check

        LoanApplication storage app = loanApplications[appId];
        require(app.status == ILoanDesk.LoanApplicationStatus.OFFER_MADE, "LoanDesk: invalid offer status");

        LoanOffer storage offer = loanOffers[appId];
        require(offer.borrower == msg.sender, "LoanDesk: msg.sender is not the borrower on this loan");

        //// effect

        app.status = LoanApplicationStatus.OFFER_ACCEPTED;

        uint256 offerAmount = loanOffers[appId].amount;
        offeredFunds -= offerAmount;

        emit LoanOfferAccepted(appId, app.borrower, offerAmount);

        uint256 loanId = nextLoanId;
        nextLoanId++;

        loans[loanId] = Loan({
            id: loanId,
            loanDeskAddress: address(this),
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
            interestPaidTillTime: block.timestamp
        });

        outstandingLoansCount++;

        //// interactions

        // on pool
        ILendingPool(pool).onBorrow(loanId, offer.borrower, offer.amount, offer.apr);

        emit LoanBorrowed(loanId, offer.borrower, appId);
    }

    /**
     * @notice Make a payment towards a loan.
     * @dev Caller must be the borrower.
     *      Loan must be in OUTSTANDING status.
     *      Only the necessary sum is charged if amount exceeds amount due.
     *      Amount charged will not exceed the amount parameter.
     * @param loanId ID of the loan to make a payment towards.
     * @param amount Payment amount
     */
    function repay(uint256 loanId, uint256 amount) external {
        // require the payer and the borrower to be the same to avoid mispayment
        require(loans[loanId].borrower == msg.sender, "LoanDesk: payer is not the borrower");

        repayBase(loanId, amount);
    }

    /**
     * @notice Make a payment towards a loan on behalf of a borrower.
     * @dev Loan must be in OUTSTANDING status.
     *      Only the necessary sum is charged if amount exceeds amount due.
     *      Amount charged will not exceed the amount parameter.
     * @param loanId ID of the loan to make a payment towards.
     * @param amount Payment amount
     * @param borrower address of the borrower to make a payment on behalf of.
     */
    function repayOnBehalf(uint256 loanId, uint256 amount, address borrower) external {
        // require the borrower being paid on behalf off and the loan borrower to be the same to avoid mispayment
        require(loans[loanId].borrower == borrower, "LoanDesk: invalid borrower");

        repayBase(loanId, amount);
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
        onlyRole(poolManagerRole)
        loanInStatus(loanId, LoanStatus.OUTSTANDING)
        whenNotPaused
        nonReentrant
    {
        //// effect

        Loan storage loan = loans[loanId];
        LoanDetail storage loanDetail = loanDetails[loanId];

        uint256 amountCarryUsed = 0;

        // use loan payment carry
        if (loanDetail.paymentCarry > 0) {
            loanDetail.principalAmountRepaid += loanDetail.paymentCarry;

            amountCarryUsed = loanDetail.paymentCarry;
            loanDetail.paymentCarry = 0;
        }

        loan.status = LoanStatus.REPAID;
        outstandingLoansCount--;

        uint256 remainingDifference = loanDetail.principalAmountRepaid < loan.amount
            ? loan.amount - loanDetail.principalAmountRepaid
            : 0;

        uint256 amountRepaid = ILendingPool(pool).onCloseLoan(loan.id, loan.apr, amountCarryUsed, remainingDifference);

        // external interaction based state update (intentional)
        if (amountRepaid > 0) {
            loanDetail.totalAmountRepaid += amountRepaid - amountCarryUsed;
            loanDetail.principalAmountRepaid += amountRepaid;
        }

        remainingDifference = loanDetail.principalAmountRepaid < loan.amount
            ? loan.amount - loanDetail.principalAmountRepaid
            : 0;

        emit LoanClosed(loanId, loan.borrower, amountRepaid, remainingDifference);
    }

    /**
     * @notice Default a loan.
     * @dev Loan must be in OUTSTANDING status.
     *      Caller must be the manager.
     *      canDefault(loanId) must return 'true'.
     * @param loanId ID of the loan to default
     */
    function defaultLoan(
        uint256 loanId
    )
        external
        onlyRole(poolManagerRole)
        whenNotPaused
    {
        //// check

        require(canDefault(loanId), "LoanDesk: cannot default this loan at this time");

        //// effect

        Loan storage loan = loans[loanId];
        LoanDetail storage loanDetail = loanDetails[loanId];

        loan.status = LoanStatus.DEFAULTED;
        outstandingLoansCount--;

        uint256 paymentCarry = loanDetail.paymentCarry;

        if (loanDetail.paymentCarry > 0) {
            loanDetail.principalAmountRepaid += loanDetail.paymentCarry;
            loanDetail.paymentCarry = 0;
        }

        uint256 loss = loan.amount > loanDetail.principalAmountRepaid
            ? loan.amount - loanDetail.principalAmountRepaid
            : 0;

        (uint256 managerLoss, uint256 lenderLoss) = ILendingPool(pool).onDefault(
            loanId, 
            loan.apr, 
            paymentCarry, 
            loss
        );

        emit LoanDefaulted(loanId, loan.borrower, managerLoss, lenderLoss);
    }

    /**
     * @notice Make a payment towards a loan.
     * @dev Loan must be in OUTSTANDING status.
     *      Only the necessary sum is charged if amount exceeds amount due.
     *      Amount charged will not exceed the amount parameter.
     * @param loanId ID of the loan to make a payment towards
     * @param amount Payment amount in tokens
     */
    function repayBase(uint256 loanId, uint256 amount) internal nonReentrant whenNotPaused {

        //// check

        Loan storage loan = loans[loanId];
        require(
            loan.id == loanId && loan.status == LoanStatus.OUTSTANDING,
            "SaplingLendingPool: not found or invalid loan status"
        );

        //// effect

        (
            uint256 transferAmount,
            uint256 paymentAmount,
            uint256 interestPayable,
            uint256 payableInterestDays
        ) = payableLoanBalance(loanId, amount);

        uint256 principalPaid = paymentAmount - interestPayable;

        LoanDetail storage loanDetail = loanDetails[loanId];
        loanDetail.totalAmountRepaid += transferAmount;
        loanDetail.principalAmountRepaid += principalPaid;
        loanDetail.interestPaidTillTime += payableInterestDays * 86400;

        if (paymentAmount > transferAmount) {
            loanDetail.paymentCarry -= paymentAmount - transferAmount;
        } else if (paymentAmount < transferAmount) {
            loanDetail.paymentCarry += transferAmount - paymentAmount;
        }
        
        if (interestPayable != 0) {
            loanDetail.interestPaid += interestPayable;
        }

        if (loanDetail.principalAmountRepaid >= loan.amount) {
            loan.status = LoanStatus.REPAID;
            outstandingLoansCount--;

            emit LoanFullyRepaid(loanId, loan.borrower);
        }

        emit LoanRepaymentInitiated(loanId, loan.borrower, msg.sender, transferAmount, interestPayable);

        //// interactions

        ILendingPool(pool).onRepay(
            loanId, 
            loan.borrower, 
            msg.sender, 
            loan.apr, 
            transferAmount, 
            paymentAmount, 
            interestPayable
        );
    }

    /**
     * @notice Count of all loan requests in this pool.
     * @return LoanApplication count.
     */
    function applicationsCount() external view returns(uint256) {
        return nextApplicationId - 1;
    }

    /**
     * @notice Count of all loans in this pool.
     * @return Loan count.
     */
    function loansCount() external view returns(uint256) {
        return nextLoanId - 1;
    }

    /**
     * @notice Accessor for loan.
     * @param loanId ID of the loan
     * @return Loan struct instance for the specified loan ID.
     */
    function loanById(uint256 loanId) external view returns (Loan memory) {
        return loans[loanId];
    }

    /**
     * @notice Accessor for loan detail.
     * @param loanId ID of the loan
     * @return LoanDetail struct instance for the specified loan ID.
     */
    function loanDetailById(uint256 loanId) external view returns (LoanDetail memory) {
        return loanDetails[loanId];
    }

     /**
     * @notice Loan balance due including interest if paid in full at this time.
     * @dev Loan must be in OUTSTANDING status.
     * @param loanId ID of the loan to check the balance of
     * @return Total amount due with interest on this loan
     */
    function loanBalanceDue(uint256 loanId)
        external
        view
        loanInStatus(loanId, LoanStatus.OUTSTANDING)
        returns(uint256)
    {
        (uint256 principalOutstanding, uint256 interestOutstanding, ) = loanBalanceDueWithInterest(loanId);
        return principalOutstanding + interestOutstanding - loanDetails[loanId].paymentCarry;
    }

    function hasOpenApplication(address account) public view returns (bool) {
        LoanApplicationStatus recentAppStatus = loanApplications[recentApplicationIdOf[account]].status;
        return recentAppStatus == LoanApplicationStatus.APPLIED 
            || recentAppStatus == LoanApplicationStatus.OFFER_DRAFTED
            || recentAppStatus == LoanApplicationStatus.OFFER_DRAFT_LOCKED
            || recentAppStatus == LoanApplicationStatus.OFFER_MADE;
    }

        /**
     * @notice View indicating whether or not a given loan qualifies to be defaulted
     * @param loanId ID of the loan to check
     * @return True if the given loan can be defaulted, false otherwise
     */
    function canDefault(uint256 loanId) public view loanInStatus(loanId, LoanStatus.OUTSTANDING) returns (bool) {

        Loan storage loan = loans[loanId];

        uint256 fxBandPercent = 200; //20% //TODO: use confgurable parameter on v1.1

        uint256 paymentDueTime;

        if (loan.installments > 1) {
            uint256 installmentPeriod = loan.duration / loan.installments;
            uint256 pastInstallments = (block.timestamp - loan.borrowedTime) / installmentPeriod;
            uint256 minTotalPayment = MathUpgradeable.mulDiv(
                loan.installmentAmount * pastInstallments,
                SaplingMath.HUNDRED_PERCENT - fxBandPercent,
                SaplingMath.HUNDRED_PERCENT
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

        return block.timestamp > paymentDueTime + loan.gracePeriod;
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
        require(SaplingMath.MIN_LOAN_GRACE_PERIOD <= _gracePeriod && _gracePeriod <= SaplingMath.MAX_LOAN_GRACE_PERIOD,
            "LoanDesk: invalid grace period");
        require(
            _installmentAmount == 0 || _installmentAmount >= SaplingMath.SAFE_MIN_AMOUNT,
            "LoanDesk: invalid installment amount"
        );
        require(
            1 <= _installments && _installments <= _duration / (1 days),
            "LoanDesk: invalid number of installments"
        );
        require(SaplingMath.SAFE_MIN_APR <= _apr && _apr <= SaplingMath.HUNDRED_PERCENT, "LoanDesk: invalid APR");
    }

    /**
     * @notice Loan balances due if paid in full at this time.
     * @param loanId ID of the loan to check the balance of
     * @return Principal outstanding, interest outstanding, and the number of interest acquired days
     */
    function loanBalanceDueWithInterest(uint256 loanId) private view returns (uint256, uint256, uint256) {
        Loan storage loan = loans[loanId];
        LoanDetail storage detail = loanDetails[loanId];

        uint256 daysPassed = countInterestDays(detail.interestPaidTillTime, block.timestamp);
        uint256 interestPercent = MathUpgradeable.mulDiv(uint256(loan.apr) * 1e18, daysPassed, 365);

        uint256 principalOutstanding = loan.amount - detail.principalAmountRepaid;
        uint256 interestOutstanding = MathUpgradeable.mulDiv(
            principalOutstanding, 
            interestPercent, 
            SaplingMath.HUNDRED_PERCENT
        ) / 1e18;

        return (principalOutstanding, interestOutstanding, daysPassed);
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
        returns (uint256, uint256, uint256, uint256)
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

        return (transferAmount, paymentAmount, interestPayable, payableInterestDays);
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

    /**
     * @notice Indicates whether or not the contract can be closed in it's current state.
     * @dev Overrides a hook in SaplingManagerContext.
     * @return True if the contract is closed, false otherwise.
     */
    function canClose() internal view override returns (bool) {
        return offeredFunds == 0 && outstandingLoansCount == 0;
    }

    /**
     * @notice Indicates whether or not the contract can be opened in it's current state.
     * @dev Overrides a hook in SaplingManagerContext.
     * @return True if the conditions to open are met, false otherwise.
     */
    function canOpen() internal view override returns (bool) {
        return pool != address(0);
    }
}
