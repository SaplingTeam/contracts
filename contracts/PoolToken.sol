// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./interfaces/IPoolToken.sol";

/**
 * @title Sapling Pool Token
 * @notice Ownership of the token represents the lender shares in the respective pools.
 */
contract PoolToken is IPoolToken, ERC20, Ownable {

    uint8 immutable _decimals;
    
    /**
     * @notice Creates a new PoolToken.
     * @param name Token name
     * @param symbol Token symbol
     * @param tokenDecimals The number of decimal digits used to represent the fractional part of the token values.
     */
    constructor(string memory name, string memory symbol, uint8 tokenDecimals) ERC20(name, symbol) {
        _decimals = tokenDecimals;
    }

    /**
     * @notice Mint tokens.
     * @dev Hook for the lending pool for mining tokens upon pool entry operations. 
     *      Caller must be the lending pool that owns this token.
     * @param to Address the tokens are minted for
     * @param amount The amount of tokens to minte
     */
    function mint(address to, uint256 amount) external override onlyOwner {
        _mint(to, amount);
    }

    /**
     * @notice Burn tokens.
     * @dev Hook for the lending pool for burning tokens upon pool exit or stake loss operations. 
     *      Caller must be the lending pool that owns this token.
     * @param from Address the tokens are burned from
     * @param amount The amount of tokens to burn
     */
    function burn(address from, uint256 amount) external override onlyOwner {
        _burn(from, amount);
    }

    /**
     * @notice Accessor for token decimals.
     * @return The number of decimal digits used to represent the fractional part of the token values.
     */
    function decimals() public view override returns (uint8) {
        return _decimals;
    }
}
