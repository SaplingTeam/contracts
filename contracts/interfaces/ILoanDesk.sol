// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @title LoanDesk Interface
 * @dev LoanDesk interface defining common structures and hooks for the lending pools.
 */
interface ILoanDesk {

    /**
     * Loan application statuses. Initial value is defines as 'NULL' to differentiate the unintitialized state from
     * the logical initial state.
     */
    enum LoanApplicationStatus {
        NULL,
        APPLIED,
        DENIED,
        OFFER_MADE,
        OFFER_ACCEPTED,
        OFFER_CANCELLED
    }

    struct LoanTemplate {
        /// Minimum allowed loan amount
        uint256 minAmount;

        /// Minimum loan duration in seconds
        uint256 minDuration;

        /// Maximum loan duration in seconds
        uint256 maxDuration;

        /// Loan payment grace period after which a loan can be defaulted
        uint256 gracePeriod;

        /// Loan APR to be applied for the new loan requests
        uint16 apr;
    }

    /// Loan application object template
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

    /// Loan offer object template
    struct LoanOffer {
        uint256 applicationId; // ID of the loan application this offer is made for
        address borrower; // applicant address
        uint256 amount; // offered loan principal amount in liquidity tokens
        uint256 duration; // requested loan term in seconds
        uint256 gracePeriod; // payment grace period in seconds
        uint256 installmentAmount; // minimum payment amount on each instalment in liquidity tokens
        uint16 installments; //number of payment installments
        uint16 apr; // annual percentage rate of this loan
        uint256 offeredTime; //the time this offer was created or last updated
    }

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
        uint256 principalAmountRepaid;
        uint256 interestPaid;
        uint256 paymentCarry;
        uint256 interestPaidTillTime;
        uint256 lastPaymentTime;
    }

    /// Event for when a new loan is requested, and an application is created
    event LoanRequested(uint256 applicationId, address indexed borrower, uint256 amount);

    /// Event for when a loan request is denied
    event LoanRequestDenied(uint256 applicationId, address indexed borrower, uint256 amount);

    /// Event for when a loan offer is made
    event LoanOffered(uint256 applicationId, address indexed borrower, uint256 amount);

    /// Event for when a loan offer is updated
    event LoanOfferUpdated(uint256 applicationId, address indexed borrower, uint256 prevAmount, uint256 newAmount);

    /// Event for when a loan offer is cancelled
    event LoanOfferCancelled(uint256 applicationId, address indexed borrower, uint256 amount);

    /// Event for when a loan offer is accepted
    event LoanOfferAccepted(uint256 applicationId, address indexed borrower, uint256 amount);

    /// Event for when loan offer is accepted and the loan is borrowed
    event LoanBorrowed(uint256 loanId, address indexed borrower, uint256 applicationId);

    /// Event for when a loan payment is initiated
    event LoanRepaymentInitiated(uint256 loanId, address borrower, address payer, uint256 amount, uint256 interestAmount);

    /// Event for when a loan is fully repaid
    event LoanRepaid(uint256 loanId, address indexed borrower);

    /// Event for when a loan is closed
    event LoanClosed(uint256 loanId, address indexed borrower, uint256 managerLossAmount, uint256 lenderLossAmount);

    /// Event for when a loan is defaulted
    event LoanDefaulted(uint256 loanId, address indexed borrower, uint256 managerLoss, uint256 lenderLoss);

    /// Setter event
    event MinLoanAmountSet(uint256 prevValue, uint256 newValue);

    /// Setter event
    event MinLoanDurationSet(uint256 prevValue, uint256 newValue);

    /// Setter event
    event MaxLoanDurationSet(uint256 prevValue, uint256 newValue);

    /// Setter event
    event TemplateLoanGracePeriodSet(uint256 prevValue, uint256 newValue);

    /// Setter event
    event TemplateLoanAPRSet(uint256 prevValue, uint256 newValue);

    /**
     * @notice Accessor for loan.
     * @param loanId ID of the loan
     * @return Loan struct instance for the specified loan ID.
     */
    function loanById(uint256 loanId) external view returns (Loan memory);

    /**
     * @notice Accessor for loan.
     * @param loanId ID of the loan
     * @return Loan struct instance for the specified loan ID.
     */
    function loanDetailById(uint256 loanId) external view returns (LoanDetail memory);

    /**
     * @notice View indicating whether or not a given loan qualifies to be defaulted by a given caller.
     * @param loanId ID of the loan to check
     * @param caller An address that intends to call default() on the loan
     * @return True if the given loan can be defaulted, false otherwise
     */
    function canDefault(uint256 loanId, address caller) external view returns (bool);
}
