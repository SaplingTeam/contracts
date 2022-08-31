# Solidity API

## SaplingManagerContext

Provides manager access control, and a basic close functionality.

### manager

```solidity
address manager
```

Manager address

### _closed

```solidity
bool _closed
```

Flag indicating whether or not the pool is closed

### MANAGER_INACTIVITY_GRACE_PERIOD

```solidity
uint256 MANAGER_INACTIVITY_GRACE_PERIOD
```

Grace period for the manager to be inactive on a given loan /cancel/default decision.
        After this grace period of managers inaction on a given loan authorized parties
        can also call cancel() and default(). Other requirements for loan cancellation/default still apply.

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

### onlyManager

```solidity
modifier onlyManager()
```

A modifier to limit access only to the manager

### managerOrApprovedOnInactive

```solidity
modifier managerOrApprovedOnInactive()
```

A modifier to limit access to the manager or to other applicable parties when the manager is considered inactive

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

### constructor

```solidity
constructor(address _governance, address _protocol, address _manager) internal
```

Create a new SaplingManagedContext.

_Addresses must not be 0._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _governance | address | Governance address |
| _protocol | address | Protocol wallet address |
| _manager | address | Manager address |

### close

```solidity
function close() external
```

Close the pool and stop borrowing, lender deposits, and staking.

_Caller must be the manager.
     Pool must be open.
     No loans or approvals must be outstanding (borrowedFunds must equal to 0).
     Emits 'PoolClosed' event._

### open

```solidity
function open() external
```

Open the pool for normal operations.

_Caller must be the manager.
     Pool must be closed.
     Opening the pool will not unpause any pauses in effect.
     Emits 'PoolOpened' event._

### closed

```solidity
function closed() public view returns (bool)
```

Indicates whether or not the contract is closed.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the contract is closed, false otherwise. |

### canClose

```solidity
function canClose() internal view virtual returns (bool)
```

Indicates whether or not the contract can be closed in it's current state.

_A hook for the extending contract to implement._

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the contract is closed, false otherwise. |

### authorizedOnInactiveManager

```solidity
function authorizedOnInactiveManager(address caller) internal view virtual returns (bool)
```

Indicates whether or not the the caller is authorized to take applicable managing actions when the
        manager is inactive.

_A hook for the extending contract to implement._

| Name | Type | Description |
| ---- | ---- | ----------- |
| caller | address | Caller's address. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the caller is authorized at this time, false otherwise. |

