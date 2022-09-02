// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @title Logic Factory Interface
 */
interface ILogicFactory {

    /**
     * @notice Deploy a new logic contract instance.
     * @dev Caller must be the owner.
     */
    function create() external returns (address);
}
