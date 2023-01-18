# Solidity API

## PoolToken

Ownership of the token represents the lender shares in the respective pools.

### _decimals

```solidity
uint8 _decimals
```

### constructor

```solidity
constructor(string name, string symbol, uint8 tokenDecimals) public
```

Creates a new PoolToken.

| Name | Type | Description |
| ---- | ---- | ----------- |
| name | string | Token name |
| symbol | string | Token symbol |
| tokenDecimals | uint8 | The number of decimal digits used to represent the fractional part of the token values. |

### mint

```solidity
function mint(address to, uint256 amount) external
```

Mint tokens.

_Hook for the lending pool for mining tokens upon pool entry operations.
     Caller must be the lending pool that owns this token._

| Name | Type | Description |
| ---- | ---- | ----------- |
| to | address | Address the tokens are minted for |
| amount | uint256 | The amount of tokens to minte |

### burn

```solidity
function burn(address from, uint256 amount) external
```

Burn tokens.

_Hook for the lending pool for burning tokens upon pool exit or stake loss operations.
     Caller must be the lending pool that owns this token._

| Name | Type | Description |
| ---- | ---- | ----------- |
| from | address | Address the tokens are burned from |
| amount | uint256 | The amount of tokens to burn |

### decimals

```solidity
function decimals() public view returns (uint8)
```

Accessor for token decimals.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint8 | The number of decimal digits used to represent the fractional part of the token values. |

### _afterTokenTransfer

```solidity
function _afterTokenTransfer(address from, address to, uint256 amount) internal
```

### _mint

```solidity
function _mint(address to, uint256 amount) internal
```

### _burn

```solidity
function _burn(address account, uint256 amount) internal
```

