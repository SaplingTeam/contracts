// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @title LoanDesk Interface
 */
interface ILoanDesk {

    /// LoanDesk configuration parameters
    struct LoanDeskConfig {

        /**
         * Lender voting contract role
         * @notice Role given to the address of the voting contract that can cancel a loan offer upon a passing vote
         * @dev The value of this role should be unique for each pool. Role must be created before the contract
         *      deployment, then passed during construction/initialization.
         */
        bytes32 lenderGovernanceRole;

        /// Address of the lending pool contract
        address pool;

        /// Address of an ERC20 liquidity token accepted by the pool
        address liquidityToken;
    }

    /**
     * Loan application statuses. Initial value is defined as 'NULL' to differentiate the uninitialized state from
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
        uint32 apr;
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
        uint32 apr;

        // block timestamp when the offer was locked for voting
        uint256 lockedTime;
    }

    /**
     * Loan statuses. Initial value is defines as 'NULL' to differentiate the uninitialized state from the logical
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

        /// ID, incremental, value is not linked to application ID
        uint256 id;

        // Application ID, same as the loan application ID this loan is made for
        uint256 applicationId;

        /// Recipient of the loan principal, the borrower
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
        uint32 apr;

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
         * Total amount repaid must always equal to the sum of (principalAmountRepaid, interestPaid)
         */
        uint256 totalAmountRepaid;

        /// Principal amount repaid in liquidity tokens
        uint256 principalAmountRepaid;

        /// timestamp to calculate the interest from, on the outstanding principal
        uint256 interestPaidTillTime;
    }

    /// Event for when a new loan is requested
    event LoanRequested(uint256 applicationId, address indexed borrower, uint256 amount, uint256 duration);

    /// Event for when a loan request is denied
    event LoanRequestDenied(uint256 applicationId, address indexed borrower);

    /// Event for when a loan offer is made
    event LoanDrafted(uint256 applicationId, address indexed borrower, uint256 amount);

    /// Event for when a loan offer is updated
    event LoanDraftUpdated(uint256 applicationId, address indexed borrower, uint256 prevAmount, uint256 newAmount);

    /// Event for when a loan offer draft is locked and is made available for voting
    event LoanDraftLocked(uint256 applicationId, address indexed borrower);

    /// Event for when a loan offer has passed voting and is now available to borrow
    event LoanOffered(uint256 applicationId, address indexed borrower);

    /// Event for when a loan offer is accepted
    event LoanOfferAccepted(uint256 applicationId, address indexed borrower, uint256 amount);

    /// Event for when a loan offer is cancelled
    event LoanOfferCancelled(uint256 applicationId, address indexed borrower, uint256 amount);

    /// Event for when loan offer is accepted and the loan is borrowed
    event LoanBorrowed(uint256 loanId, uint256 applicationId, address indexed borrower, uint256 amount);

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
    event LoanClosed(uint256 loanId, address indexed borrower, uint256 stakerLoss, uint256 lenderLoss);

    /// Event for when a loan is defaulted
    event LoanDefaulted(uint256 loanId, address indexed borrower, uint256 stakerLoss, uint256 lenderLoss);

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
     * @notice Accessor
     * @dev Total funds lent at this time, accounts only for loan principals
     */
    function lentFunds() external view returns (uint256);

    /**
     * @notice Accessor
     * @dev Weighted average loan APR on the borrowed funds
     */
    function weightedAvgAPR() external view returns (uint32);
}
