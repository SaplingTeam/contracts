# Solidity API

## SaplingStakerContextTester

_Exposes selected internal functions and/or modifiers for direct calling for testing purposes._

### value

```solidity
uint256 value
```

### ValueChanged

```solidity
event ValueChanged(uint256 prevValue, uint256 newValue)
```

### initialize

```solidity
function initialize(address _accessControl, address _stakerAddress) public
```

_Initializer_

| Name | Type | Description |
| ---- | ---- | ----------- |
| _accessControl | address | Access control contract |
| _stakerAddress | address | Staker address |

### isNonUserAddressWrapper

```solidity
function isNonUserAddressWrapper(address party) external view returns (bool)
```

_Wrapper for an internal function_

### canCloseWrapper

```solidity
function canCloseWrapper() external view returns (bool)
```

_Wrapper for an internal function_

### canOpenWrapper

```solidity
function canOpenWrapper() external view returns (bool)
```

_Wrapper for an internal function_

### someOnlyUserFunction

```solidity
function someOnlyUserFunction(uint256 newValue) external
```

_A state changing function with onlyUser modifier_

