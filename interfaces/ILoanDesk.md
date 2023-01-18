# Solidity API

## ILoanDesk

_LoanDesk interface defining common structures and hooks for the lending pools._

### LoanApplicationStatus

```solidity
enum LoanApplicationStatus {
  NULL,
  APPLIED,
  DENIED,
  OFFER_DRAFTED,
  OFFER_DRAFT_LOCKED,
  OFFER_MADE,
  OFFER_ACCEPTED,
  CANCELLED
}
```

### LoanTemplate

```solidity
struct LoanTemplate {
  uint256 minAmount;
  uint256 minDuration;
  uint256 maxDuration;
  uint256 gracePeriod;
  uint16 apr;
}
```

### LoanApplication

```solidity
struct LoanApplication {
  uint256 id;
  address borrower;
  uint256 amount;
  uint256 duration;
  uint256 requestedTime;
  enum ILoanDesk.LoanApplicationStatus status;
  string profileId;
  string profileDigest;
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

### LoanStatus

```solidity
enum LoanStatus {
  NULL,
  OUTSTANDING,
  REPAID,
  DEFAULTED
}
```

### Loan

```solidity
struct Loan {
  uint256 id;
  address loanDeskAddress;
  uint256 applicationId;
  address borrower;
  uint256 amount;
  uint256 duration;
  uint256 gracePeriod;
  uint256 installmentAmount;
  uint16 installments;
  uint16 apr;
  uint256 borrowedTime;
  enum ILoanDesk.LoanStatus status;
}
```

### LoanDetail

```solidity
struct LoanDetail {
  uint256 loanId;
  uint256 totalAmountRepaid;
  uint256 principalAmountRepaid;
  uint256 interestPaid;
  uint256 paymentCarry;
  uint256 interestPaidTillTime;
}
```

### LoanRequested

```solidity
event LoanRequested(uint256 applicationId, address borrower, uint256 amount)
```

Event for when a new loan is requested, and an application is created

### LoanRequestDenied

```solidity
event LoanRequestDenied(uint256 applicationId, address borrower, uint256 amount)
```

Event for when a loan request is denied

### LoanOfferDrafted

```solidity
event LoanOfferDrafted(uint256 applicationId, address borrower, uint256 amount)
```

Event for when a loan offer is made

### OfferDraftUpdated

```solidity
event OfferDraftUpdated(uint256 applicationId, address borrower, uint256 prevAmount, uint256 newAmount)
```

Event for when a loan offer is updated

### LoanOfferDraftLocked

```solidity
event LoanOfferDraftLocked(uint256 applicationId)
```

Event for when a loan offer draft is locked and is made available for voting

### LoanOfferMade

```solidity
event LoanOfferMade(uint256 applicationId)
```

Event for when a loan offer has passed voting and is now available to borrow

### LoanOfferCancelled

```solidity
event LoanOfferCancelled(uint256 applicationId, address borrower, uint256 amount)
```

Event for when a loan offer is cancelled

### LoanOfferAccepted

```solidity
event LoanOfferAccepted(uint256 applicationId, address borrower, uint256 amount)
```

Event for when a loan offer is accepted

### LoanBorrowed

```solidity
event LoanBorrowed(uint256 loanId, address borrower, uint256 applicationId)
```

Event for when loan offer is accepted and the loan is borrowed

### LoanRepaymentInitiated

```solidity
event LoanRepaymentInitiated(uint256 loanId, address borrower, address payer, uint256 amount, uint256 interestAmount)
```

Event for when a loan payment is initiated

### LoanFullyRepaid

```solidity
event LoanFullyRepaid(uint256 loanId, address borrower)
```

Event for when a loan is fully repaid

### LoanClosed

```solidity
event LoanClosed(uint256 loanId, address borrower, uint256 managerLossAmount, uint256 lenderLossAmount)
```

Event for when a loan is closed

### LoanDefaulted

```solidity
event LoanDefaulted(uint256 loanId, address borrower, uint256 managerLoss, uint256 lenderLoss)
```

Event for when a loan is defaulted

### MinLoanAmountSet

```solidity
event MinLoanAmountSet(uint256 prevValue, uint256 newValue)
```

Setter event

### MinLoanDurationSet

```solidity
event MinLoanDurationSet(uint256 prevValue, uint256 newValue)
```

Setter event

### MaxLoanDurationSet

```solidity
event MaxLoanDurationSet(uint256 prevValue, uint256 newValue)
```

Setter event

### TemplateLoanGracePeriodSet

```solidity
event TemplateLoanGracePeriodSet(uint256 prevValue, uint256 newValue)
```

Setter event

### TemplateLoanAPRSet

```solidity
event TemplateLoanAPRSet(uint256 prevValue, uint256 newValue)
```

Setter event

### loanById

```solidity
function loanById(uint256 loanId) external view returns (struct ILoanDesk.Loan)
```

Accessor for loan.

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | struct ILoanDesk.Loan | Loan struct instance for the specified loan ID. |

### loanDetailById

```solidity
function loanDetailById(uint256 loanId) external view returns (struct ILoanDesk.LoanDetail)
```

Accessor for loan.

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | struct ILoanDesk.LoanDetail | Loan struct instance for the specified loan ID. |

