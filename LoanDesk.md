# Solidity API

## LoanDesk

Provides loan application and offer management.

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

### pool

```solidity
address pool
```

Address of the lending pool contract

### SAFE_MIN_AMOUNT

```solidity
uint256 SAFE_MIN_AMOUNT
```

Math safe minimum loan amount including token decimals

### minLoanAmount

```solidity
uint256 minLoanAmount
```

Minimum allowed loan amount

### SAFE_MIN_DURATION

```solidity
uint256 SAFE_MIN_DURATION
```

Math safe minimum loan duration in seconds

### SAFE_MAX_DURATION

```solidity
uint256 SAFE_MAX_DURATION
```

Math safe maximum loan duration in seconds

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

Minimum allowed loan payment grace period

### MAX_LOAN_GRACE_PERIOD

```solidity
uint256 MAX_LOAN_GRACE_PERIOD
```

Maximum allowed loan payment grace period

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

Total liquidity tokens allocated for loan offers and pending acceptance by the borrowers

### LoanRequested

```solidity
event LoanRequested(uint256 applicationId, address borrower)
```

Event for when a new loan is requested, and an application is created

### LoanRequestDenied

```solidity
event LoanRequestDenied(uint256 applicationId, address borrower)
```

Event for when a loan request is denied

### LoanOffered

```solidity
event LoanOffered(uint256 applicationId, address borrower)
```

Event for when a loan offer is made

### LoanOfferUpdated

```solidity
event LoanOfferUpdated(uint256 applicationId, address borrower)
```

Event for when a loan offer is updated

### LoanOfferCancelled

```solidity
event LoanOfferCancelled(uint256 applicationId, address borrower)
```

Event for when a loan offer is cancelled

### onlyPool

```solidity
modifier onlyPool()
```

A modifier to limit access only to the lending pool contract

### applicationInStatus

```solidity
modifier applicationInStatus(uint256 applicationId, enum ILoanDesk.LoanApplicationStatus status)
```

A modifier to limit access only to when the application exists and has the specified status

### constructor

```solidity
constructor(address _pool, address _governance, address _protocol, address _manager, uint8 _decimals) public
```

Create a new LoanDesk.

_Addresses must not be 0._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _pool | address | Lending pool address |
| _governance | address | Governance address |
| _protocol | address | Protocol wallet address |
| _manager | address | Manager address |
| _decimals | uint8 | Lending pool liquidity token decimals |

### setMinLoanAmount

```solidity
function setMinLoanAmount(uint256 _minLoanAmount) external
```

Set a minimum loan amount.

_minLoanAmount must be greater than or equal to SAFE_MIN_AMOUNT.
     Caller must be the manager._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _minLoanAmount | uint256 | Minimum loan amount to be enforced on new loan requests and offers |

### setMinLoanDuration

```solidity
function setMinLoanDuration(uint256 duration) external
```

Set the minimum loan duration

_Duration must be in seconds and inclusively between SAFE_MIN_DURATION and maxLoanDuration.
     Caller must be the manager._

| Name | Type | Description |
| ---- | ---- | ----------- |
| duration | uint256 | Minimum loan duration to be enforced on new loan requests and offers |

### setMaxLoanDuration

```solidity
function setMaxLoanDuration(uint256 duration) external
```

Set the maximum loan duration.

_Duration must be in seconds and inclusively between minLoanDuration and SAFE_MAX_DURATION.
     Caller must be the manager._

| Name | Type | Description |
| ---- | ---- | ----------- |
| duration | uint256 | Maximum loan duration to be enforced on new loan requests and offers |

### setTemplateLoanGracePeriod

```solidity
function setTemplateLoanGracePeriod(uint256 gracePeriod) external
```

Set the template loan payment grace period.

_Grace period must be in seconds and inclusively between MIN_LOAN_GRACE_PERIOD and MAX_LOAN_GRACE_PERIOD.
     Caller must be the manager._

| Name | Type | Description |
| ---- | ---- | ----------- |
| gracePeriod | uint256 | Loan payment grace period for new loan offers |

### setTemplateLoanAPR

```solidity
function setTemplateLoanAPR(uint16 apr) external
```

Set a template loan APR

_APR must be inclusively between SAFE_MIN_APR and SAFE_MAX_APR.
     Caller must be the manager._

| Name | Type | Description |
| ---- | ---- | ----------- |
| apr | uint16 | Loan APR to be enforced on the new loan offers. |

### requestLoan

```solidity
function requestLoan(uint256 _amount, uint256 _duration, string _profileId, string _profileDigest) external
```

Request a new loan.

_Requested amount must be greater or equal to minLoanAmount().
     Loan duration must be between minLoanDuration() and maxLoanDuration().
     Caller must not be a lender, protocol, or the manager.
     Multiple pending applications from the same address are not allowed -
     most recent loan/application of the caller must not have APPLIED status._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _amount | uint256 | Liquidity token amount to be borrowed |
| _duration | uint256 | Loan duration in seconds |
| _profileId | string | Borrower metadata profile id obtained from the borrower service |
| _profileDigest | string | Borrower metadata digest obtained from the borrower service |

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
     Loan amount must not exceed available liquidity -
     canOffer(offeredFunds.add(_amount)) must be true on the lending pool._

| Name | Type | Description |
| ---- | ---- | ----------- |
| appId | uint256 | Loan application id |
| _amount | uint256 | Loan amount in liquidity tokens |
| _duration | uint256 | Loan term in seconds |
| _gracePeriod | uint256 | Loan payment grace period in seconds |
| _installmentAmount | uint256 | Minimum payment amount on each instalment in liquidity tokens |
| _installments | uint16 | The number of payment installments |
| _apr | uint16 | Annual percentage rate of this loan |

### updateOffer

```solidity
function updateOffer(uint256 appId, uint256 _amount, uint256 _duration, uint256 _gracePeriod, uint256 _installmentAmount, uint16 _installments, uint16 _apr) external
```

Update an existing loan offer.

_Loan application must be in OFFER_MADE status.
     Caller must be the manager.
     Loan amount must not exceed available liquidity -
     canOffer(offeredFunds.add(offeredFunds.sub(offer.amount).add(_amount))) must be true on the lending pool._

| Name | Type | Description |
| ---- | ---- | ----------- |
| appId | uint256 | Loan application id |
| _amount | uint256 | Loan amount in liquidity tokens |
| _duration | uint256 | Loan term in seconds |
| _gracePeriod | uint256 | Loan payment grace period in seconds |
| _installmentAmount | uint256 | Minimum payment amount on each instalment in liquidity tokens |
| _installments | uint16 | The number of payment installments |
| _apr | uint16 | Annual percentage rate of this loan |

### cancelLoan

```solidity
function cancelLoan(uint256 appId) external
```

Cancel a loan.

_Loan application must be in OFFER_MADE status.
     Caller must be the manager or approved party when the manager is inactive._

### onBorrow

```solidity
function onBorrow(uint256 appId) external
```

Hook to be called when a loan offer is accepted. Updates the loan offer and liquidity state.

_Loan application must be in OFFER_MADE status.
     Caller must be the lending pool._

| Name | Type | Description |
| ---- | ---- | ----------- |
| appId | uint256 | ID of the application the accepted offer was made for. |

### canCancel

```solidity
function canCancel(uint256 appId, address caller) external view returns (bool)
```

View indicating whether or not a given loan offer qualifies to be cancelled by a given caller.

| Name | Type | Description |
| ---- | ---- | ----------- |
| appId | uint256 | Application ID of the loan offer in question |
| caller | address | Address that intends to call cancel() on the loan offer |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the given loan approval can be cancelled and can be cancelled by the specified caller,         false otherwise. |

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

### authorizedOnInactiveManager

```solidity
function authorizedOnInactiveManager(address caller) internal view returns (bool)
```

Indicates whether or not the the caller is authorized to take applicable managing actions when the
        manager is inactive.

_Overrides a hook in SaplingManagerContext._

| Name | Type | Description |
| ---- | ---- | ----------- |
| caller | address | Caller's address. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the caller is authorized at this time, false otherwise. |

### canClose

```solidity
function canClose() internal pure returns (bool)
```

Indicates whether or not the contract can be closed in it's current state.

_Overrides a hook in SaplingManagerContext._

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the contract is closed, false otherwise. |

### validateLoanParams

```solidity
function validateLoanParams(uint256 _amount, uint256 _duration, uint256 _gracePeriod, uint256 _installmentAmount, uint16 _installments, uint16 _apr) private view
```

Validates loan offer parameters

_Throws a require-type exception on invalid loan parameter_

| Name | Type | Description |
| ---- | ---- | ----------- |
| _amount | uint256 | Loan amount in liquidity tokens |
| _duration | uint256 | Loan term in seconds |
| _gracePeriod | uint256 | Loan payment grace period in seconds |
| _installmentAmount | uint256 | Minimum payment amount on each instalment in liquidity tokens |
| _installments | uint16 | The number of payment installments |
| _apr | uint16 | Annual percentage rate of this loan |

