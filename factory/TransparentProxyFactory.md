# Solidity API

## TransparentProxyFactory

### create

```solidity
function create(address logic, bytes data) external returns (address, address)
```

Deploys a the logic contract using a TransparentUpgradeableProxy.

_logicFactory must implement ILogicFactory.
     Caller must be the owner._

| Name | Type | Description |
| ---- | ---- | ----------- |
| logic | address | New logic contract address |
| data | bytes | abi encoded data to be calling initialize on the logic contract with parameters when applicable |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | address of the proxy and address of the proxy admin |
| [1] | address |  |

