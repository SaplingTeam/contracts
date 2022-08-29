# Solidity API

## ILoanDeskOwner

_Interface defining functional hooks for LoanDesk, and setup hooks for SaplingFactory._

### setLoanDesk

```solidity
function setLoanDesk(address _loanDesk) external
```

Links a new loan desk for the pool to use. Intended for use upon initial pool deployment.

_Caller must be the governance._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _loanDesk | address | New LoanDesk address |

### onOffer

```solidity
function onOffer(uint256 amount) external
```

Handles liquidity state changes on a loan offer.

_Hook to be called when a new loan offer is made.
     Caller must be the LoanDesk._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Loan offer amount. |

### onOfferUpdate

```solidity
function onOfferUpdate(uint256 prevAmount, uint256 amount) external
```

_Hook to be called when a loan offer amount is updated. Amount update can be due to offer update or
     cancellation. Caller must be the LoanDesk._

| Name | Type | Description |
| ---- | ---- | ----------- |
| prevAmount | uint256 | The original, now previous, offer amount. |
| amount | uint256 | New offer amount. Cancelled offer must register an amount of 0 (zero). |

### canOffer

```solidity
function canOffer(uint256 totalOfferedAmount) external view returns (bool)
```

_Hook for checking if the lending pool can provide liquidity for the total offered loans amount._

| Name | Type | Description |
| ---- | ---- | ----------- |
| totalOfferedAmount | uint256 | Total sum of offered loan amount including outstanding offers |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the pool has sufficient lending liquidity, false otherwise. |

