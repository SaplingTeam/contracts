// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @title LoanDesk Owner Interface
 * @dev Interface defining functional hooks for LoanDesk, and setup hooks for SaplingFactory.
 */
interface ILendingPool {

    /// Event for when a new loan desk is set
    event LoanDeskSet(address from, address to);

    event LoanFundsReleased(uint256 loanId, address indexed borrower, uint256 amount);

    /// Event for when a loan is closed
    event LoanClosed(uint256 loanId, address indexed borrower, uint256 managerLossAmount, uint256 lenderLossAmount);

    /// Event for when a loan is defaulted
    event LoanDefaulted(uint256 loanId, address indexed borrower, uint256 managerLoss, uint256 lenderLoss);

    /// Event for when a loan payment is finalized
    event LoanRepaymentFinalized(uint256 loanId, address borrower, address payer, uint256 amount, uint256 interestAmount);

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
     * @notice Accept a loan offer and withdraw funds
     * @dev Caller must be the loan desk.
     *      Loan funds must not have been released before.
     * @param loanId ID of the loan application to accept the offer of
     */
    function onBorrow(uint256 loanId, address borrower, uint256 amount, uint16 apr) external;

    function onRepay(
        uint256 loanId, 
        address borrower, 
        address payer, 
        uint16 apr,
        uint256 transferAmount, 
        uint256 paymentAmount, 
        uint256 interestPayable
    ) external;

    function onCloseLoan(
        uint256 loanId,
        uint16 apr,
        uint256 amountRepaid, 
        uint256 remainingDifference
    )
     external
     returns (uint256);

    function onDefault(
        uint256 loanId,
        uint16 apr,
        uint256 carryAmountUsed,
        uint256 loss
    )
     external 
     returns (uint256, uint256);

    /**
     * @dev Hook for checking if the lending pool can provide liquidity for the total offered loans amount.
     * @param totalOfferedAmount Total sum of offered loan amount including outstanding offers
     * @return True if the pool has sufficient lending liquidity, false otherwise.
     */
    function canOffer(uint256 totalOfferedAmount) external view returns (bool);
}
