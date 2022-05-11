# Solidity API

## Lender

Extends ManagedLendingPool with lending functionality.

_This contract is abstract. Extend the contract to implement an intended pool functionality._

### LoanStatus

```solidity
enum LoanStatus {
  APPLIED,
  DENIED,
  APPROVED,
  CANCELLED,
  FUNDS_WITHDRAWN,
  REPAID,
  DEFAULTED
}
```

### Loan

```solidity
struct Loan {
  uint256 id;
  address borrower;
  uint256 amount;
  uint256 duration;
  uint16 apr;
  uint16 lateAPRDelta;
  uint256 requestedTime;
  enum Lender.LoanStatus status;
}
```

### LoanDetail

```solidity
struct LoanDetail {
  uint256 loanId;
  uint256 totalAmountRepaid;
  uint256 baseAmountRepaid;
  uint256 interestPaid;
  uint256 approvedTime;
  uint256 lastPaymentTime;
}
```

### LoanRequested

```solidity
event LoanRequested(uint256 loanId, address borrower)
```

### LoanApproved

```solidity
event LoanApproved(uint256 loanId)
```

### LoanDenied

```solidity
event LoanDenied(uint256 loanId)
```

### LoanCancelled

```solidity
event LoanCancelled(uint256 loanId)
```

### LoanRepaid

```solidity
event LoanRepaid(uint256 loanId)
```

### LoanDefaulted

```solidity
event LoanDefaulted(uint256 loanId, uint256 amountLost)
```

### loanInStatus

```solidity
modifier loanInStatus(uint256 loanId, enum Lender.LoanStatus status)
```

### validLender

```solidity
modifier validLender()
```

### validBorrower

```solidity
modifier validBorrower()
```

### SAFE_MIN_APR

```solidity
uint16 SAFE_MIN_APR
```

Safe minimum for APR values

### SAFE_MAX_APR

```solidity
uint16 SAFE_MAX_APR
```

Safe maximum for APR values

### defaultAPR

```solidity
uint16 defaultAPR
```

Loan APR to be applied for the new loan requests

### defaultLateAPRDelta

```solidity
uint16 defaultLateAPRDelta
```

Loan late payment APR delta to be applied fot the new loan requests

### SAFE_MIN_AMOUNT

```solidity
uint256 SAFE_MIN_AMOUNT
```

Contract math safe minimum loan amount including token decimals

### minAmount

```solidity
uint256 minAmount
```

Minimum allowed loan amount

### SAFE_MIN_DURATION

```solidity
uint256 SAFE_MIN_DURATION
```

Contract math safe minimum loan duration in seconds

### SAFE_MAX_DURATION

```solidity
uint256 SAFE_MAX_DURATION
```

Contract math safe maximum loan duration in seconds

### minDuration

```solidity
uint256 minDuration
```

Minimum loan duration in seconds

### maxDuration

```solidity
uint256 maxDuration
```

Maximum loan duration in seconds

### nextLoanId

```solidity
uint256 nextLoanId
```

Loan id generator counter

### hasOpenApplication

```solidity
mapping(address &#x3D;&gt; bool) hasOpenApplication
```

Quick lookup to check an address has pending loan applications

### countOpenLoansOf

```solidity
mapping(address &#x3D;&gt; uint256) countOpenLoansOf
```

Combined open loan counts by address. Count includes loans in APPROVED and FUNDS_WITHDRAWN states.

### borrowedFunds

```solidity
uint256 borrowedFunds
```

Total funds borrowed at this time, including both withdrawn and allocated for withdrawal.

### loanFundsPendingWithdrawal

```solidity
uint256 loanFundsPendingWithdrawal
```

Total borrowed funds allocated for withdrawal but not yet withdrawn by the borrowers

### loanFunds

```solidity
mapping(address &#x3D;&gt; uint256) loanFunds
```

Borrowed funds allocated for withdrawal by borrower addresses

### loans

```solidity
mapping(uint256 &#x3D;&gt; struct Lender.Loan) loans
```

Loan applications by loanId

### loanDetails

```solidity
mapping(uint256 &#x3D;&gt; struct Lender.LoanDetail) loanDetails
```

Loan payment details by loanId. Loan detail is available only after a loan has been approved.

### recentLoanIdOf

```solidity
mapping(address &#x3D;&gt; uint256) recentLoanIdOf
```

Recent loanId of an address. Value of 0 means that the address doe not have any loan requests

### constructor

```solidity
constructor(address _token, address _governance, address _protocol, uint256 _minAmount) internal
```

Create a Lender that ManagedLendingPool.

__minAmount must be greater than or equal to SAFE_MIN_AMOUNT._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _token | address | ERC20 token contract address to be used as main pool liquid currency. |
| _governance | address | Address of the protocol governance. |
| _protocol | address | Address of a wallet to accumulate protocol earnings. |
| _minAmount | uint256 | Minimum amount to be borrowed per loan. |

### loansCount

```solidity
function loansCount() external view returns (uint256)
```

Count of all loan requests in this pool.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Loans count. |

### setDefaultAPR

```solidity
function setDefaultAPR(uint16 apr) external
```

Set annual loan interest rate for the future loans.

_apr must be inclusively between SAFE_MIN_APR and SAFE_MAX_APR.
     Caller must be the manager._

| Name | Type | Description |
| ---- | ---- | ----------- |
| apr | uint16 | Loan APR to be applied for the new loan requests. |

### setDefaultLateAPRDelta

```solidity
function setDefaultLateAPRDelta(uint16 lateAPRDelta) external
```

Set late payment annual loan interest rate delta for the future loans.

_lateAPRDelta must be inclusively between SAFE_MIN_APR and SAFE_MAX_APR.
     Caller must be the manager._

| Name | Type | Description |
| ---- | ---- | ----------- |
| lateAPRDelta | uint16 | Loan late payment APR delta to be applied for the new loan requests. |

### setMinLoanAmount

```solidity
function setMinLoanAmount(uint256 minLoanAmount) external
```

Set a minimum loan amount for the future loans.

_minLoanAmount must be greater than or equal to SAFE_MIN_AMOUNT.
     Caller must be the manager._

| Name | Type | Description |
| ---- | ---- | ----------- |
| minLoanAmount | uint256 | minimum loan amount to be enforced for the new loan requests. |

### setLoanMinDuration

```solidity
function setLoanMinDuration(uint256 duration) external
```

Set maximum loan duration for the future loans.

_Duration must be in seconds and inclusively between SAFE_MIN_DURATION and maxDuration.
     Caller must be the manager._

| Name | Type | Description |
| ---- | ---- | ----------- |
| duration | uint256 | Maximum loan duration to be enforced for the new loan requests. |

### setLoanMaxDuration

```solidity
function setLoanMaxDuration(uint256 duration) external
```

Set maximum loan duration for the future loans.

_Duration must be in seconds and inclusively between minDuration and SAFE_MAX_DURATION.
     Caller must be the manager._

| Name | Type | Description |
| ---- | ---- | ----------- |
| duration | uint256 | Maximum loan duration to be enforced for the new loan requests. |

### requestLoan

```solidity
function requestLoan(uint256 requestedAmount, uint256 loanDuration) external returns (uint256)
```

Request a new loan.

_Requested amount must be greater or equal to minAmount().
     Loan duration must be between minDuration() and maxDuration().
     Caller must not be a lender, protocol, or the manager. 
     Multiple pending applications from the same address are not allowed,
     most recent loan/application of the caller must not have APPLIED status._

| Name | Type | Description |
| ---- | ---- | ----------- |
| requestedAmount | uint256 | Token amount to be borrowed. |
| loanDuration | uint256 | Loan duration in seconds. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | ID of a new loan application. |

### approveLoan

```solidity
function approveLoan(uint256 _loanId) external
```

Approve a loan.

_Loan must be in APPLIED status.
     Caller must be the manager.
     Loan amount must not exceed poolLiquidity();
     Stake to pool funds ratio must be good - poolCanLend() must be true._

### denyLoan

```solidity
function denyLoan(uint256 loanId) external
```

Deny a loan.

_Loan must be in APPLIED status.
     Caller must be the manager._

### cancelLoan

```solidity
function cancelLoan(uint256 loanId) external
```

Cancel a loan.

_Loan must be in APPROVED status.
     Caller must be the manager._

### repay

```solidity
function repay(uint256 loanId, uint256 amount) external returns (uint256, uint256)
```

Make a payment towards a loan.

_Caller must be the borrower.
     Loan must be in FUNDS_WITHDRAWN status.
     Only the necessary sum is charged if amount exceeds amount due.
     Amount charged will not exceed the amount parameter._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan to make a payment towards. |
| amount | uint256 | Payment amount in tokens. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | A pair of total amount changed including interest, and the interest charged. |
| [1] | uint256 |  |

### defaultLoan

```solidity
function defaultLoan(uint256 loanId) external
```

Default a loan.

_Loan must be in FUNDS_WITHDRAWN status.
     Caller must be the manager._

### loanBalanceDue

```solidity
function loanBalanceDue(uint256 loanId) external view returns (uint256)
```

Loan balance due including interest if paid in full at this time.

_Loan must be in FUNDS_WITHDRAWN status._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan to check the balance of. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Total amount due with interest on this loan. |

### loanBalanceDueWithInterest

```solidity
function loanBalanceDueWithInterest(uint256 loanId) internal view returns (uint256, uint256)
```

Loan balance due including interest if paid in full at this time.

_Internal method to get the amount due and the interest rate applied._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan to check the balance of. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | A pair of a total amount due with interest on this loan, and a percentage representing the interest part of the due amount. |
| [1] | uint256 |  |

### countInterestDays

```solidity
function countInterestDays(uint256 timeFrom, uint256 timeTo) private pure returns (uint256)
```

Get the number of days in a time period to witch an interest can be applied.

_Internal helper method. Returns the ceiling of the count._

| Name | Type | Description |
| ---- | ---- | ----------- |
| timeFrom | uint256 | Epoch timestamp of the start of the time period. |
| timeTo | uint256 | Epoch timestamp of the end of the time period. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Ceil count of days in a time period to witch an interest can be applied. |

### increaseLoanFunds

```solidity
function increaseLoanFunds(address wallet, uint256 amount) private
```

_Internal method to allocate funds to borrow upon loan approval_

| Name | Type | Description |
| ---- | ---- | ----------- |
| wallet | address | Address to allocate funds to. |
| amount | uint256 | Token amount to allocate. |

### decreaseLoanFunds

```solidity
function decreaseLoanFunds(address wallet, uint256 amount) internal
```

_Internal method to deallocate funds to borrow upon borrow()_

| Name | Type | Description |
| ---- | ---- | ----------- |
| wallet | address | Address to deallocate the funds of. |
| amount | uint256 | Token amount to deallocate. |

