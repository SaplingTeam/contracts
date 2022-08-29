# Solidity API

## ILoanDesk

_LoanDesk interface defining common structures and hooks for the lending pools._

### LoanApplicationStatus

```solidity
enum LoanApplicationStatus {
  NULL,
  APPLIED,
  DENIED,
  OFFER_MADE,
  OFFER_ACCEPTED,
  OFFER_CANCELLED
}
```

### LoanOffer

```solidity
struct LoanOffer {
  uint256 applicationId;
  address borrower;
  uint256 amount;
  uint256 duration;
  uint256 gracePeriod;
  uint256 installmentAmount;
  uint16 installments;
  uint16 apr;
  uint256 offeredTime;
}
```

### onBorrow

```solidity
function onBorrow(uint256 appId) external
```

_Hook to be called when a loan offer is accepted._

| Name | Type | Description |
| ---- | ---- | ----------- |
| appId | uint256 | ID of the application the accepted offer was made for. |

### applicationStatus

```solidity
function applicationStatus(uint256 appId) external view returns (enum ILoanDesk.LoanApplicationStatus)
```

Accessor for application status.

_NULL status is returned for nonexistent applications._

| Name | Type | Description |
| ---- | ---- | ----------- |
| appId | uint256 | ID of the application in question. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | enum ILoanDesk.LoanApplicationStatus | Current status of the application with the specified ID. |

### loanOfferById

```solidity
function loanOfferById(uint256 appId) external view returns (struct ILoanDesk.LoanOffer)
```

Accessor for loan offer.

_Loan offer is valid when the loan application is present and has OFFER_MADE status._

| Name | Type | Description |
| ---- | ---- | ----------- |
| appId | uint256 | ID of the application the offer was made for. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | struct ILoanDesk.LoanOffer | LoanOffer struct instance for the specified application ID. |

