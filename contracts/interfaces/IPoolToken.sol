// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title PoolToken Interface
 * @notice Defines the hooks for the lending pool.
 */
interface IPoolToken is IERC20 {

    /**
     * @notice Mint tokens.
     * @dev Hook for the lending pool for mining tokens upon pool entry operations.
     *      Caller must be the lending pool that owns this token.
     * @param to Address the tokens are minted for
     * @param amount The amount of tokens to mint
     */
    function mint(address to, uint256 amount) external;

    /**
     * @notice Burn tokens.
     * @dev Hook for the lending pool for burning tokens upon pool exit or stake loss operations.
     *      Caller must be the lending pool that owns this token.
     * @param from Address the tokens are burned from
     * @param amount The amount of tokens to burn
     */
    function burn(address from, uint256 amount) external;
}
