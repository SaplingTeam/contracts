// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

interface ITokenFactory {
    function create(string memory name, string memory symbol, uint8 decimals) external returns (address);
}