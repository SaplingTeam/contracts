// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "@openzeppelin/contracts/access/AccessControlEnumerable.sol";

contract CoreAccessControl is AccessControlEnumerable {

    using EnumerableSet for EnumerableSet.Bytes32Set;

    enum RoleType {
        UNDEFINED,
        CORE,
        CORE_UTILITY,
        LIMITED,
        LIMITED_UTILITY
    }

    struct RoleMetadata {
        bytes32 role;
        RoleType roleType;
        string name;
    }

    bytes32 internal constant NO_USE_RESERVED_ROLE = keccak256("DEFAULT_ADMIN_ROLE");

    EnumerableSet.Bytes32Set internal roles;

    mapping (bytes32 => RoleMetadata) internal roleMetadata;

    event RoleListed(bytes32 role, string name, RoleType roleType);
    event RoleTypeUpdated(bytes32 role, string name, RoleType prevRoleType, RoleType roleType);
    event RoleDelisted(bytes32 role, string name);

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);

        listRole("GOVERNANCE_ROLE", RoleType.CORE);
        listRole("TREASURY_ROLE", RoleType.CORE);
        listRole("PAUSER_ROLE", RoleType.CORE_UTILITY);
    }

    function setRoleAdmin(bytes32 role, bytes32 adminRole) external onlyRole(DEFAULT_ADMIN_ROLE) {
        _setRoleAdmin(role, adminRole);
    }

    function listRole(string memory _name, RoleType _type) public onlyRole(DEFAULT_ADMIN_ROLE) {
        bytes32 _role = keccak256(bytes(_name));
        require(NO_USE_RESERVED_ROLE != _role, "CoreAccessControl: role name is not available");
        require(!roles.contains(_role), "CoreAccessControl: role is already listed");

        roleMetadata[_role] = RoleMetadata({
            role: _role,
            roleType: _type,
            name: _name
        });
        roles.add(_role);

        emit RoleListed(_role, _name, _type);
    }

    function updateRoleType(string memory _name, RoleType _type) external onlyRole(DEFAULT_ADMIN_ROLE) {
        bytes32 _role = keccak256(bytes(_name));
        require(roles.contains(_role), "CoreAccessControl: role is not listed");

        RoleMetadata storage metadata = roleMetadata[_role];
        require(metadata.roleType != _type, "CoreAccessControl: role has the same type");

        RoleType prevRoleType = metadata.roleType;
        metadata.roleType = _type;

        emit RoleTypeUpdated(_role, _name, prevRoleType, metadata.roleType);
    }

    function delistRole(string memory _name) external onlyRole(DEFAULT_ADMIN_ROLE) {
        bytes32 _role = keccak256(bytes(_name));

        require(roles.contains(_role), "CoreAccessControl: role is not listed");

        roles.remove(_role);
        delete roleMetadata[_role];

        emit RoleDelisted(_role, _name);
    }

    function getRolesLength() external view returns (uint256) {
        return roles.length();
    }

    function getRoleAt(uint256 i) external view returns (bytes32) {
        require(i < roles.length(), "CoreAccessControl: index out of bounds");
        return roles.at(i);
    }

    function getRoleMetadataAt(uint256 i) external view returns (RoleMetadata memory) {
        require(i < roles.length(), "CoreAccessControl: index out of bounds");
        return roleMetadata[roles.at(i)];
    }

    function getRoleMetadataByName(string memory name) external view returns(RoleMetadata memory) {
        return getRoleMetadata(keccak256(bytes(name)));
    }

    function getRoleMetadata(bytes32 role) public view returns (RoleMetadata memory) {
        require(roles.contains(role), "CoreAccessControl: role is not listed");

        return roleMetadata[role];
    }
}
