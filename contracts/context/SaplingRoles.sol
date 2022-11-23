// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

library SaplingRoles {
    
    bytes32 public constant DEFAULT_ADMIN_ROLE = 0x00;

    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");

    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");

    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
}