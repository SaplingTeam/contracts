pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./ManagedLendingPool.sol";

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

    struct LoanDetail {
        uint256 loanId;
        uint256 totalAmountRepaid; //total amount paid including interest
        uint256 baseAmountRepaid;
        uint256 interestPaid;
        uint256 approvedTime;
        uint256 lastPaymentTime;
    }

    event LoanRequested(uint256 loanId, address borrower);
    event LoanApproved(uint256 loanId);
    event LoanDenied(uint256 loanId);
    event LoanCancelled(uint256 loanId);
    event LoanRepaid(uint256 loanId);
    event LoanDefaulted(uint256 loanId, uint256 amountLost);

    modifier loanInStatus(uint256 loanId, LoanStatus status) {
        Loan storage loan = loans[loanId];
        require(loan.id != 0, "Loan is not found.");
        require(loan.status == status, "Loan does not have a valid status for this operation.");
        _;
    }

    modifier onlyLender() {
        address wallet = msg.sender;
        require(wallet != address(0), "BankFair: Address is not prsent.");
        require(wallet != manager && wallet != protocolWallet, "BankFair: Wallet is a manager or protocol.");
        //FIXME: currently borrower is a wallet that has any past or present loans/application,
        //TODO wallet is a borrower if: has open loan or loan application. Implement basic loan history first.
        require(recentLoanIdOf[wallet] == 0, "BankFair: Wallet is a borrower."); 
        _;
    }

    modifier onlyBorrower() {
        address wallet = msg.sender;
        require(wallet != address(0), "BankFair: Address is not prsent.");
        require(wallet != manager && wallet != protocolWallet, "BankFair: Wallet is a manager or protocol.");
        require(poolShares[wallet] == 0, "BankFair: Applicant is a lender.");
        _;
    }

    // APR, to represent a percentage value as int, mutiply by (10 ^ percentDecimals)
    uint16 public constant SAFE_MIN_APR = 0; // 0%
    uint16 public constant SAFE_MAX_APR = ONE_HUNDRED_PERCENT;
    uint16 public defaultAPR;
    uint16 public defaultLateAPRDelta;

    // minimum loan amount including token decimals
    uint256 public constant SAFE_MIN_AMOUNT = 1000000; // 1 token unit with 6 decimals. i.e. 1 USDC
    uint256 public minAmount;

    // loan duration in seconds
    uint256 public constant SAFE_MIN_DURATION = 1 days;
    uint256 public constant SAFE_MAX_DURATION = 51 * 365 days;
    uint256 public minDuration;
    uint256 public maxDuration;

    uint256 private nextLoanId;
    mapping(address => bool) private hasOpenApplication; // borrower has open loan application pending

    uint256 public borrowedFunds;
    uint256 public loanFundsPendingWithdrawal;
    mapping(address => uint256) public loanFunds; //FIXE make internal

    mapping(uint256 => Loan) public loans; //mapping of loan applications
    mapping(uint256 => LoanDetail) public loanDetails; //mapping of loan details only availble after a loan has been granted
    mapping(address => uint256) public recentLoanIdOf;

    constructor(address tokenAddress, address protocol, uint256 minLoanAmount) ManagedLendingPool(tokenAddress, protocol) {
        
        nextLoanId = 1;

        require(SAFE_MIN_AMOUNT <= minLoanAmount, "New min loan amount is less than the safe limit");
        minAmount = minLoanAmount;
        
        defaultAPR = 300; // 30%
        defaultLateAPRDelta = 50; //5%
        minDuration = SAFE_MIN_DURATION;
        maxDuration = SAFE_MAX_DURATION;

        poolLiqudity = 0;
        borrowedFunds = 0;
        loanFundsPendingWithdrawal = 0;
    }

    function setDefaultAPR(uint16 apr) external onlyManager {
        require(SAFE_MIN_APR <= apr && apr <= SAFE_MAX_APR, "APR is out of bounds");
        defaultAPR = apr;
    }

    function setDefaultLateAPRDelta(uint16 lateAPRDelta) external onlyManager {
        require(SAFE_MIN_APR <= lateAPRDelta && lateAPRDelta <= SAFE_MAX_APR, "APR is out of bounds");
        defaultLateAPRDelta = lateAPRDelta;
    }

    function setMinLoanAmount(uint256 minLoanAmount) external onlyManager {
        require(SAFE_MIN_AMOUNT <= minLoanAmount, "New min loan amount is less than the safe limit");
        minAmount = minLoanAmount;
    }

    function setLoanMinDuration(uint256 duration) external onlyManager {
        require(SAFE_MIN_DURATION <= duration && duration <= SAFE_MAX_DURATION, "New min duration is out of bounds");
        require(duration <= maxDuration, "New min duration is greater than current max duration");
        minDuration = duration;
    }

    function setLoanMaxDuration(uint256 duration) external onlyManager {
        require(SAFE_MIN_DURATION <= duration && duration <= SAFE_MAX_DURATION, "New max duration is out of bounds");
        require(minDuration <= duration, "New max duration is less than current min duration");
        maxDuration = duration;
    }

    function requestLoan(uint256 requestedAmount, uint256 loanDuration) external onlyBorrower returns (uint256) {

        require(hasOpenApplication[msg.sender] == false, "Another loan application is pending.");

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
        recentLoanIdOf[msg.sender] = loanId; 

        emit LoanRequested(loanId, msg.sender);

        return loanId;
    }

    function approveLoan(uint256 _loanId) external onlyManager loanInStatus(_loanId, LoanStatus.APPLIED) {
        Loan storage loan = loans[_loanId];

        //TODO implement any other checks for the loan to be approved
        // require(block.timestamp <= loan.requestedTime + 31 days, "This loan application has expired.");//FIXME

        require(poolLiqudity >= loan.amount, "BankFair: Pool liqudity is insuvvificent to approve this loan.");
        require(sharesStaked >= multiplyByFraction(totalPoolShares, loanApprovalStakePercent, ONE_HUNDRED_PERCENT), 
        "BankFair: Stake amount is too low to approve new loans.");

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
        poolLiqudity = poolLiqudity.sub(loan.amount);
        borrowedFunds = borrowedFunds.add(loan.amount);

        emit LoanApproved(_loanId);
    }

    function denyLoan(uint256 loanId) external onlyManager loanInStatus(loanId, LoanStatus.APPLIED) {
        Loan storage loan = loans[loanId];
        loan.status = LoanStatus.DENIED;
        hasOpenApplication[loan.borrower] = false;

        emit LoanDenied(loanId);
    }

    /* 
     * Cancel loans whose funds are not withdrawn
     */
    function cancelLoan(uint256 loanId) external onlyManager loanInStatus(loanId, LoanStatus.APPROVED) {
        Loan storage loan = loans[loanId];

        // require(block.timestamp > loanDetail.approvedTime + loan.duration + 31 days, "It is too early to cancel this loan."); //FIXME

        loan.status = LoanStatus.CANCELLED;
        decreaseLoanFunds(loan.borrower, loan.amount);
        poolLiqudity = poolLiqudity.add(loan.amount);
        borrowedFunds = borrowedFunds.sub(loan.amount);
        
        emit LoanCancelled(loanId);
    }

    function repay(uint256 loanId, uint256 amount) external loanInStatus(loanId, LoanStatus.FUNDS_WITHDRAWN) returns (uint256, uint256) {
        Loan storage loan = loans[loanId];

        // require the payer and the borrower to be the same to avoid mispayment
        require(loan.borrower == msg.sender, "Payer is not the borrower.");

        (uint256 amountDue, uint256 interestPercent) = loanBalanceDueWithInterest(loanId);
        uint256 transferAmount = Math.min(amountDue, amount);

        chargeTokensFrom(msg.sender, transferAmount);

        if (transferAmount == amountDue) {
            loan.status = LoanStatus.REPAID;
        }

        LoanDetail storage loanDetail = loanDetails[loanId];
        loanDetail.lastPaymentTime = block.timestamp;
        
        uint256 interestPaid = multiplyByFraction(transferAmount, interestPercent, ONE_HUNDRED_PERCENT + interestPercent);
        uint256 baseAmountPaid = transferAmount.sub(interestPaid);

        //share profits to protocol
        uint256 protocolEarnedInterest = multiplyByFraction(interestPaid, protocolEarningPercent, ONE_HUNDRED_PERCENT);
        
        protocolEarnings[protocolWallet] = protocolEarnings[protocolWallet].add(protocolEarnedInterest); 

        //share profits to manager 
        uint256 managerEarnedInterest = protocolEarnedInterest.sub(
            protocolEarnedInterest.div(
                uint256(ONE_HUNDRED_PERCENT).add(
                    //TODO precalculate the following when pool shares are minted/destroyed, and when the leverage factor is edited
                    multiplyByFraction(sharesStaked, ONE_HUNDRED_PERCENT, totalPoolShares).mul(
                            uint256(managerLeveragedEarningPercent).sub(ONE_HUNDRED_PERCENT)
                        )
                )
            )
        );

        protocolEarnings[manager] = protocolEarnings[manager].add(managerEarnedInterest);

        loanDetail.totalAmountRepaid = loanDetail.totalAmountRepaid.add(transferAmount);
        loanDetail.baseAmountRepaid = loanDetail.baseAmountRepaid.add(baseAmountPaid);
        loanDetail.interestPaid = loanDetail.interestPaid.add(interestPaid);

        borrowedFunds = borrowedFunds.sub(baseAmountPaid);
        poolLiqudity = poolLiqudity.add(transferAmount.sub(protocolEarnedInterest.add(managerEarnedInterest)));

        return (transferAmount, interestPaid);
    }

    function defaultLoan(uint256 loanId) external onlyManager loanInStatus(loanId, LoanStatus.FUNDS_WITHDRAWN) {
        Loan storage loan = loans[loanId];
        LoanDetail storage loanDetail = loanDetails[loanId];

        //TODO implement any other checks for the loan to be defaulted
        // require(block.timestamp > loanDetail.approvedTime + loan.duration + 31 days, "It is too early to default this loan."); //FIXME

        loan.status = LoanStatus.DEFAULTED;

        (, uint256 loss) = loan.amount.trySub(loanDetail.totalAmountRepaid); //FIXME is this logic correct
        
        emit LoanDefaulted(loanId, loss);

        if (loss > 0) {
            deductLosses(loss);
        }

        if (loanDetail.baseAmountRepaid < loan.amount) {
            borrowedFunds = borrowedFunds.sub(loan.amount.sub(loanDetail.baseAmountRepaid));
        }
    }

    function loanBalanceDue(uint256 loanId) external view loanInStatus(loanId, LoanStatus.FUNDS_WITHDRAWN) returns(uint256) {
        (uint256 amountDue,) = loanBalanceDueWithInterest(loanId);
        return amountDue;
    }

    function loanBalanceDueWithInterest(uint256 loanId) internal view returns (uint256, uint256) {
        Loan storage loan = loans[loanId];
        if (loan.status == LoanStatus.REPAID) {
            return (0, 0);
        }

        LoanDetail storage loanDetail = loanDetails[loanId];
        uint256 interestPercent = calculateInterestPercent(loan, loanDetail);
        uint256 baseAmountDue = loan.amount.sub(loanDetail.baseAmountRepaid);
        uint256 balanceDue = baseAmountDue.add(multiplyByFraction(baseAmountDue, interestPercent, ONE_HUNDRED_PERCENT));

        return (balanceDue, interestPercent);
    }

    function calculateInterestPercent(Loan storage loan, LoanDetail storage loanDetail) private view returns (uint256) {
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

        return multiplyByFraction(apr, daysPassed, 365);
    }

    function countInterestDays(uint256 timeFrom, uint256 timeTo) private pure returns(uint256) {
        uint256 countSeconds = timeTo.sub(timeFrom);
        uint256 dayCount = countSeconds.div(86400);

        if (countSeconds.mod(86400) > 0) {
            dayCount++;
        }

        return dayCount;
    }

    function increaseLoanFunds(address wallet, uint256 amount) private {
        loanFunds[wallet] = loanFunds[wallet].add(amount);
        loanFundsPendingWithdrawal = loanFundsPendingWithdrawal.add(amount);
    }

    function decreaseLoanFunds(address wallet, uint256 amount) internal {
        require(loanFunds[wallet] >= amount, "BankFair: requested amount is not available in the funding account");
        loanFunds[wallet] = loanFunds[wallet].sub(amount);
        loanFundsPendingWithdrawal = loanFundsPendingWithdrawal.sub(amount);
    }

    function deductLosses(uint256 lossAmount) internal {

        poolFunds = poolFunds.sub(lossAmount);

        uint256 lostShares = tokensToShares(lossAmount);
        uint256 remainingLostShares = lostShares;

        if (sharesStaked > 0) {
            uint256 stakedShareLoss = Math.min(lostShares, sharesStaked);
            remainingLostShares = lostShares.sub(stakedShareLoss);
            sharesStaked = sharesStaked.sub(stakedShareLoss);
            updatePoolLimit();

            burnShares(manager, stakedShareLoss);

            if (sharesStaked == 0) {
                emit StakedAssetsDepleted();
            }
        }

        if (remainingLostShares > 0) {
            emit UnstakedLoss(lossAmount.sub(sharesToTokens(remainingLostShares)));
        }
    }
}
