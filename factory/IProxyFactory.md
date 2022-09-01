# Solidity API

## IProxyFactory

### create

```solidity
function create(address logicFactory, bytes data) external returns (address, address)
```

Deploys a new instance of SaplingLendingPool.

_logicFactory must implement ILogicFactory.
     Caller must be the owner._

| Name | Type | Description |
| ---- | ---- | ----------- |
| logicFactory | address | New logic contract factory address |
| data | bytes | abi encoded data to be calling initialize on the logic contract with parameters when applicable |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | address of the proxy and address of the proxy admin |
| [1] | address |  |

