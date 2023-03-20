# Solidity API

## SaplingContext

Provides reference to protocol level access control, and basic pause
        functionality by extending OpenZeppelin's Pausable contract.

### accessControl

```solidity
address accessControl
```

Protocol access control

### onlyRole

```solidity
modifier onlyRole(bytes32 role)
```

Modifier to limit function access to a specific role

### __SaplingContext_init

```solidity
function __SaplingContext_init(address _accessControl) internal
```

Creates a new SaplingContext.

_Addresses must not be 0._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _accessControl | address | Protocol level access control contract address |

### pause

```solidity
function pause() external
```

Pause the contract.

_Only the functions using whenPaused and whenNotPaused modifiers will be affected by pause.
     Caller must have the PAUSER_ROLE._

### unpause

```solidity
function unpause() external
```

Unpause the contract.

_Only the functions using whenPaused and whenNotPaused modifiers will be affected by unpause.
     Caller must have the PAUSER_ROLE._

### isNonUserAddress

```solidity
function isNonUserAddress(address party) internal view virtual returns (bool)
```

Verify if an address has any non-user roles.

_When overriding, return "contract local verification result" AND super.isNonUserAddress(party)._

| Name | Type | Description |
| ---- | ---- | ----------- |
| party | address | Address to verify |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the address has any roles, false otherwise |

### hasRole

```solidity
function hasRole(bytes32 role, address party) internal view returns (bool)
```

Verify if an address has a specific role.

| Name | Type | Description |
| ---- | ---- | ----------- |
| role | bytes32 | Role to check against |
| party | address | Address to verify |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the address has the specified role, false otherwise |

### __gap

```solidity
uint256[49] __gap
```

_Slots reserved for future state variables_

