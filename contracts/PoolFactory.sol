// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import "./SaplingContext.sol";
import "./PoolToken.sol";
import "./SaplingPool.sol";

contract PoolFactory is SaplingContext {

    event PoolCreated(address pool);

    constructor(address _governance, address _protocol) SaplingContext(_governance, _protocol) {
    }

    function create(string memory name, string memory symbol, address manager, address liquidityToken) external onlyGovernance {
        PoolToken poolToken = new PoolToken(string.concat(name, " Token"), symbol, IERC20Metadata(liquidityToken).decimals());
        SaplingPool pool = new SaplingPool(address(poolToken), liquidityToken, governance, protocol, manager);

        address poolAddress = address(pool);
        poolToken.transferOwnership(poolAddress);

        emit PoolCreated(poolAddress);
    }
}
