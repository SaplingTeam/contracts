// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./ITokenFactory.sol";
import "../PoolToken.sol";

/**
 * @title Token Factory
 * @notice Facilitates on-chain deployment of new PoolToken contracts.
 */
contract TokenFactory is ITokenFactory, Ownable {

    /// Event for when a new PoolToken is deployed
    event TokenCreated(address token);

    /**
     * @notice Deploys a new instance of PoolToken.
     * @dev Caller must be the owner.
     * @param name Token name
     * @param symbol Token symbol
     * @param decimals Token decimals
     * @return Address of the deployed contract
     */
    function create(string memory name, string memory symbol, uint8 decimals) external onlyOwner returns (address) {
        PoolToken token = new PoolToken(name, symbol, decimals);
        token.transferOwnership(msg.sender);
        emit TokenCreated(address(token));
        return address(token);
    }
}
