// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "./FactoryBase.sol";
import "./IProxyFactory.sol";

/**
 * @title Transparent Proxy Factory
 */
contract TransparentProxyFactory is IProxyFactory, FactoryBase {

    /**
     * @notice Deploys a the logic contract using a TransparentUpgradeableProxy.
     * @dev logicFactory must implement ILogicFactory.
     *      Caller must be the owner.
     * @param logic New logic contract address
     * @param data abi encoded data to be calling initialize on the logic contract with parameters when applicable
     * @return address of the proxy and address of the proxy admin
     */
    function create(address logic, bytes memory data) external onlyOwner returns (address, address) {
        ProxyAdmin admin = new ProxyAdmin();
        TransparentUpgradeableProxy proxy = new TransparentUpgradeableProxy(logic, address(admin), data);

        admin.transferOwnership(msg.sender);

        return (address(proxy), address(admin));
    }
}
