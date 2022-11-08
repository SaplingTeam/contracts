// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @title LoanDesk Owner Interface
 * @dev Interface defining functional hooks for LoanDesk, and setup hooks for SaplingFactory.
 */
interface ILendingPool {

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
        uint256 interestPaidTillTime;
        uint256 lastPaymentTime;
    }

    /// Individual borrower statistics
    struct BorrowerStats {

        /// Wallet address of the borrower
        address borrower;

        /// All time loan borrow count
        uint256 countBorrowed;

        /// All time loan closure count
        uint256 countRepaid;

        /// All time loan default count
        uint256 countDefaulted;

        /// Current outstanding loan count
        uint256 countOutstanding;

        /// Outstanding loan borrowed amount
        uint256 amountBorrowed;

        /// Outstanding loan repaid principal amount
        uint256 amountBaseRepaid;

        /// Outstanding loan paid interest amount
        uint256 amountInterestPaid;

        /// Most recent loanId
        uint256 recentLoanId;
    }

    /// Event for when a new loan desk is set
    event LoanDeskSet(address from, address to);

    /// Event for when loan offer is accepted and the loan is borrowed
    event LoanBorrowed(uint256 loanId, address indexed borrower, uint256 applicationId);

    /// Event for when a loan is fully repaid
    event LoanRepaid(uint256 loanId, address indexed borrower);

    /// Event for when a loan is closed
    event LoanClosed(uint256 loanId, address indexed borrower, uint256 managerLossAmount, uint256 lenderLossAmount);

    /// Event for when a loan is defaulted
    event LoanDefaulted(uint256 loanId, address indexed borrower, uint256 managerLoss, uint256 lenderLoss);

    /// Event for when a loan payment is made
    event LoanRepaymentMade(uint256 loanId, address borrower, address payer, uint256 amount, uint256 interestAmount);

    /// Event for when a liqudity is allocated for a loan offer
    event OfferLiquidityAllocated(uint256 amount);

    /// Event for when the liqudity is adjusted for a loan offer
    event OfferLiquidityUpdated(uint256 prevAmount, uint256 newAmount);

    /**
     * @notice Links a new loan desk for the pool to use. Intended for use upon initial pool deployment.
     * @dev Caller must be the governance.
     * @param _loanDesk New LoanDesk address
     */
    function setLoanDesk(address _loanDesk) external;

    /**
     * @notice Handles liquidity state changes on a loan offer.
     * @dev Hook to be called when a new loan offer is made.
     *      Caller must be the LoanDesk.
     * @param amount Loan offer amount.
     */
    function onOffer(uint256 amount) external;

    /**
     * @dev Hook to be called when a loan offer amount is updated. Amount update can be due to offer update or
     *      cancellation. Caller must be the LoanDesk.
     * @param prevAmount The original, now previous, offer amount.
     * @param amount New offer amount. Cancelled offer must register an amount of 0 (zero).
     */
    function onOfferUpdate(uint256 prevAmount, uint256 amount) external;

    /**
     * @dev Hook for checking if the lending pool can provide liquidity for the total offered loans amount.
     * @param totalOfferedAmount Total sum of offered loan amount including outstanding offers
     * @return True if the pool has sufficient lending liquidity, false otherwise.
     */
    function canOffer(uint256 totalOfferedAmount) external view returns (bool);
}
