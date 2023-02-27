// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @title LendingPool Interface
 * @dev This interface has all LendingPool events, structs, and LoanDesk function hooks.
 */
interface ILendingPool {

    /// Event for when a new loan desk is set
    event LoanDeskSet(address prevAddress, address newAddress);

    /// Setter event
    event TreasurySet(address prevAddress, address newAddress);

    /// Event for when the protocol revenue is collected
    event ProtocolRevenue(address treasury, uint256 amount);

    /// Event for when a loan is defaulted
    event LoanDefaulted(uint256 loanId, address indexed borrower, uint256 stakerLoss, uint256 lenderLoss);

    /// Event for when a liquidity is allocated for a loan offer
    event OfferLiquidityAllocated(uint256 amount);

    /// Event for when the liquidity is removed from a loan offer
    event OfferLiquidityDeallocated(uint256 amount);

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
     * @param amount Amount to be allocated for loan offers.
     */
    function onOfferAllocate(uint256 amount) external;

    /**
     * @dev Hook for a loan offer amount update.
     * @param amount Previously allocated amount being returned.
     */
    function onOfferDeallocate(uint256 amount) external;

     /**
     * @dev Hook for repayments. Caller must be the LoanDesk. 
     *      
     *      Parameters besides the loanId exists simply to avoid rereading it from the caller via additional inter 
     *      contract call. Avoiding loop call reduces gas, contract bytecode size, and reduces the risk of reentrancy.
     *
     * @param loanId ID of the loan which has just been borrowed
     * @param borrower Borrower address
     * @param payer Actual payer address
     * @param transferAmount Amount chargeable
     * @param interestPayable Amount of interest paid, this value is already included in the payment amount
     */
    function onRepay(
        uint256 loanId, 
        address borrower,
        address payer,
        uint256 transferAmount,
        uint256 interestPayable
    ) external;

    /**
     * @dev Hook for defaulting a loan. Caller must be the LoanDesk. Defaulting a loan will cover the loss using 
     * the staked funds. If these funds are not sufficient, the lenders will share the loss.
     * @param loanId ID of the loan to default
     * @param principalLoss Unpaid principal amount to resolve
     * @param yieldLoss Unpaid yield amount to resolve
     */
    function onDefault(
        uint256 loanId,
        uint256 principalLoss,
        uint256 yieldLoss
    )
     external 
     returns (uint256, uint256);

    /**
     * @notice View indicating whether or not a given loan can be offered by the staker.
     * @dev Hook for checking if the lending pool can provide liquidity for the total offered loans amount.
     * @param amount Amount to check for new loan allocation
     * @return True if the pool has sufficient lending liquidity, false otherwise
     */
    function canOffer(uint256 amount) external view returns (bool);
}
