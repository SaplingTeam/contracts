// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

interface ILender {
    
    function deposit(uint256 amount) external;

    function withdraw(uint256 amount) external;

    //TODO redeem

    function balanceOf(address wallet) external view returns (uint256);

    function projectedLenderAPY(uint16 strategyRate, uint256 _avgStrategyAPR) external view returns (uint16);
}