# Solidity API

## IPoolToken

Defines the hooks for the lending pool.

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
| amount | uint256 | The amount of tokens to mint |

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

