# Solidity API

## SaplingFactory

Facilitates on-chain deployment and setup of protocol components.

### tokenFactory

```solidity
address tokenFactory
```

Token factory contract address

### loanDeskFactory

```solidity
address loanDeskFactory
```

LoanDesk factory contract address

### poolFactory

```solidity
address poolFactory
```

Lending pool factory contract address

### LendingPoolReady

```solidity
event LendingPoolReady(address pool)
```

Event for when a Lending pool and it"s components are deployed, linked and ready for use.

### constructor

```solidity
constructor(address _tokenFactory, address _loanDeskFactory, address _poolFactory) public
```

Create a new SaplingFactory.

_Addresses must not be 0._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _tokenFactory | address | Toke factory address |
| _loanDeskFactory | address | LoanDesk factory address |
| _poolFactory | address | Lending Pool factory address address |

### createLendingPool

```solidity
function createLendingPool(string name, string symbol, address liquidityToken, address governance, address treasury, address manager) external
```

Deploys a lending pool and it"s components

_Caller must be the governance._

| Name | Type | Description |
| ---- | ---- | ----------- |
| name | string | Token name |
| symbol | string | Token symbol |
| liquidityToken | address | Liquidity token address |
| governance | address | Governance address |
| treasury | address | Treasury wallet address |
| manager | address | Manager address |

### preShutdown

```solidity
function preShutdown() internal
```

_Overrides a pre-shutdown hoot in Factory Base_

