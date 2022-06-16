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
  OUTSTANDING,
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
  uint256 gracePeriod;
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

### BorrowerStats

```solidity
struct BorrowerStats {
  address borrower;
  uint256 countRequested;
  uint256 countApproved;
  uint256 countDenied;
  uint256 countCancelled;
  uint256 countRepaid;
  uint256 countDefaulted;
  uint256 countCurrentApproved;
  uint256 countOutstanding;
  uint256 amountBorrowed;
  uint256 amountBaseRepaid;
  uint256 amountInterestPaid;
  uint256 recentLoanId;
}
```

### LoanRequested

```solidity
event LoanRequested(uint256 loanId, address borrower)
```

### LoanApproved

```solidity
event LoanApproved(uint256 loanId, address borrower)
```

### LoanDenied

```solidity
event LoanDenied(uint256 loanId, address borrower)
```

### LoanCancelled

```solidity
event LoanCancelled(uint256 loanId, address borrower)
```

### LoanRepaid

```solidity
event LoanRepaid(uint256 loanId, address borrower)
```

### LoanDefaulted

```solidity
event LoanDefaulted(uint256 loanId, address borrower, uint256 amountLost)
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

### templateLoanAPR

```solidity
uint16 templateLoanAPR
```

Loan APR to be applied for the new loan requests

### templateLateLoanAPRDelta

```solidity
uint16 templateLateLoanAPRDelta
```

Loan late payment APR delta to be applied fot the new loan requests

### weightedAvgLoanAPR

```solidity
uint256 weightedAvgLoanAPR
```

Weighted average loan APR on the borrowed funds

### SAFE_MIN_AMOUNT

```solidity
uint256 SAFE_MIN_AMOUNT
```

Contract math safe minimum loan amount including token decimals

### minLoanAmount

```solidity
uint256 minLoanAmount
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

### minLoanDuration

```solidity
uint256 minLoanDuration
```

Minimum loan duration in seconds

### maxLoanDuration

```solidity
uint256 maxLoanDuration
```

Maximum loan duration in seconds

### templateLoanGracePeriod

```solidity
uint256 templateLoanGracePeriod
```

Loan payment grace period after which a loan can be defaulted

### MIN_LOAN_GRACE_PERIOD

```solidity
uint256 MIN_LOAN_GRACE_PERIOD
```

Maximum allowed loan payment grace period

### MAX_LOAN_GRACE_PERIOD

```solidity
uint256 MAX_LOAN_GRACE_PERIOD
```

### MANAGER_INACTIVITY_GRACE_PERIOD

```solidity
uint256 MANAGER_INACTIVITY_GRACE_PERIOD
```

Grace period for the manager to be inactive on a given loan /cancel/default decision. 
        After this grace period of managers inaction on a given loan, lenders who stayed longer than EARLY_EXIT_COOLDOWN 
        can also call cancel() and default(). Other requirements for loan cancellation/default still apply.

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

### loanFundsPendingWithdrawal

```solidity
uint256 loanFundsPendingWithdrawal
```

Total borrowed funds allocated for withdrawal but not yet withdrawn by the borrowers

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

### borrowerStats

```solidity
mapping(address &#x3D;&gt; struct Lender.BorrowerStats) borrowerStats
```

Borrower statistics by address

### constructor

```solidity
constructor(address _token, address _governance, address _protocol, uint256 _minLoanAmount) internal
```

Create a Lender that ManagedLendingPool.

__minAmount must be greater than or equal to SAFE_MIN_AMOUNT._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _token | address | ERC20 token contract address to be used as main pool liquid currency. |
| _governance | address | Address of the protocol governance. |
| _protocol | address | Address of a wallet to accumulate protocol earnings. |
| _minLoanAmount | uint256 | Minimum amount to be borrowed per loan. |

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
function setMinLoanAmount(uint256 _minLoanAmount) external
```

Set a minimum loan amount for the future loans.

_minLoanAmount must be greater than or equal to SAFE_MIN_AMOUNT.
     Caller must be the manager._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _minLoanAmount | uint256 | minimum loan amount to be enforced for the new loan requests. |

### setLoanMinDuration

```solidity
function setLoanMinDuration(uint256 duration) external
```

Set maximum loan duration for the future loans.

_Duration must be in seconds and inclusively between SAFE_MIN_DURATION and maxLoanDuration.
     Caller must be the manager._

| Name | Type | Description |
| ---- | ---- | ----------- |
| duration | uint256 | Maximum loan duration to be enforced for the new loan requests. |

### setLoanMaxDuration

```solidity
function setLoanMaxDuration(uint256 duration) external
```

Set maximum loan duration for the future loans.

_Duration must be in seconds and inclusively between minLoanDuration and SAFE_MAX_DURATION.
     Caller must be the manager._

| Name | Type | Description |
| ---- | ---- | ----------- |
| duration | uint256 | Maximum loan duration to be enforced for the new loan requests. |

### setLoanGracePeriod

```solidity
function setLoanGracePeriod(uint256 gracePeriod) external
```

Set loan payment grace period for the future loans.

_Duration must be in seconds and inclusively between MIN_LOAN_GRACE_PERIOD and MAX_LOAN_GRACE_PERIOD.
     Caller must be the manager._

| Name | Type | Description |
| ---- | ---- | ----------- |
| gracePeriod | uint256 | Loan payment grace period for new loan requests. |

### requestLoan

```solidity
function requestLoan(uint256 requestedAmount, uint256 loanDuration) external returns (uint256)
```

Request a new loan.

_Requested amount must be greater or equal to minLoanAmount().
     Loan duration must be between minLoanDuration() and maxLoanDuration().
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

### borrow

```solidity
function borrow(uint256 loanId) external
```

Withdraw funds of an approved loan.

_Caller must be the borrower. 
     The loan must be in APPROVED status._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | id of the loan to withdraw funds of. |

### repay

```solidity
function repay(uint256 loanId, uint256 amount) external returns (uint256, uint256)
```

Make a payment towards a loan.

_Caller must be the borrower.
     Loan must be in OUTSTANDING status.
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

### repayOnBehalf

```solidity
function repayOnBehalf(uint256 loanId, uint256 amount, address borrower) external returns (uint256, uint256)
```

Make a payment towards a loan on behalf od a borrower

_Loan must be in OUTSTANDING status.
     Only the necessary sum is charged if amount exceeds amount due.
     Amount charged will not exceed the amount parameter._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan to make a payment towards. |
| amount | uint256 | Payment amount in tokens. |
| borrower | address | address of the borrower to make a payment in behalf of. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | A pair of total amount changed including interest, and the interest charged. |
| [1] | uint256 |  |

### repayBase

```solidity
function repayBase(uint256 loanId, uint256 amount) internal returns (uint256, uint256)
```

Make a payment towards a loan.

_Loan must be in OUTSTANDING status.
     Only the necessary sum is charged if amount exceeds amount due.
     Amount charged will not exceed the amount parameter._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan to make a payment towards. |
| amount | uint256 | Payment amount in tokens. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | A pair of total amount charged including interest, and the interest charged. |
| [1] | uint256 |  |

### defaultLoan

```solidity
function defaultLoan(uint256 loanId) external
```

Default a loan.

_Loan must be in OUTSTANDING status.
     Caller must be the manager.
     canDefault(loanId) must return &#x27;true&#x27;._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan to default |

### canApprove

```solidity
function canApprove(uint256 loanId) external view returns (bool)
```

View indicating whether or not a given loan can be approved by the manager.

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | loanId ID of the loan to check |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the given loan can be approved, false otherwise |

### canCancel

```solidity
function canCancel(uint256 loanId, address caller) external view returns (bool)
```

View indicating whether or not a given loan approval qualifies to be cancelled by a given caller.

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | loanId ID of the loan to check |
| caller | address | address that intends to call cancel() on the loan |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the given loan approval can be cancelled, false otherwise |

### canDefault

```solidity
function canDefault(uint256 loanId, address caller) external view returns (bool)
```

View indicating whether or not a given loan qualifies to be defaulted by a given caller.

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | loanId ID of the loan to check |
| caller | address | address that intends to call default() on the loan |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the given loan can be defaulted, false otherwise |

### loanBalanceDue

```solidity
function loanBalanceDue(uint256 loanId) external view returns (uint256)
```

Loan balance due including interest if paid in full at this time.

_Loan must be in OUTSTANDING status._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan to check the balance of. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Total amount due with interest on this loan. |

### recentLoanIdOf

```solidity
function recentLoanIdOf(address borrower) external view returns (uint256)
```

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

### isValidLender

```solidity
function isValidLender(address wallet) public view returns (bool)
```

Determine if a wallet address qualifies as a lender or not.

_deposit() will reject if the wallet cannot be a lender._

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the specified wallet can make deposits as a lender, false otherwise. |

### isValidBorrower

```solidity
function isValidBorrower(address wallet) public view returns (bool)
```

Determine if a wallet address qualifies as a borrower or not.

_requestLoan() will reject if the wallet cannot be a borrower._

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the specified wallet can make loan requests as a borrower, false otherwise. |

