// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./context/SaplingStakerContext.sol";
import "./interfaces/ILoanDesk.sol";
import "./interfaces/IPoolContext.sol";
import "./interfaces/ILendingPool.sol";

import "./lib/SaplingMath.sol";

/**
 * @title Loan Desk
 * @notice Provides loan lifecycle.
 */
contract LoanDesk is ILoanDesk, SaplingStakerContext, ReentrancyGuardUpgradeable {

    /// LoanDesk configuration parameters
    LoanDeskConfig public config;

    /// Default loan parameter values
    LoanTemplate public loanTemplate;

    // Loan applications state 

    /// Loan application id generator counter
    uint256 private nextApplicationId;

    /// Loan applications by applicationId
    mapping(uint256 => LoanApplication) public loanApplications;

    /// Loan offers by applicationId
    mapping(uint256 => LoanOffer) public loanOffers;

    /// Recent application id by address
    mapping(address => uint256) public recentApplicationIdOf;


    // Loans state

    /// Loan id generator counter
    uint256 private nextLoanId;

    /// Loans by loan ID
    mapping(uint256 => Loan) public loans;

    /// LoanDetails by loan ID
    mapping(uint256 => LoanDetail) public loanDetails;

    // Total funds lent at this time, accounts only for loan principals
    uint256 public lentFunds;

    /// Weighted average loan APR on the borrowed funds
    uint32 public weightedAvgAPR;


    /// A modifier to limit access only to when the application exists and has the specified status
    modifier applicationInStatus(uint256 applicationId, LoanApplicationStatus status) {
        require(applicationId != 0, "LoanDesk: invalid id");
        require(loanApplications[applicationId].id == applicationId, "LoanDesk: not found");
        require(loanApplications[applicationId].status == status, "LoanDesk: invalid status");
        _;
    }

    /// A modifier to limit access only to when the loan exists and has the specified status
    modifier loanInStatus(uint256 loanId, LoanStatus status) {
        require(loanId != 0, "LoanDesk: invalid id");
        require(loans[loanId].id == loanId, "LoanDesk: not found");
        require(loans[loanId].status == status, "LoanDesk: invalid status");
        _;
    }

    /// Modifier to update pool accounting state before function execution
    modifier updatedState() {
        IPoolContext(config.pool).settleYield();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initializer a new LoanDesk.
     * @dev Addresses must not be 0.
     * @param _pool Lending pool address
     * @param _liquidityToken ERC20 token contract address to be used as pool liquidity currency.
     * @param _accessControl Access control contract
     * @param _stakerAddress Staker address
     * @param _lenderGovernanceRole Role held by the timelock control that executed passed lender votes
     */
    function initialize(
        address _pool,
        address _liquidityToken,
        address _accessControl,
        address _stakerAddress,
        bytes32 _lenderGovernanceRole
    )
        public
        initializer
    {
        __SaplingStakerContext_init(_accessControl, _stakerAddress);

        /*
            Additional check for single init:
                do not init again if a non-zero value is present in the values yet to be initialized.
        */
        assert(config.pool == address(0) && nextApplicationId == 0);

        require(_pool != address(0), "LoanDesk: invalid pool address");
        require(_liquidityToken != address(0), "LoanDesk: invalid liquidity token address");
        require(_lenderGovernanceRole != 0x00, "LoanDesk: invalid lender governance role");

        uint8 _decimals = IERC20Metadata(_liquidityToken).decimals();

        loanTemplate = LoanTemplate({
            minAmount: 100 * 10 ** uint256(_decimals), // 100 asset tokens
            minDuration: SaplingMath.SAFE_MIN_DURATION,
            maxDuration: SaplingMath.SAFE_MAX_DURATION,
            gracePeriod: 60 days,
            apr: uint32(30 * 10 ** SaplingMath.PERCENT_DECIMALS) // 30%
        });

        config = LoanDeskConfig({
            lenderGovernanceRole: _lenderGovernanceRole,
            pool: _pool,
            liquidityToken: _liquidityToken
        });

        nextApplicationId = 1;
        nextLoanId = 1;
    }

    /**
     * @notice Set a minimum loan amount.
     * @dev minAmount must be greater than or equal to safeMinAmount.
     *      Caller must be the staker.
     * @param minAmount Minimum loan amount to be enforced on new loan requests and offers
     */
    function setMinLoanAmount(uint256 minAmount) external onlyStaker {
        require(SaplingMath.SAFE_MIN_AMOUNT <= minAmount, "LoanDesk: new min loan amount is less than the safe limit");

        uint256 prevValue = loanTemplate.minAmount;
        loanTemplate.minAmount = minAmount;

        emit MinLoanAmountSet(prevValue, minAmount);
    }

    /**
     * @notice Set the minimum loan duration
     * @dev Duration must be in seconds and inclusively between SAFE_MIN_DURATION and maxDuration.
     *      Caller must be the staker.
     * @param duration Minimum loan duration to be enforced on new loan requests and offers
     */
    function setMinLoanDuration(uint256 duration) external onlyStaker {
        require(
            SaplingMath.SAFE_MIN_DURATION <= duration && duration <= loanTemplate.maxDuration,
            "LoanDesk: new min duration is out of bounds"
        );

        uint256 prevValue = loanTemplate.minDuration;
        loanTemplate.minDuration = duration;

        emit MinLoanDurationSet(prevValue, duration);
    }

    /**
     * @notice Set the maximum loan duration.
     * @dev Duration must be in seconds and inclusively between minDuration and SAFE_MAX_DURATION.
     *      Caller must be the staker.
     * @param duration Maximum loan duration to be enforced on new loan requests and offers
     */
    function setMaxLoanDuration(uint256 duration) external onlyStaker {
        require(
            loanTemplate.minDuration <= duration && duration <= SaplingMath.SAFE_MAX_DURATION,
            "LoanDesk: new max duration is out of bounds"
        );

        uint256 prevValue = loanTemplate.maxDuration;
        loanTemplate.maxDuration = duration;

        emit MaxLoanDurationSet(prevValue, duration);
    }

    /**
     * @notice Set the template loan payment grace period.
     * @dev Grace period must be in seconds and inclusively between MIN_LOAN_GRACE_PERIOD and MAX_LOAN_GRACE_PERIOD.
     *      Caller must be the staker.
     * @param gracePeriod Loan payment grace period for new loan offers
     */
    function setTemplateLoanGracePeriod(uint256 gracePeriod) external onlyStaker {
        require(
            SaplingMath.MIN_LOAN_GRACE_PERIOD <= gracePeriod && gracePeriod <= SaplingMath.MAX_LOAN_GRACE_PERIOD,
            "LoanDesk: new grace period is out of bounds."
        );

        uint256 prevValue = loanTemplate.gracePeriod;
        loanTemplate.gracePeriod = gracePeriod;

        emit TemplateLoanGracePeriodSet(prevValue, gracePeriod);
    }

    /**
     * @notice Set a template loan APR
     * @dev APR must be inclusively between SAFE_MIN_APR and 100%.
     *      Caller must be the staker.
     * @param apr Loan APR to be enforced on the new loan offers.
     */
    function setTemplateLoanAPR(uint32 apr) external onlyStaker {
        require(
            SaplingMath.SAFE_MIN_APR <= apr && apr <= SaplingMath.HUNDRED_PERCENT,
            "LoanDesk: APR is out of bounds"
        );

        uint256 prevValue = loanTemplate.apr;
        loanTemplate.apr = apr;

        emit TemplateLoanAPRSet(prevValue, apr);
    }

    /**
     * @notice Request a new loan.
     * @dev Requested amount must be greater or equal to minLoanAmount().
     *      Loan duration must be between minDuration() and maxDuration().
     *      Multiple pending applications from the same address are not allowed.
     *      _profileId and _profileDigest are optional - provide nill values when not applicable.
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
            status: LoanApplicationStatus.APPLIED,
            profileId: _profileId,
            profileDigest: _profileDigest
        });

        recentApplicationIdOf[msg.sender] = appId;

        emit LoanRequested(appId, msg.sender, _amount, _duration);
    }

    /**
     * @notice Deny a loan.
     * @dev Loan must be in APPLIED status.
     *      Caller must be the staker.
     */
    function denyLoan(
        uint256 appId
    )
        external
        onlyStaker
        applicationInStatus(appId, LoanApplicationStatus.APPLIED)
        whenNotPaused
    {
        LoanApplication storage app = loanApplications[appId];
        app.status = LoanApplicationStatus.DENIED;

        emit LoanRequestDenied(appId, app.borrower);
    }

    /**
     * @notice Draft a loan offer for an application.
     * @dev Loan application must be in APPLIED status.
     *      Caller must be the staker.
     *      Loan amount must not exceed available liquidity.
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
        uint32 _apr
    )
        external
        onlyStaker
        applicationInStatus(appId, LoanApplicationStatus.APPLIED)
        whenNotClosed
        whenNotPaused
    {
        //// check

        validateLoanParams(_amount, _duration, _gracePeriod, _installmentAmount, _installments, _apr);

        address borrower = loanApplications[appId].borrower;

        require(
            ILendingPool(config.pool).canOffer(_amount),
            "LoanDesk: pool cannot offer this loan at this time"
        );

        //// effect

        loanOffers[appId] = LoanOffer({
            applicationId: appId,
            borrower: borrower,
            amount: _amount,
            duration: _duration,
            gracePeriod: _gracePeriod,
            installmentAmount: _installmentAmount,
            installments: _installments,
            apr: _apr,
            lockedTime: 0
        });

        loanApplications[appId].status = LoanApplicationStatus.OFFER_DRAFTED;

        //// interactions

        ILendingPool(config.pool).onOfferAllocate(_amount);

        emit LoanDrafted(appId, borrower, _amount);
    }

    /**
     * @notice Update an existing draft loan offer.
     * @dev Loan application must be in OFFER_DRAFTED status.
     *      Caller must be the staker.
     *      Loan amount must not exceed available liquidity.
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
        uint32 _apr
    )
        external
        onlyStaker
        applicationInStatus(appId, LoanApplicationStatus.OFFER_DRAFTED)
        whenNotClosed
        whenNotPaused
    {
        //// check

        validateLoanParams(_amount, _duration, _gracePeriod, _installmentAmount, _installments, _apr);

        LoanOffer storage offer = loanOffers[appId];

        uint256 prevAmount = offer.amount;
        if (_amount > prevAmount) {
            require(
                ILendingPool(config.pool).canOffer(_amount - prevAmount),
                "LoanDesk: lending pool cannot offer this loan at this time"
            );
        }

        //// effect
        offer.amount = _amount;
        offer.duration = _duration;
        offer.gracePeriod = _gracePeriod;
        offer.installmentAmount = _installmentAmount;
        offer.installments = _installments;
        offer.apr = _apr;

        emit LoanDraftUpdated(appId, offer.borrower, prevAmount, _amount);

        //// interactions
        if (_amount > prevAmount) {
            ILendingPool(config.pool).onOfferAllocate(_amount - prevAmount);
        } else if (_amount < prevAmount) {
            uint256 returnAmount = prevAmount - _amount;
            SafeERC20Upgradeable.safeApprove(IERC20Upgradeable(config.liquidityToken), config.pool, returnAmount);
            ILendingPool(config.pool).onOfferDeallocate(returnAmount);
        }
    }

    /**
     * @notice Lock a draft loan offer.
     * @dev Locking an offer makes it cancellable by a lender vote.
     *      Loan application must be in OFFER_DRAFTED status.
     *      Caller must be the staker.
     * @param appId Loan application id
     */
    function lockDraftOffer(
        uint256 appId
    )
        external
        onlyStaker
        applicationInStatus(appId, LoanApplicationStatus.OFFER_DRAFTED)
        whenNotClosed
        whenNotPaused
    {
        //// effect
        loanApplications[appId].status = LoanApplicationStatus.OFFER_DRAFT_LOCKED;
        loanOffers[appId].lockedTime = block.timestamp;

        emit LoanDraftLocked(appId, loanApplications[appId].borrower);
    }

    /**
     * @notice Make a loan offer.
     * @dev Loan application must be in OFFER_DRAFT_LOCKED status.
     *      Caller must be the staker.
     *      Voting lock period must have expired.
     * @param appId Loan application id
     */
    function offerLoan(
        uint256 appId
    )
        external
        onlyStaker
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

        emit LoanOffered(appId, loanApplications[appId].borrower);
    }

    /**
     * @notice Cancel a loan.
     * @dev Loan application must be in one of OFFER_MADE, OFFER_DRAFT_LOCKED, OFFER_MADE statuses.
     *      Caller must be the staker or the lender governance within the voting window.
     */
    function cancelLoan(uint256 appId) external {
        /// check
        require(appId != 0, "LoanDesk: invalid id");
        require(loanApplications[appId].id == appId, "LoanDesk: not found");
        LoanApplicationStatus status = loanApplications[appId].status;
        require(
            status == LoanApplicationStatus.OFFER_DRAFTED 
            || status == LoanApplicationStatus.OFFER_DRAFT_LOCKED 
            || status == LoanApplicationStatus.OFFER_MADE, 
            "LoanDesk: invalid status"
        );

        LoanOffer storage offer = loanOffers[appId];

        if(msg.sender != staker) {
            require(
                hasRole(config.lenderGovernanceRole, msg.sender) && status == LoanApplicationStatus.OFFER_DRAFT_LOCKED
                && block.timestamp < offer.lockedTime + SaplingMath.LOAN_LOCK_PERIOD,
                "LoanDesk: unauthorized"
            );
        }

        //// effect
        loanApplications[appId].status = LoanApplicationStatus.CANCELLED;

        emit LoanOfferCancelled(appId, offer.borrower, offer.amount);

        //// interactions
        SafeERC20Upgradeable.safeApprove(IERC20Upgradeable(config.liquidityToken), config.pool, offer.amount);
        ILendingPool(config.pool).onOfferDeallocate(offer.amount);
    }

    /**
     * @notice Accept a loan offer and withdraw funds
     * @dev Caller must be the borrower of the loan in question.
     *      The loan must be in OFFER_MADE status.
     * @param appId ID of the loan application to accept the offer of
     */
    function borrow(
        uint256 appId
    )
        external
        whenNotClosed
        whenNotPaused
        nonReentrant
        applicationInStatus(appId, ILoanDesk.LoanApplicationStatus.OFFER_MADE)
        updatedState
    {
        //// check

        LoanOffer storage offer = loanOffers[appId];
        require(offer.borrower == msg.sender, "LoanDesk: msg.sender is not the borrower on this loan");

        //// effect

        loanApplications[appId].status = LoanApplicationStatus.OFFER_ACCEPTED;

        uint256 offerAmount = offer.amount;

        uint256 prevBorrowedFunds = lentFunds;
        lentFunds = prevBorrowedFunds + offerAmount;

        emit LoanOfferAccepted(appId, msg.sender, offerAmount);

        uint256 loanId = nextLoanId;
        nextLoanId++;

        loans[loanId] = Loan({
            id: loanId,
            applicationId: appId,
            borrower: offer.borrower,
            amount: offerAmount,
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
            interestPaidTillTime: block.timestamp
        });

        weightedAvgAPR = uint32(
            (prevBorrowedFunds * weightedAvgAPR + offerAmount * offer.apr)
            / lentFunds
        );

        //// interactions

        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(config.liquidityToken), offer.borrower, offerAmount);

        emit LoanBorrowed(loanId, appId, offer.borrower, offerAmount);
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
     * @notice Default a loan.
     * @dev Loan must be in OUTSTANDING status.
     *      Caller must be the staker.
     *      canDefault(loanId) must be true.
     * @param loanId ID of the loan to default
     */
    function defaultLoan(
        uint256 loanId
    )
        external
        onlyStaker
        whenNotPaused
        nonReentrant
        updatedState
    {
        //// check

        require(canDefault(loanId), "LoanDesk: cannot default this loan at this time");

        //// effect

        Loan storage loan = loans[loanId];

        loan.status = LoanStatus.DEFAULTED;

        (uint256 principalLoss, uint256 yieldLoss, ) = loanBalanceDueWithInterest(loanId);

        (uint256 stakerLoss, uint256 lenderLoss) = ILendingPool(config.pool).onDefault(
            loanId,
            principalLoss,
            yieldLoss
        );

        // update lent funds and avg apr after the call to onDefault(),
        // to have pre-default price per share when burning the correct amount of stake
        lentFunds -= principalLoss;
        updateAvgApr(principalLoss, loan.apr);

        emit LoanDefaulted(loanId, loan.borrower, stakerLoss, lenderLoss);
    }

    /**
     * @notice Make a payment towards a loan.
     * @dev Loan must be in OUTSTANDING status.
     *      Only the necessary sum is charged if amount exceeds amount due.
     *      Amount charged will not exceed the amount parameter.
     * @param loanId ID of the loan to make a payment towards
     * @param amount Payment amount in tokens
     */
    function repayBase(uint256 loanId, uint256 amount) internal nonReentrant whenNotPaused updatedState {

        //// check

        Loan storage loan = loans[loanId];
        require(
            loan.id == loanId && loan.status == LoanStatus.OUTSTANDING,
            "LoanDesk: not found or invalid loan status"
        );

        require(amount > 0, "LoanDesk: invalid amount");

        (
            uint256 transferAmount,
            uint256 interestPayable,
            uint256 payableInterestDays
        ) = payableLoanBalance(loanId, amount);

        // check transferable amount, zero transferable amount means the payment 'amount' was less than 1 day interest
        require(transferAmount > 0, "LoanDesk: invalid amount - increase to daily interest");

        //// effect

        uint256 principalPaid = transferAmount - interestPayable;

        LoanDetail storage loanDetail = loanDetails[loanId];
        loanDetail.totalAmountRepaid += transferAmount;
        loanDetail.principalAmountRepaid += principalPaid;
        loanDetail.interestPaidTillTime += payableInterestDays * 86400;

        if (loanDetail.principalAmountRepaid >= loan.amount) {
            loan.status = LoanStatus.REPAID;

            emit LoanFullyRepaid(loanId, loan.borrower);
        }

        emit LoanRepaymentInitiated(loanId, loan.borrower, msg.sender, transferAmount, interestPayable);

        lentFunds -= principalPaid;
        updateAvgApr(principalPaid, loan.apr);

        //// interactions

        ILendingPool(config.pool).onRepay(
            loanId, 
            loan.borrower, 
            msg.sender,
            transferAmount,
            interestPayable,
            loan.borrowedTime
        );
    }

    /**
     * @dev Internal method to update the weighted average loan apr based on the amount reduced by and an apr.
     * @param amountReducedBy amount by which the funds committed into strategy were reduced, due to repayment or loss
     * @param apr annual percentage rate of the strategy
     */
    function updateAvgApr(uint256 amountReducedBy, uint32 apr) internal {
        if (lentFunds > 0) {
            weightedAvgAPR = uint32(
                ((lentFunds + amountReducedBy) * weightedAvgAPR - amountReducedBy * apr)
                / lentFunds
            );
        } else {
            weightedAvgAPR = 0;
        }
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
        return principalOutstanding + interestOutstanding;
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

        if (block.timestamp > loan.borrowedTime + loan.duration + loan.gracePeriod) {
            // loan has any outstanding amount and is overdue beyond the grace period
            return true;
        }

        uint256 installmentPeriod = loan.duration / loan.installments;
        uint256 pastInstallments = (block.timestamp - loan.borrowedTime) / installmentPeriod;
        uint256 totalPaymentExpected = loan.installmentAmount * pastInstallments;

        if (loanDetails[loanId].totalAmountRepaid < totalPaymentExpected) {
            /*
                Some installment amount may be overdue:

                - total amount repaid is less than the sum of all previous installments

                Note:

                When installment amount is greater than necessary for loan amortisation,
                if installment payments are kept on time, borrower is not overcharged on any payment beyond
                the total amount due, and the loan will naturally be closed before it can be considered a default.

                canDefault() requires loans to be in OUTSTANDING status.
             */

            uint256 paidInstallments = loanDetails[loanId].totalAmountRepaid / loan.installmentAmount;
            // Determining the current period that has been paid and adding a grace period, compare it to the current time.
            if (block.timestamp > loan.borrowedTime + paidInstallments * installmentPeriod + loan.gracePeriod) {
                return true;
            }
        }

        return false;
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
        uint32 _apr
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

        uint256 daysPassed = countInterestDays(loan.borrowedTime, detail.interestPaidTillTime);
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
     * @return Total transfer amount, interest payable, and the number of payable interest days,
     *         and the current loan balance
     */
    function payableLoanBalance(
        uint256 loanId,
        uint256 maxPaymentAmount
    )
        private
        view
        returns (uint256, uint256, uint256)
    {
        (
            uint256 principalOutstanding,
            uint256 interestOutstanding,
            uint256 interestDays
        ) = loanBalanceDueWithInterest(loanId);

        uint256 balanceDue = principalOutstanding + interestOutstanding;
        uint256 transferAmount = MathUpgradeable.min(balanceDue, maxPaymentAmount);

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

             Do not accept leftover payments towards the principal while any daily interest is outstanding.
             */
            if (payableInterestDays < interestDays) {
                transferAmount = interestPayable;
            }
        }

        return (transferAmount, interestPayable, payableInterestDays);
    }

    /**
     * @notice Get the number of days in a time period to witch an interest can be applied.
     * @dev Returns the floor of the unix day count, but not less than 1.
     * @param borrowedTime Block timestamp of the loan borrowed time.
     * @param interestPaidTillTime Block timestamp up to which the interest is paid for.
     * @return Floor count of unix day in a time period to witch an interest can be applied.
     */
    function countInterestDays(uint256 borrowedTime, uint256 interestPaidTillTime) private view returns(uint256) {
        uint256 unixDay = block.timestamp / 86400;
        uint256 interestPaidUnixDay = interestPaidTillTime / 86400;
        if (unixDay < interestPaidUnixDay) {
            /*
             No interest to be charged if current unixDay is less than interestPaidUnixDay,
             which will be the case on the second payment being made on the same day of borrowing.

             Not charging interest for the seconds payment on the same day is expected as the first payment
             must be at least the full daily interest amount.
             */
            return 0;
        }

        if (borrowedTime / 86400 == unixDay) {
            /*
             Minimum of one day interest is required while on the same unix day as borrow,
             if the first day's interest is not already accounted for (handled by the first if clause).
            */
            return 1;
        }

        return unixDay - interestPaidUnixDay;
    }

    /**
     * @notice Indicates whether or not the contract can be closed in it's current state.
     * @dev Overrides a hook in SaplingStakerContext.
     * @return True if the contract is closed, false otherwise.
     */
    function canClose() internal view override returns (bool) {
        return lentFunds == 0;
    }

    /**
     * @notice Indicates whether or not the contract can be opened in it's current state.
     * @dev Overrides a hook in SaplingStakerContext.
     * @return True if the conditions to open are met, false otherwise.
     */
    function canOpen() internal view override returns (bool) {
        return config.pool != address(0) && config.liquidityToken != address(0);
    }

    /**
     * @dev External accessor for library level percent decimals.
     */
    function percentDecimals() external pure returns (uint8) {
        return SaplingMath.PERCENT_DECIMALS;
    }
}
