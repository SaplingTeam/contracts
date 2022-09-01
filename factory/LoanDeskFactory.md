# Solidity API

## LoanDeskFactory

Facilitates on-chain deployment of new LoanDesk contracts.

### LoanDeskCreated

```solidity
event LoanDeskCreated(address pool)
```

Event for when a new LoanDesk is deployed

### create

```solidity
function create() external returns (address)
```

Deploys a new logic instance of SaplingLendingPool.

