// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

/**
 * @title Token Factory Interface
 * @dev Interface defining the inter-contract methods of a token factory.
 */
interface ITokenFactory {

    /**
     * @notice Deploys a new instance of PoolToken.
     * @dev Caller must be the owner.
     * @param name Token name
     * @param symbol Token symbol
     * @param decimals Token decimals
     * @return Address of the deployed contract
     */
    function create(string memory name, string memory symbol, uint8 decimals) external returns (address);
}