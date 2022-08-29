# Solidity API

## PoolFactory

Facilitates on-chain deployment of new SaplingLendingPool contracts.

### PoolCreated

```solidity
event PoolCreated(address pool)
```

Event for when a new LoanDesk is deployed

### create

```solidity
function create(address poolToken, address liquidityToken, address governance, address protocol, address manager) external returns (address)
```

Deploys a new instance of SaplingLendingPool.

_Pool token must implement IPoolToken.
     Caller must be the owner._

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolToken | address | LendingPool address |
| liquidityToken | address | Liquidity token address |
| governance | address | Governance address |
| protocol | address | Protocol wallet address |
| manager | address | Manager address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | Address of the deployed contract |

