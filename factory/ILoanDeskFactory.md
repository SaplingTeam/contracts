# Solidity API

## ILoanDeskFactory

_Interface defining the inter-contract methods of a LoanDesk factory._

### create

```solidity
function create(address pool, address governance, address protocol, address manager, uint8 decimals) external returns (address)
```

Deploys a new instance of LoanDesk.

_Lending pool contract must implement ILoanDeskOwner.
     Caller must be the owner._

| Name | Type | Description |
| ---- | ---- | ----------- |
| pool | address | LendingPool address |
| governance | address | Governance address |
| protocol | address | Protocol wallet address |
| manager | address | Manager address |
| decimals | uint8 | Decimals of the tokens used in the pool |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | address | Address of the deployed contract |

