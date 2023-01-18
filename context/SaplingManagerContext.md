# Solidity API

## SaplingManagerContext

Provides manager access control, and a basic close functionality.

_Close functionality is implemented in the same fashion as Openzeppelin's Pausable._

### poolManagerRole

```solidity
bytes32 poolManagerRole
```

Pool manager role

_The value of this role should be unique for each pool. Role must be created before the pool contract 
     deployment, then passed during construction/initialization._

### _closed

```solidity
bool _closed
```

Flag indicating whether or not the pool is closed

### Closed

```solidity
event Closed(address account)
```

Event for when the contract is closed

### Opened

```solidity
event Opened(address account)
```

Event for when the contract is reopened

### onlyUser

```solidity
modifier onlyUser()
```

A modifier to limit access only to non-management users

### whenNotClosed

```solidity
modifier whenNotClosed()
```

Modifier to limit function access to when the contract is not closed

### whenClosed

```solidity
modifier whenClosed()
```

Modifier to limit function access to when the contract is closed

### __SaplingManagerContext_init

```solidity
function __SaplingManagerContext_init(address _accessControl, bytes32 _managerRole) internal
```

Create a new SaplingManagedContext.

_Addresses must not be 0._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _accessControl | address | Access control contract address |
| _managerRole | bytes32 | Manager role |

### close

```solidity
function close() external
```

Close the pool.

_Only the functions using whenClosed and whenNotClosed modifiers will be affected by close.
     Caller must have the pool manager role. Pool must be open.

     Manager must have access to close function as the ability to unstake and withdraw all manager funds is 
     only guaranteed when the pool is closed and all outstanding loans resolved._

### open

```solidity
function open() external
```

Open the pool for normal operations.

_Only the functions using whenClosed and whenNotClosed modifiers will be affected by open.
     Caller must have the pool manager role. Pool must be closed._

### closed

```solidity
function closed() public view returns (bool)
```

Indicates whether or not the contract is closed.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the contract is closed, false otherwise. |

### isNonUserAddress

```solidity
function isNonUserAddress(address party) internal view returns (bool)
```

Verify if an address has any non-user/management roles

_Overrides the same function in SaplingContext_

| Name | Type | Description |
| ---- | ---- | ----------- |
| party | address | Address to verify |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the address has any roles, false otherwise |

### canClose

```solidity
function canClose() internal view virtual returns (bool)
```

Indicates whether or not the contract can be closed in it's current state.

_A hook for the extending contract to implement._

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the conditions of the closure are met, false otherwise. |

### canOpen

```solidity
function canOpen() internal view virtual returns (bool)
```

Indicates whether or not the contract can be opened in it's current state.

_A hook for the extending contract to implement._

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the conditions to open are met, false otherwise. |

### __gap

```solidity
uint256[48] __gap
```

_Slots reserved for future state variables_

