# Solidity API

## SaplingStakerContext

Provides staker access control, and a basic close functionality.

_Close functionality is implemented in the same fashion as Openzeppelin's Pausable._

### staker

```solidity
address staker
```

Staker address

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

### StakerSet

```solidity
event StakerSet(address prevAddress, address newAddress)
```

Event for when a new staker is set

### onlyStaker

```solidity
modifier onlyStaker()
```

A modifier to limit access only to the staker

### onlyUser

```solidity
modifier onlyUser()
```

A modifier to limit access only to users without roles

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

### __SaplingStakerContext_init

```solidity
function __SaplingStakerContext_init(address _accessControl, address _stakerAddress) internal
```

Create a new SaplingStakerContext.

_Addresses must not be 0._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _accessControl | address | Access control contract address |
| _stakerAddress | address | Staker address |

### setStaker

```solidity
function setStaker(address _staker) external
```

Designates a new staker for the pool.

_Caller must be the governance. There can only be one staker in the pool.
     Staked funds remain staked in the pool and will be owned by the new staker._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _staker | address | New staker address |

### close

```solidity
function close() external
```

Close the pool.

_Only the functions using whenClosed and whenNotClosed modifiers will be affected by close.
     Caller must have the staker role. Pool must be open.

     Staker must have access to close function as the ability to unstake and withdraw all staked funds is
     only guaranteed when the pool is closed and all outstanding loans resolved._

### open

```solidity
function open() external
```

Open the pool for normal operations.

_Only the functions using whenClosed and whenNotClosed modifiers will be affected by open.
     Caller must have the staker role. Pool must be closed._

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
uint256[49] __gap
```

_Slots reserved for future state variables_

