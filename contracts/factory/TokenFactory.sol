// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./ITokenFactory.sol";
import "../PoolToken.sol";

contract TokenFactory is ITokenFactory, Ownable {

    event TokenCreated(address token);

    function create(string memory name, string memory symbol, uint8 decimals) external onlyOwner returns (address) {
        PoolToken token = new PoolToken(name, symbol, decimals);
        token.transferOwnership(msg.sender);
        emit TokenCreated(address(token));
        return address(token);
    }
}
