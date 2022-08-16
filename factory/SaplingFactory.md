# Solidity API

## SaplingFactory

### verificationHub

```solidity
address verificationHub
```

### tokenFactory

```solidity
address tokenFactory
```

### loanDeskFactory

```solidity
address loanDeskFactory
```

### poolFactory

```solidity
address poolFactory
```

### PoolCreated

```solidity
event PoolCreated(address pool)
```

### constructor

```solidity
constructor(address _tokenFactory, address _loanDeskFactory, address _poolFactory, address _verificationHub, address _governance, address _protocol) public
```

### createLendingPool

```solidity
function createLendingPool(string name, string symbol, address manager, address liquidityToken) external
```

