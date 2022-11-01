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
        uint256 minLoanAmount;

        /// Minimum loan duration in seconds
        uint256 minLoanDuration;

        /// Maximum loan duration in seconds
        uint256 maxLoanDuration;

        /// Loan payment grace period after which a loan can be defaulted
        uint256 templateLoanGracePeriod;

        /// Loan APR to be applied for the new loan requests
        uint16 templateLoanAPR;
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

        /// All time loan offer cancellation count
        uint256 countCancelled;

        /// Most recent application id
        uint256 recentApplicationId;

        /// Whether or not this borrower has a pending application
        bool hasOpenApplication;
    }

    /// Event for when a new loan is requested, and an application is created
    event LoanRequested(uint256 applicationId, address indexed borrower);

    /// Event for when a loan request is denied
    event LoanRequestDenied(uint256 applicationId, address indexed borrower);

    /// Event for when a loan offer is made
    event LoanOffered(uint256 applicationId, address indexed borrower);

    /// Event for when a loan offer is updated
    event LoanOfferUpdated(uint256 applicationId, address indexed borrower);

    /// Event for when a loan offer is cancelled
    event LoanOfferCancelled(uint256 applicationId, address indexed borrower);

    /// Event for when a loan offer is accepted
    event LoanOfferAccepted(uint256 applicationId, address indexed borrower);

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
     * @dev Hook to be called when a loan offer is accepted.
     * @param appId ID of the application the accepted offer was made for.
     */
    function onBorrow(uint256 appId) external;

    /**
     * @notice Accessor for application status.
     * @dev NULL status is returned for nonexistent applications.
     * @param appId ID of the application in question.
     * @return Current status of the application with the specified ID.
     */
    function applicationStatus(uint256 appId) external view returns (LoanApplicationStatus);

    /**
     * @notice Accessor for loan offer.
     * @dev Loan offer is valid when the loan application is present and has OFFER_MADE status.
     * @param appId ID of the application the offer was made for.
     * @return LoanOffer struct instance for the specified application ID.
     */
    function loanOfferById(uint256 appId) external view returns (LoanOffer memory);
}
