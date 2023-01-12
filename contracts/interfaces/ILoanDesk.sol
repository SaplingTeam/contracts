// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @title LoanDesk Interface
 * @dev LoanDesk interface defining common structures and hooks for the lending pools.
 */
interface ILoanDesk {

    /**
     * Loan application statuses. Initial value is defines as 'NULL' to differentiate the unintitialized state from
     * the logical initial states.
     */
    enum LoanApplicationStatus {
        NULL,
        APPLIED,
        DENIED,
        OFFER_DRAFTED,
        OFFER_DRAFT_LOCKED,
        OFFER_MADE,
        OFFER_ACCEPTED,
        CANCELLED
    }

    /// Default loan parameter values
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

    /// Loan application object
    struct LoanApplication {

        /// Application ID
        uint256 id;

        /// Applicant address, the borrower
        address borrower;

        /// Requested loan amount in liquidity tokens
        uint256 amount;

        /// Requested loan duration in seconds
        uint256 duration;

        /// Block timestamp
        uint256 requestedTime;

        /// Application status
        LoanApplicationStatus status;

        /// Applicant profile ID from the borrower metadata API
        string profileId;

        /// Applicant profile digest from the borrower medatata API
        string profileDigest;
    }

    /// Loan offer object
    struct LoanOffer {

        // Application ID, same as the loan application ID this offer is made for
        uint256 applicationId; 

        /// Applicant address, the borrower
        address borrower;

        /// Loan principal amount in liquidity tokens
        uint256 amount;

        /// Loan duration in seconds
        uint256 duration; 

        /// Repayment grace period in seconds
        uint256 gracePeriod;

        /// Installment amount in liquidity tokens
        uint256 installmentAmount;

        /// Installments, the minimum number of repayments
        uint16 installments; 

        /// Annual percentage rate
        uint16 apr; 

        /// Block timestamp of the offer creation/update
        uint256 offeredTime;
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

    /// Loan object
    struct Loan {

        /// ID, increamental, value is not linked to application ID
        uint256 id;

        /// Address of the loan desk contract this loan was created at
        address loanDeskAddress;

        // Application ID, same as the loan application ID this loan is made for
        uint256 applicationId;

        /// Recepient of the loan principal, the borrower
        address borrower;

        /// Loan principal amount in liquidity tokens
        uint256 amount;

        /// Loan duration in seconds
        uint256 duration;

        /// Repayment grace period in seconds
        uint256 gracePeriod;

        /// Installment amount in liquidity tokens
        uint256 installmentAmount;

        /// Installments, the minimum number of repayments
        uint16 installments;

        /// Annual percentage rate
        uint16 apr;

        /// Block timestamp of funds release
        uint256 borrowedTime;

        /// Loan status
        LoanStatus status;
    }

    /// Loan payment details
    struct LoanDetail {

        /// Loan ID
        uint256 loanId;

        /** 
         * Total amount repaid in liquidity tokens.
         * Total amount repaid must always equal to the sum of (principalAmountRepaid, interestPaid, paymentCarry)
         */
        uint256 totalAmountRepaid;

        /// Principal amount repaid in liquidity tokens
        uint256 principalAmountRepaid;

        /// Interest paid in liquidity tokens
        uint256 interestPaid;

        /// Payment carry 
        uint256 paymentCarry;

        /// timestamp to calculate the interest from, on the outstanding principal
        uint256 interestPaidTillTime;
    }

    /// Event for when a new loan is requested, and an application is created
    event LoanRequested(uint256 applicationId, address indexed borrower, uint256 amount);

    /// Event for when a loan request is denied
    event LoanRequestDenied(uint256 applicationId, address indexed borrower, uint256 amount);

    /// Event for when a loan offer is made
    event LoanOfferDrafted(uint256 applicationId, address indexed borrower, uint256 amount);

    /// Event for when a loan offer is updated
    event OfferDraftUpdated(uint256 applicationId, address indexed borrower, uint256 prevAmount, uint256 newAmount);

    /// Event for when a loan offer draft is locked and is made available for voting
    event LoanOfferDraftLocked(uint256 applicationId);

    /// Event for when a loan offer has passed voting and is now available to borrow
    event LoanOfferMade(uint256 applicationId);

    /// Event for when a loan offer is cancelled
    event LoanOfferCancelled(uint256 applicationId, address indexed borrower, uint256 amount);

    /// Event for when a loan offer is accepted
    event LoanOfferAccepted(uint256 applicationId, address indexed borrower, uint256 amount);

    /// Event for when loan offer is accepted and the loan is borrowed
    event LoanBorrowed(uint256 loanId, address indexed borrower, uint256 applicationId);

    /// Event for when a loan payment is initiated
    event LoanRepaymentInitiated(
        uint256 loanId, 
        address borrower, 
        address payer, 
        uint256 amount, 
        uint256 interestAmount
    );

    /// Event for when a loan is fully repaid
    event LoanFullyRepaid(uint256 loanId, address indexed borrower);

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
}
