// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @title LendingPool Interface
 * @dev This interface has all LendingPool events, structs, and LoanDesk function hooks.
 */
interface ILendingPool {

    /// Event for when a new loan desk is set
    event LoanDeskSet(address prevAddress, address newAddress);

    /// Event whn loan funds are released after accepting a loan offer
    event LoanFundsReleased(uint256 loanId, address indexed borrower, uint256 amount);

    /// Event for when a loan is defaulted
    event LoanDefaulted(uint256 loanId, address indexed borrower, uint256 stakerLoss, uint256 lenderLoss);

    /// Event for when a liquidity is allocated for a loan offer
    event OfferLiquidityAllocated(uint256 amount);

    /// Event for when the liquidity is adjusted for a loan offer
    event OfferLiquidityUpdated(uint256 prevAmount, uint256 newAmount);

    /// Event for when a loan repayments are made
    event LoanRepaymentProcessed(
        uint256 loanId, 
        address borrower, 
        address payer, 
        uint256 amount, 
        uint256 interestAmount
    );

    /**
     * @dev Hook for a new loan offer.
     *      Caller must be the LoanDesk.
     * @param amount Loan offer amount.
     */
    function onOffer(uint256 amount) external;

    /**
     * @dev Hook for a loan offfer amount update.
     * @param prevAmount The original, now previous, offer amount.
     * @param amount New offer amount. Cancelled offer must register an amount of 0 (zero).
     */
    function onOfferUpdate(uint256 prevAmount, uint256 amount) external;

    /**
     * @dev Hook for borrowing a loan. Caller must be the loan desk.
     *
     *      Parameters besides the loanId exists simply to avoid rereading it from the caller via additinal inter 
     *      contract call. Avoiding loop call reduces gas, contract bytecode size, and reduces the risk of reentrancy.
     *
     * @param loanId ID of the loan being borrowed
     * @param borrower Wallet address of the borrower, same as loan.borrower
     * @param amount Loan principal amount, same as loan.amount
     * @param apr Loan annual percentage rate, same as loan.apr
     */
    function onBorrow(uint256 loanId, address borrower, uint256 amount, uint16 apr) external;

     /**
     * @dev Hook for repayments. Caller must be the LoanDesk. 
     *      
     *      Parameters besides the loanId exists simply to avoid rereading it from the caller via additional inter 
     *      contract call. Avoiding loop call reduces gas, contract bytecode size, and reduces the risk of reentrancy.
     *
     * @param loanId ID of the loan which has just been borrowed
     * @param borrower Borrower address
     * @param payer Actual payer address
     * @param apr Loan apr
     * @param transferAmount Amount chargeable
     * @param paymentAmount Logical payment amount, may be different to the transfer amount due to a payment carry
     * @param interestPayable Amount of interest paid, this value is already included in the payment amount
     */
    function onRepay(
        uint256 loanId, 
        address borrower,
        address payer, 
        uint16 apr,
        uint256 transferAmount, 
        uint256 paymentAmount, 
        uint256 interestPayable
    ) external;

    /**
     * @dev Hook for defaulting a loan. Caller must be the LoanDesk. Defaulting a loan will cover the loss using 
     * the staked funds. If these funds are not sufficient, the lenders will share the loss.
     * @param loanId ID of the loan to default
     * @param apr Loan apr
     * @param carryAmountUsed Amount of payment carry repaid 
     * @param loss Loss amount to resolve
     */
    function onDefault(
        uint256 loanId,
        uint16 apr,
        uint256 carryAmountUsed,
        uint256 loss
    )
     external 
     returns (uint256, uint256);

    /**
     * @notice View indicating whether or not a given loan can be offered by the staker.
     * @dev Hook for checking if the lending pool can provide liquidity for the total offered loans amount.
     * @param totalOfferedAmount Total sum of offered loan amount including outstanding offers
     * @return True if the pool has sufficient lending liquidity, false otherwise
     */
    function canOffer(uint256 totalOfferedAmount) external view returns (bool);
}
