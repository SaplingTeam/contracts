# Solidity API

## PoolFactory

### PoolCreated

```solidity
event PoolCreated(address pool)
```

### constructor

```solidity
constructor(address _governance, address _protocol) public
```

### create

```solidity
function create(string name, string symbol, address manager, address liquidityToken) external
```

