// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";

/**
 * @title Sapling core access control  
 * @notice Extends OpenZeppelin's enumerable access control.
 * @dev AccessControlEnumerable is used as is, except for making the DEFAULT_ADMIN_ROLE a super admin role
 *      by giving it the ability to set role admins for other roles even when these roles have custom admin roles set. 
 *      
 *      Note that this behavior is partially present by design in AccessControlEnumerable, as the DEFAULT_ADMIN_ROLE is 
 *      the role admin of any role unless given up.
 *
 *      This contract is non-upgradable. Instead, new versions should be migrated to by setting a new access control 
 *      contract address across the protocol contracts, and copying the role assignments over to the new AC contract.
 */
contract CoreAccessControl is AccessControlEnumerable {

    /**
     * @notice Constructor.
     * @dev Grants DEFAULT_ADMIN_ROLE to the deployer. Lists the core protocol roles. 
     *      
     *      After contract deployment: It is recommended that the deployer grants DEFAULT_ADMIN_ROLE 
     *      to a secure protocol governance address, and renounces the DEFAULT_ADMIN_ROLE itself. 
     */
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }
    
    /**
     * @notice Sets a role admin for a specific role.
     * @dev Caller must have the DEFAULT_ADMIN_ROLE.
     * @param role Role value to set the admin of
     * @param adminRole new admin role of the 'role'
     */
    function setRoleAdmin(bytes32 role, bytes32 adminRole) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setRoleAdmin(role, adminRole);
    }
}
