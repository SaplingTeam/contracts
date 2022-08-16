// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./ILoanDeskFactory.sol";
import "../LoanDesk.sol";

contract LoanDeskFactory is ILoanDeskFactory, Ownable {

    event LoanDeskCreated(address pool);

    function create(address pool, address governance, address protocol, address manager, uint8 decimals) external onlyOwner returns (address) {
        LoanDesk desk = new LoanDesk(pool, governance, protocol, manager, 10**decimals);
        emit LoanDeskCreated(address(desk));
        return address(desk);
    }
}
