// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "./FactoryBase.sol";
import "./ILoanDeskFactory.sol";
import "../LoanDesk.sol";


/**
 * @title LoanDesk Factory
 * @notice Facilitates on-chain deployment of new LoanDesk contracts.
 */
contract LoanDeskFactory is ILoanDeskFactory, FactoryBase {

    /// Event for when a new LoanDesk is deployed
    event LoanDeskCreated(address pool);

    /**
     * @notice Deploys a new instance of LoanDesk.
     * @dev Lending pool contract must implement ILoanDeskOwner.
     *      Caller must be the owner.
     * @param pool LendingPool address
     * @param governance Governance address
     * @param treasury Treasury wallet address
     * @param manager Manager address
     * @param decimals Decimals of the tokens used in the pool
     * @return Address of the deployed contract
     */
    function create(
        address pool,
        address governance,
        address treasury,
        address manager,
        uint8 decimals
    )
        external
        onlyOwner
        returns (address)
    {
        LoanDesk desk = new LoanDesk(pool, governance, treasury, manager, decimals);
        emit LoanDeskCreated(address(desk));
        return address(desk);
    }
}
