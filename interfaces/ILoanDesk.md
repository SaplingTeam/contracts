# Solidity API

## ILoanDesk

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
  uint16 installments;
  uint16 apr;
  uint16 lateAPRDelta;
  uint256 offeredTime;
}
```

### applicationStatus

```solidity
function applicationStatus(uint256 appId) external view returns (enum ILoanDesk.LoanApplicationStatus)
```

### loanOfferById

```solidity
function loanOfferById(uint256 appId) external view returns (struct ILoanDesk.LoanOffer)
```

### onBorrow

```solidity
function onBorrow(uint256 appId) external
```

