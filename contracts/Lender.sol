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
        address wallet = msg.sender;
        require(wallet != address(0), "SaplingPool: Address is not present.");
        require(wallet != manager && wallet != protocol, "SaplingPool: Wallet is a manager or protocol.");
        require(hasOpenApplication[wallet] == false && borrowerStats[msg.sender].countApproved == 0 
            && borrowerStats[msg.sender].countOutstanding == 0, "SaplingPool: Wallet is a borrower."); 
        _;
    }

    modifier validBorrower() {
        address wallet = msg.sender;
        require(wallet != address(0), "SaplingPool: Address is not present.");
        require(wallet != manager && wallet != protocol, "SaplingPool: Wallet is a manager or protocol.");
        require(sharesToTokens(poolShares[wallet]) >= ONE_TOKEN, "SaplingPool: Wallet is a lender.");
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

    /// Loan id generator counter
    uint256 private nextLoanId;

    /// Quick lookup to check an address has pending loan applications
    mapping(address => bool) private hasOpenApplication;

    /// Total funds borrowed at this time, including both withdrawn and allocated for withdrawal.
    uint256 public borrowedFunds;

    /// Total borrowed funds allocated for withdrawal but not yet withdrawn by the borrowers
    uint256 public loanFundsPendingWithdrawal;

    /// Borrowed funds allocated for withdrawal by borrower addresses
    mapping(address => uint256) public loanFunds; //FIXE make internal

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
    }

    /**
     * @notice Count of all loan requests in this pool.
     * @return Loans count.
     */
    function loansCount() external view returns(uint256) {
        return nextLoanId - 1;
    }

    //FIXME only allow protocol to edit critical parameters, not the manager

    /**
     * @notice Set annual loan interest rate for the future loans.
     * @dev apr must be inclusively between SAFE_MIN_APR and SAFE_MAX_APR.
     *      Caller must be the manager.
     * @param apr Loan APR to be applied for the new loan requests.
     */
    function setDefaultAPR(uint16 apr) external onlyManager {
        require(SAFE_MIN_APR <= apr && apr <= SAFE_MAX_APR, "APR is out of bounds");
        defaultAPR = apr;
    }

    /**
     * @notice Set late payment annual loan interest rate delta for the future loans.
     * @dev lateAPRDelta must be inclusively between SAFE_MIN_APR and SAFE_MAX_APR.
     *      Caller must be the manager.
     * @param lateAPRDelta Loan late payment APR delta to be applied for the new loan requests.
     */
    function setDefaultLateAPRDelta(uint16 lateAPRDelta) external onlyManager {
        require(SAFE_MIN_APR <= lateAPRDelta && lateAPRDelta <= SAFE_MAX_APR, "APR is out of bounds");
        defaultLateAPRDelta = lateAPRDelta;
    }

    /**
     * @notice Set a minimum loan amount for the future loans.
     * @dev minLoanAmount must be greater than or equal to SAFE_MIN_AMOUNT.
     *      Caller must be the manager.
     * @param minLoanAmount minimum loan amount to be enforced for the new loan requests.
     */
    function setMinLoanAmount(uint256 minLoanAmount) external onlyManager {
        require(SAFE_MIN_AMOUNT <= minLoanAmount, "New min loan amount is less than the safe limit");
        minAmount = minLoanAmount;
    }

    /**
     * @notice Set maximum loan duration for the future loans.
     * @dev Duration must be in seconds and inclusively between SAFE_MIN_DURATION and maxDuration.
     *      Caller must be the manager.
     * @param duration Maximum loan duration to be enforced for the new loan requests.
     */
    function setLoanMinDuration(uint256 duration) external onlyManager {
        require(SAFE_MIN_DURATION <= duration && duration <= maxDuration, "New min duration is out of bounds");
        minDuration = duration;
    }

    /**
     * @notice Set maximum loan duration for the future loans.
     * @dev Duration must be in seconds and inclusively between minDuration and SAFE_MAX_DURATION.
     *      Caller must be the manager.
     * @param duration Maximum loan duration to be enforced for the new loan requests.
     */
    function setLoanMaxDuration(uint256 duration) external onlyManager {
        require(minDuration <= duration && duration <= SAFE_MAX_DURATION, "New max duration is out of bounds");
        maxDuration = duration;
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
    function requestLoan(uint256 requestedAmount, uint256 loanDuration) external validBorrower returns (uint256) {

        require(hasOpenApplication[msg.sender] == false, "Another loan application is pending.");

        //FIXME enforce minimum loan amount
        require(requestedAmount > 0, "Loan amount is zero.");
        require(minDuration <= loanDuration, "Loan duration is less than minimum allowed.");
        require(maxDuration >= loanDuration, "Loan duration is more than maximum allowed.");

        //TODO check:
        // ?? must not have unpaid late loans
        // ?? must not have defaulted loans

        uint256 loanId = nextLoanId;
        nextLoanId++;

        loans[loanId] = Loan({
            id: loanId,
            borrower: msg.sender,
            amount: requestedAmount,
            duration: loanDuration,
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
    function approveLoan(uint256 _loanId) external onlyManager loanInStatus(_loanId, LoanStatus.APPLIED) {
        Loan storage loan = loans[_loanId];

        //TODO implement any other checks for the loan to be approved
        // require(block.timestamp <= loan.requestedTime + 31 days, "This loan application has expired.");//FIXME

        require(poolLiquidity >= loan.amount, "SaplingPool: Pool liquidity is insufficient to approve this loan.");
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
        borrowedFunds = borrowedFunds.add(loan.amount);

        emit LoanApproved(_loanId, loan.borrower);
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
    function cancelLoan(uint256 loanId) external onlyManager loanInStatus(loanId, LoanStatus.APPROVED) {
        Loan storage loan = loans[loanId];

        // require(block.timestamp > loanDetail.approvedTime + loan.duration + 31 days, "It is too early to cancel this loan."); //FIXME

        loan.status = LoanStatus.CANCELLED;
        decreaseLoanFunds(loan.borrower, loan.amount);
        poolLiquidity = poolLiquidity.add(loan.amount);
        borrowedFunds = borrowedFunds.sub(loan.amount);

        borrowerStats[loan.borrower].countCancelled++;
        borrowerStats[loan.borrower].countCurrentApproved--;
        
        emit LoanCancelled(loanId, loan.borrower);
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

        return (transferAmount, interestPaid);
    }

    /**
     * @notice Default a loan.
     * @dev Loan must be in FUNDS_WITHDRAWN status.
     *      Caller must be the manager.
     */
    function defaultLoan(uint256 loanId) external onlyManager loanInStatus(loanId, LoanStatus.FUNDS_WITHDRAWN) {
        Loan storage loan = loans[loanId];
        LoanDetail storage loanDetail = loanDetails[loanId];

        //TODO implement any other checks for the loan to be defaulted
        // require(block.timestamp > loanDetail.approvedTime + loan.duration + 31 days, "It is too early to default this loan."); //FIXME

        loan.status = LoanStatus.DEFAULTED;
        borrowerStats[loan.borrower].countOutstanding--;

        (, uint256 loss) = loan.amount.trySub(loanDetail.totalAmountRepaid);
        
        emit LoanDefaulted(loanId, loan.borrower, loss);

        if (loss > 0) {
            poolFunds = poolFunds.sub(loss);

            uint256 lostShares = tokensToShares(loss);
            uint256 remainingLostShares = lostShares;

            if (stakedShares > 0) {
                uint256 stakedShareLoss = Math.min(lostShares, stakedShares);
                remainingLostShares = lostShares.sub(stakedShareLoss);
                stakedShares = stakedShares.sub(stakedShareLoss);
                updatePoolLimit();

                burnShares(manager, stakedShareLoss);

                if (stakedShares == 0) {
                    emit StakedAssetsDepleted();
                }
            }

            if (remainingLostShares > 0) {
                emit UnstakedLoss(loss.sub(sharesToTokens(remainingLostShares)));
            }
        }

        if (loanDetail.baseAmountRepaid < loan.amount) {
            borrowedFunds = borrowedFunds.sub(loan.amount.sub(loanDetail.baseAmountRepaid));
        }
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
}
