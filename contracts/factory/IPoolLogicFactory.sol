// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @title Pool Logic Factory Interface
 * @dev Interface defining the inter-contract methods of a lending pool factory.
 */
interface IPoolLogicFactory {

    /**
     * @notice Deploys a new instance of SaplingLendingPool.
     * @dev Pool token must implement IPoolToken.
     *      Caller must be the owner.
     */
    function create() external returns (address);
}
