# Solidity API

## IPoolLogicFactory

_Interface defining the inter-contract methods of a lending pool factory._

### create

```solidity
function create() external returns (address)
```

Deploys a new instance of SaplingLendingPool.

_Pool token must implement IPoolToken.
     Caller must be the owner._

