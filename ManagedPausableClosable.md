# Solidity API

## ManagedPausableClosable

Provides management access control, lending pause and close functionality.

_This contract is abstract. Extend the contract and override virtual methods._

### manager

```solidity
address manager
```

Pool manager address

### isClosed

```solidity
bool isClosed
```

Flag indicating whether or not the pool is closed

### isLendingPaused

```solidity
bool isLendingPaused
```

Flag indicating whether or not lending is paused

### LendingPaused

```solidity
event LendingPaused()
```

### LendingResumed

```solidity
event LendingResumed()
```

### PoolClosed

```solidity
event PoolClosed()
```

### PoolOpened

```solidity
event PoolOpened()
```

### onlyManager

```solidity
modifier onlyManager()
```

### managerOrApprovedOnInactive

```solidity
modifier managerOrApprovedOnInactive()
```

### whenNotClosed

```solidity
modifier whenNotClosed()
```

### whenClosed

```solidity
modifier whenClosed()
```

### whenLendingNotPaused

```solidity
modifier whenLendingNotPaused()
```

### whenLendingPaused

```solidity
modifier whenLendingPaused()
```

### constructor

```solidity
constructor(address _manager) internal
```

Create a managed lending pool.

_msg.sender will be assigned as the manager of the created pool._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _manager | address | Address of the pool manager |

### close

```solidity
function close() external
```

Close the pool and stop borrowing, lender deposits, and staking.

_Caller must be the manager. 
     Pool must be open.
     No loans or approvals must be outstanding (borrowedFunds must equal to 0).
     Emits &#x27;PoolClosed&#x27; event._

### open

```solidity
function open() external
```

Open the pool for normal operations.

_Caller must be the manager. 
     Pool must be closed.
     Opening the pool will not unpause any pauses in effect.
     Emits &#x27;PoolOpened&#x27; event._

### pauseLending

```solidity
function pauseLending() external
```

Pause new loan requests, approvals, and unstaking.

_Caller must be the manager.
     Lending must not be paused.
     Lending can be paused regardless of the pool open/close and governance pause states, 
     but some of the states may have a higher priority making pausing irrelevant.
     Emits &#x27;LendingPaused&#x27; event._

### resumeLending

```solidity
function resumeLending() external
```

Resume new loan requests, approvals, and unstaking.

_Caller must be the manager.
     Lending must be paused.
     Lending can be resumed regardless of the pool open/close and governance pause states, 
     but some of the states may have a higher priority making resuming irrelevant.
     Emits &#x27;LendingPaused&#x27; event._

### canClose

```solidity
function canClose() internal view virtual returns (bool)
```

### authorizedOnInactiveManager

```solidity
function authorizedOnInactiveManager(address caller) internal view virtual returns (bool)
```

