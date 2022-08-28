# Solidity API

## TokenFactory

Facilitates on-chain deployment of new PoolToken contracts.

### TokenCreated

```solidity
event TokenCreated(address token)
```

Event for when a new PoolToken is deployed

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

