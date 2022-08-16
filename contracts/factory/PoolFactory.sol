// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IPoolFactory.sol";
import "../SaplingLendingPool.sol";

contract PoolFactory is IPoolFactory, Ownable {

    event PoolCreated(address pool);

    function create(
        address poolToken, 
        address liquidityToken, 
        address governance, 
        address protocol, 
        address manager
    )
        external 
        onlyOwner 
        returns (address)
    {
        SaplingLendingPool pool = new SaplingLendingPool(poolToken, liquidityToken, governance, protocol, manager);
        emit PoolCreated(address(pool));
        return address(pool);
    }
}
