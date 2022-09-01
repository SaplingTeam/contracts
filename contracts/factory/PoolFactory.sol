// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "./FactoryBase.sol";
import "./ILogicFactory.sol";
import "../SaplingLendingPool.sol";


/**
 * @title Pool Factory
 * @notice Facilitates on-chain deployment of new SaplingLendingPool contracts.
 */
contract PoolFactory is ILogicFactory, FactoryBase {

    /**
     * @notice Deploys a new logic instance of SaplingLendingPool.
     */
    function create() external onlyOwner returns (address) {
        SaplingLendingPool logic = new SaplingLendingPool();
        return address(logic);
    }
}
