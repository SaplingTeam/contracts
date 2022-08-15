# Solidity API

## SaplingManagerContext

### manager

```solidity
address manager
```

Pool manager address

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
        After this grace period of managers inaction on a given loan authorised parties
        can also call cancel() and default(). Other requirements for loan cancellation/default still apply.

### onlyManager

```solidity
modifier onlyManager()
```

### managerOrApprovedOnInactive

```solidity
modifier managerOrApprovedOnInactive()
```

### onlyUser

```solidity
modifier onlyUser()
```

### Closed

```solidity
event Closed(address account)
```

### Opened

```solidity
event Opened(address account)
```

### whenNotClosed

```solidity
modifier whenNotClosed()
```

### whenClosed

```solidity
modifier whenClosed()
```

### constructor

```solidity
constructor(address _manager, address _governance, address _protocol) internal
```

Create a managed lending pool.

_msg.sender will be assigned as the manager of the created pool._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _manager | address | Address of the pool manager |
| _governance | address | Address of the protocol governance. |
| _protocol | address | Address of a wallet to accumulate protocol earnings. |

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

### canClose

```solidity
function canClose() internal view virtual returns (bool)
```

### authorizedOnInactiveManager

```solidity
function authorizedOnInactiveManager(address caller) internal view virtual returns (bool)
```

