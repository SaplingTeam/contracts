# Solidity API

## LoanDesk

Extends ManagedLendingPool with lending functionality.

_This contract is abstract. Extend the contract to implement an intended pool functionality._

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

### BorrowerStats

```solidity
struct BorrowerStats {
  address borrower;
  uint256 countRequested;
  uint256 countDenied;
  uint256 countOffered;
  uint256 countBorrowed;
  uint256 countCancelled;
  uint256 recentApplicationId;
  bool hasOpenApplication;
}
```

### LoanRequested

```solidity
event LoanRequested(uint256 applicationId, address borrower)
```

### LoanRequestDenied

```solidity
event LoanRequestDenied(uint256 applicationId, address borrower)
```

### LoanOffered

```solidity
event LoanOffered(uint256 applicationId, address borrower)
```

### LoanOfferUpdated

```solidity
event LoanOfferUpdated(uint256 applicationId, address borrower)
```

### LoanOfferCancelled

```solidity
event LoanOfferCancelled(uint256 applicationId, address borrower)
```

### pool

```solidity
address pool
```

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

### nextApplicationId

```solidity
uint256 nextApplicationId
```

Loan application id generator counter

### loanApplications

```solidity
mapping(uint256 => struct LoanDesk.LoanApplication) loanApplications
```

Loan applications by applicationId

### loanOffers

```solidity
mapping(uint256 => struct ILoanDesk.LoanOffer) loanOffers
```

Loan offers by applicationId

### borrowerStats

```solidity
mapping(address => struct LoanDesk.BorrowerStats) borrowerStats
```

Borrower statistics by address

### offeredFunds

```solidity
uint256 offeredFunds
```

### onlyPool

```solidity
modifier onlyPool()
```

### applicationInStatus

```solidity
modifier applicationInStatus(uint256 applicationId, enum ILoanDesk.LoanApplicationStatus status)
```

### constructor

```solidity
constructor(address _pool, address _governance, address _protocol, address _manager, uint256 _oneToken) public
```

Create a Lender that ManagedLendingPool.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _pool | address |  |
| _governance | address | Address of the protocol governance. |
| _protocol | address | Address of a wallet to accumulate protocol earnings. |
| _manager | address | Address of the pool manager. |
| _oneToken | uint256 |  |

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

### setMinLoanDuration

```solidity
function setMinLoanDuration(uint256 duration) external
```

Set maximum loan duration for the future loans.

_Duration must be in seconds and inclusively between SAFE_MIN_DURATION and maxLoanDuration.
     Caller must be the manager._

| Name | Type | Description |
| ---- | ---- | ----------- |
| duration | uint256 | Maximum loan duration to be enforced for the new loan requests. |

### setMaxLoanDuration

```solidity
function setMaxLoanDuration(uint256 duration) external
```

Set maximum loan duration for the future loans.

_Duration must be in seconds and inclusively between minLoanDuration and SAFE_MAX_DURATION.
     Caller must be the manager._

| Name | Type | Description |
| ---- | ---- | ----------- |
| duration | uint256 | Maximum loan duration to be enforced for the new loan requests. |

### setTemplateLoanGracePeriod

```solidity
function setTemplateLoanGracePeriod(uint256 gracePeriod) external
```

Set loan payment grace period for the future loans.

_Duration must be in seconds and inclusively between MIN_LOAN_GRACE_PERIOD and MAX_LOAN_GRACE_PERIOD.
     Caller must be the manager._

| Name | Type | Description |
| ---- | ---- | ----------- |
| gracePeriod | uint256 | Loan payment grace period for new loan requests. |

### setTemplateLoanAPR

```solidity
function setTemplateLoanAPR(uint16 apr) external
```

Set annual loan interest rate for the future loans.

_apr must be inclusively between SAFE_MIN_APR and SAFE_MAX_APR.
     Caller must be the manager._

| Name | Type | Description |
| ---- | ---- | ----------- |
| apr | uint16 | Loan APR to be applied for the new loan requests. |

### requestLoan

```solidity
function requestLoan(uint256 _amount, uint256 _duration, string _profileId, string _profileDigest) external
```

Request a new loan.

_Requested amount must be greater or equal to minLoanAmount().
     Loan duration must be between minLoanDuration() and maxLoanDuration().
     Caller must not be a lender, protocol, or the manager. 
     Multiple pending applications from the same address are not allowed,
     most recent loan/application of the caller must not have APPLIED status._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _amount | uint256 | Token amount to be borrowed. |
| _duration | uint256 | Loan duration in seconds. |
| _profileId | string |  |
| _profileDigest | string |  |

### denyLoan

```solidity
function denyLoan(uint256 appId) external
```

Deny a loan.

_Loan must be in APPLIED status.
     Caller must be the manager._

### offerLoan

```solidity
function offerLoan(uint256 appId, uint256 _amount, uint256 _duration, uint256 _gracePeriod, uint256 _installmentAmount, uint16 _installments, uint16 _apr) external
```

Approve a loan application and offer a loan.

_Loan application must be in APPLIED status.
     Caller must be the manager.
     Loan amount must not exceed poolLiquidity();
     Stake to pool funds ratio must be good - poolCanLend() must be true._

### updateOffer

```solidity
function updateOffer(uint256 appId, uint256 _amount, uint256 _duration, uint256 _gracePeriod, uint256 _installmentAmount, uint16 _installments, uint16 _apr) external
```

Update an existing loan offer offer a loan.

_Loan application must be in OFFER_MADE status.
     Caller must be the manager.
     Loan amount must not exceed poolLiquidity();
     Stake to pool funds ratio must be good - poolCanLend() must be true._

### cancelLoan

```solidity
function cancelLoan(uint256 appId) external
```

Cancel a loan.

_Loan must be in APPROVED status.
     Caller must be the manager._

### onBorrow

```solidity
function onBorrow(uint256 appId) external
```

### canCancel

```solidity
function canCancel(uint256 appId, address caller) external view returns (bool)
```

View indicating whether or not a given loan approval qualifies to be cancelled by a given caller.

| Name | Type | Description |
| ---- | ---- | ----------- |
| appId | uint256 | application ID to check |
| caller | address | address that intends to call cancel() on the loan |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the given loan approval can be cancelled, false otherwise |

### applicationStatus

```solidity
function applicationStatus(uint256 appId) external view returns (enum ILoanDesk.LoanApplicationStatus)
```

### loanOfferById

```solidity
function loanOfferById(uint256 appId) external view returns (struct ILoanDesk.LoanOffer)
```

### authorizedOnInactiveManager

```solidity
function authorizedOnInactiveManager(address caller) internal view returns (bool)
```

### canClose

```solidity
function canClose() internal pure returns (bool)
```

### validLoanParams

```solidity
function validLoanParams(uint256 _amount, uint256 _duration, uint256 _gracePeriod, uint256 _installmentAmount, uint16 _installments, uint16 _apr) private view returns (bool)
```

