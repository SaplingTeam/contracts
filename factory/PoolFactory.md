# Solidity API

## PoolFactory

Facilitates on-chain deployment of new SaplingLendingPool contracts.

### logicFactory

```solidity
address logicFactory
```

### PoolCreated

```solidity
event PoolCreated(address pool)
```

Event for when a new LoanDesk is deployed

### constructor

```solidity
constructor(address _logicFactory) public
```

### create

```solidity
function create(address poolToken, address liquidityToken, address governance, address treasury, address manager) external returns (address, address, address)
```

Deploys a new instance of SaplingLendingPool.

_Pool token must implement IPoolToken.
     Caller must be the owner._

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolToken | address | LendingPool address |
| liquidityToken | address | Liquidity token address |
| governance | address | Governance address |
| treasury | address | Treasury wallet address |
| manager | address | Manager address |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | Addresses of the proxy, proxy admin, and the logic contract |
| [1] | address |  |
| [2] | address |  |

