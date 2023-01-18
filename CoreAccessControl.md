# Solidity API

## CoreAccessControl

Extends OpenZeppelin's enumerable access control.

_AccessControlEnumerable is used as is, except for making the DEFAULT_ADMIN_ROLE a super admin role
     by giving it the ability to set role admins for other roles even when these roles have custom admin roles set. 
     
     Note that this behavior is partially present by design in AccessControlEnumerable, as the DEFAULT_ADMIN_ROLE is 
     the role admin of any role unless given up.

     This contract is non-upgradable. Instead, new versions should be migrated to by setting a new access control 
     contract address across the protocol contracts, and copying the role assignments over to the new AC contract._

### constructor

```solidity
constructor() public
```

Constructor.

_Grants DEFAULT_ADMIN_ROLE to the deployer. Lists the core protocol roles. 
     
     After contract deployment: It is recommended that the deployer grants DEFAULT_ADMIN_ROLE 
     to a secure protocol governance address, and renounces the DEFAULT_ADMIN_ROLE itself._

### setRoleAdmin

```solidity
function setRoleAdmin(bytes32 role, bytes32 adminRole) external
```

Sets a role admin for a specific role.

_Caller must have the DEFAULT_ADMIN_ROLE._

| Name | Type | Description |
| ---- | ---- | ----------- |
| role | bytes32 | Role value to set the admin of |
| adminRole | bytes32 | new admin role of the 'role' |

