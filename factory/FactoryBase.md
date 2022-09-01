# Solidity API

## FactoryBase

_Provides Ownable and shutdown/selfdestruct_

### shutdown

```solidity
function shutdown() external virtual
```

_permanently shutdown this factory and the sub-factories it manages by self-destructing them._

### preShutdown

```solidity
function preShutdown() internal virtual
```

Pre shutdown handler for extending contracts to override

