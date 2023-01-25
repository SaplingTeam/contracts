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
function initialize(address _accessControl, bytes32 _stakerRole) public
```

_Initializer_

| Name | Type | Description |
| ---- | ---- | ----------- |
| _accessControl | address | Access control contract |
| _stakerRole | bytes32 | Staker role |

### isNonUserAddressWrapper

```solidity
function isNonUserAddressWrapper(address party) external view returns (bool)
```

_Wrapper for an internal function_

### someOnlyUserFunction

```solidity
function someOnlyUserFunction(uint256 newValue) external
```

_A state changing function with onlyUser modifier_

