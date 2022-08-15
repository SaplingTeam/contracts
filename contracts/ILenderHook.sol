// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

interface ILenderHook {
    
    function canOffer(uint256 totalLoansAmount) external view returns (bool);
}