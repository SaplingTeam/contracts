# Solidity API

## ITokenFactory

_Interface defining the inter-contract methods of a token factory._

### create

```solidity
function create(string name, string symbol, uint8 decimals) external returns (address)
```

Deploys a new instance of PoolToken.

_Caller must be the owner._

| Name | Type | Description |
| ---- | ---- | ----------- |
| name | string | Token name |
| symbol | string | Token symbol |
| decimals | uint8 | Token decimals |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | Address of the deployed contract |

