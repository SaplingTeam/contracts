// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

interface IPoolFactory {
    function create(address poolToken, address liquidityToken, address governance, address protocol, address manager) external returns (address);
}
