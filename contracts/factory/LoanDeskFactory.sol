// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "./FactoryBase.sol";
import "./ILogicFactory.sol";
import "../LoanDesk.sol";

/**
 * @title LoanDesk Factory
 * @notice Facilitates on-chain deployment of new LoanDesk contracts.
 */
contract LoanDeskFactory is ILogicFactory, FactoryBase {

    /// Event for when a new LoanDesk is deployed
    event LoanDeskCreated(address pool);

    /**
     * @notice Deploys a new logic instance of SaplingLendingPool.
     */
    function create() external onlyOwner returns (address) {
        LoanDesk logic = new LoanDesk();
        return address(logic);
    }
}
