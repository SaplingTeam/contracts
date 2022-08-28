// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

/**
 * @title Loan Desk Factory Interface
 * @dev Interface defining the inter-contract methods of a LoanDesk factory.
 */
interface ILoanDeskFactory {

    /**
     * @notice Deploys a new instance of LoanDesk.
     * @dev Lending pool contract must implement ILoanDeskOwner.
     *      Caller must be the owner.
     * @param pool LendingPool address
     * @param governance Governance address
     * @param protocol Protocol wallet address
     * @param manager Manager address
     * @param decimals Decimals of the tokens used in the pool
     * @return Address of the deployed contract
     */
    function create(address pool, address governance, address protocol, address manager, uint8 decimals) external returns (address);
}
