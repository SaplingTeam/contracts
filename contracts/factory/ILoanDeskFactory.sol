// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

interface ILoanDeskFactory {
    function create(address pool, address governance, address protocol, address manager, uint8 decimals) external returns (address);
}
