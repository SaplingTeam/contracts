// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @title Proxy Factory Interface
 */
interface IProxyFactory {

    /**
     * @notice Deploys a new instance of SaplingLendingPool.
     * @dev logicFactory must implement ILogicFactory.
     *      Caller must be the owner.
     * @param logicFactory New logic contract factory address
     * @param data abi encoded data to be calling initialize on the logic contract with parameters when applicable
     * @return address of the proxy and address of the proxy admin
     */
    function create(address logicFactory, bytes memory data) external returns (address, address);
}
