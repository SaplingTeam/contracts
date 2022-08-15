// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

interface ILendingPoolHook {
    
    function canOffer(uint256 totalLoansAmount) external view returns (bool);

    function onOffer(uint256 amount) external;

    function onOfferUpdate(uint256 prevAmount, uint256 amount) external;
}