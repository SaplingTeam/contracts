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
 *      Other implemented functionality in this contract is for metadata purposes only, and is entirely optional 
 *      but helpful as on-chain source of declared roles. 
 *
 *      This contract is non-upgradable. Instead, new versions should be migrated to by setting a new access control 
 *      contract address across the protocol contracts, and copying the role assignments over to the new AC contract.
 */
contract CoreAccessControl is AccessControlEnumerable {

    using EnumerableSet for EnumerableSet.Bytes32Set;

    /// Event for when a role metadata is listed
    event RoleListed(bytes32 role, string name, RoleType roleType);

    /// Event for when a role type is updated
    event RoleTypeUpdated(bytes32 role, string name, RoleType prevRoleType, RoleType roleType);

    /// Event for when a role metadata is unlisted
    event RoleDelisted(bytes32 role, string name);

    /// Role type
    enum RoleType {
        UNDEFINED,
        CORE,
        CORE_UTILITY,
        LIMITED,
        LIMITED_UTILITY
    }

    /// Role metadata object
    struct RoleMetadata {

        /// Role value, keccak256 digest of the role name
        bytes32 role;

        /// Role type
        RoleType roleType;

        /// Role name
        string name;
    }

    /// Role excluded from metadata. It has the same name as the DEFAULT_ADMIN_ROLE constant but has a different value.
    bytes32 internal constant NO_USE_ROLE = keccak256("DEFAULT_ADMIN_ROLE");

    /// Set of listed roles
    EnumerableSet.Bytes32Set internal roles;

    /// Map of role metadata
    mapping (bytes32 => RoleMetadata) internal roleMetadata;
    
    /**
     * @notice Constructor.
     * @dev Grants DEFAULT_ADMIN_ROLE to the deployer. Lists the core protocol roles. 
     *      
     *      After contract deployment: It is recommended that the deployer grants DEFAULT_ADMIN_ROLE 
     *      to a secure protocol governance address, and renounces the DEFAULT_ADMIN_ROLE itself. 
     */
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        listRole("GOVERNANCE_ROLE", RoleType.CORE);
        listRole("TREASURY_ROLE", RoleType.CORE);
        listRole("PAUSER_ROLE", RoleType.CORE_UTILITY);
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

    /**
     * @notice Lists a role
     * @dev Role name cannot be "DEFAULT_ADMIN_ROLE"
     * @param _name Role name
     * @param _type Role type
     */
    function listRole(string memory _name, RoleType _type) public onlyRole(DEFAULT_ADMIN_ROLE) {
        bytes32 _role = keccak256(bytes(_name));
        require(NO_USE_ROLE != _role, "CoreAccessControl: role name is not available");
        require(!roles.contains(_role), "CoreAccessControl: role is already listed");

        roleMetadata[_role] = RoleMetadata({
            role: _role,
            roleType: _type,
            name: _name
        });
        roles.add(_role);

        emit RoleListed(_role, _name, _type);
    }

    /**
     * @notice Updates role type
     * @param _name Role name
     * @param _type Role type
     */
    function updateRoleType(string memory _name, RoleType _type) external onlyRole(DEFAULT_ADMIN_ROLE) {
        bytes32 _role = keccak256(bytes(_name));
        require(roles.contains(_role), "CoreAccessControl: role is not listed");

        RoleMetadata storage metadata = roleMetadata[_role];
        require(metadata.roleType != _type, "CoreAccessControl: role has the same type");

        RoleType prevRoleType = metadata.roleType;
        metadata.roleType = _type;

        emit RoleTypeUpdated(_role, _name, prevRoleType, metadata.roleType);
    }

    /**
     * @notice Removes role metadata
     * @param _name Role name
     */
    function delistRole(string memory _name) external onlyRole(DEFAULT_ADMIN_ROLE) {
        bytes32 _role = keccak256(bytes(_name));

        require(roles.contains(_role), "CoreAccessControl: role is not listed");

        roles.remove(_role);
        delete roleMetadata[_role];

        emit RoleDelisted(_role, _name);
    }

    /**
     * @notice Accessor
     * @return Length of listed roles
     */
    function getRolesLength() external view returns (uint256) {
        return roles.length();
    }

    /**
     * @notice Accessor
     * @param i role index
     * @return Role value
     */
    function getRoleAt(uint256 i) external view returns (bytes32) {
        require(i < roles.length(), "CoreAccessControl: index out of bounds");
        //FIXME Set does not guarantee list order inter transactions
        return roles.at(i);
    }

    /**
     * @notice Accessor
     * @param i role index
     * @return Role metadata
     */
    function getRoleMetadataAt(uint256 i) external view returns (RoleMetadata memory) { 
        require(i < roles.length(), "CoreAccessControl: index out of bounds");
        //FIXME Set does not guarantee list order inter transactions
        return roleMetadata[roles.at(i)];
    }

    /**
     * @notice Accessor
     * @param name role name
     * @return Role metadata
     */
    function getRoleMetadataByName(string memory name) external view returns(RoleMetadata memory) {
        return getRoleMetadata(keccak256(bytes(name)));
    }

    /**
     * @notice Accessor
     * @param role Role value, same as keccack256 digest of the role name
     * @return Role metadata
     */
    function getRoleMetadata(bytes32 role) public view returns (RoleMetadata memory) {
        require(roles.contains(role), "CoreAccessControl: role is not listed");

        return roleMetadata[role];
    }
}
