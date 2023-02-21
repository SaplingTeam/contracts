# Solidity API

## LoanDesk

Provides loan application and offer flow.

### config

```solidity
struct ILoanDesk.LoanDeskConfig config
```

LoanDesk configuration parameters

### balances

```solidity
struct ILoanDesk.LoanDeskBalances balances
```

Tracked contract balances and parameters

### loanTemplate

```solidity
struct ILoanDesk.LoanTemplate loanTemplate
```

Default loan parameter values

### nextApplicationId

```solidity
uint256 nextApplicationId
```

Loan application id generator counter

### loanApplications

```solidity
mapping(uint256 => struct ILoanDesk.LoanApplication) loanApplications
```

Loan applications by applicationId

### loanOffers

```solidity
mapping(uint256 => struct ILoanDesk.LoanOffer) loanOffers
```

Loan offers by applicationId

### recentApplicationIdOf

```solidity
mapping(address => uint256) recentApplicationIdOf
```

Recent application id by address

### nextLoanId

```solidity
uint256 nextLoanId
```

Loan id generator counter

### loans

```solidity
mapping(uint256 => struct ILoanDesk.Loan) loans
```

Loans by loan ID

### loanDetails

```solidity
mapping(uint256 => struct ILoanDesk.LoanDetail) loanDetails
```

LoanDetails by loan ID

### applicationInStatus

```solidity
modifier applicationInStatus(uint256 applicationId, enum ILoanDesk.LoanApplicationStatus status)
```

A modifier to limit access only to when the application exists and has the specified status

### loanInStatus

```solidity
modifier loanInStatus(uint256 loanId, enum ILoanDesk.LoanStatus status)
```

A modifier to limit access only to when the loan exists and has the specified status

### disableIntitializers

```solidity
function disableIntitializers() external
```

_Disable initializers_

### initialize

```solidity
function initialize(address _pool, address _liquidityToken, address _accessControl, address _stakerAddress, bytes32 _lenderGovernanceRole) public
```

Initializer a new LoanDesk.

_Addresses must not be 0._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _pool | address | Lending pool address |
| _liquidityToken | address | ERC20 token contract address to be used as pool liquidity currency. |
| _accessControl | address | Access control contract |
| _stakerAddress | address | Staker address |
| _lenderGovernanceRole | bytes32 | Role held by the timelock control that executed passed lender votes |

### setMinLoanAmount

```solidity
function setMinLoanAmount(uint256 minAmount) external
```

Set a minimum loan amount.

_minAmount must be greater than or equal to safeMinAmount.
     Caller must be the staker._

| Name | Type | Description |
| ---- | ---- | ----------- |
| minAmount | uint256 | Minimum loan amount to be enforced on new loan requests and offers |

### setMinLoanDuration

```solidity
function setMinLoanDuration(uint256 duration) external
```

Set the minimum loan duration

_Duration must be in seconds and inclusively between SAFE_MIN_DURATION and maxDuration.
     Caller must be the staker._

| Name | Type | Description |
| ---- | ---- | ----------- |
| duration | uint256 | Minimum loan duration to be enforced on new loan requests and offers |

### setMaxLoanDuration

```solidity
function setMaxLoanDuration(uint256 duration) external
```

Set the maximum loan duration.

_Duration must be in seconds and inclusively between minDuration and SAFE_MAX_DURATION.
     Caller must be the staker._

| Name | Type | Description |
| ---- | ---- | ----------- |
| duration | uint256 | Maximum loan duration to be enforced on new loan requests and offers |

### setTemplateLoanGracePeriod

```solidity
function setTemplateLoanGracePeriod(uint256 gracePeriod) external
```

Set the template loan payment grace period.

_Grace period must be in seconds and inclusively between MIN_LOAN_GRACE_PERIOD and MAX_LOAN_GRACE_PERIOD.
     Caller must be the staker._

| Name | Type | Description |
| ---- | ---- | ----------- |
| gracePeriod | uint256 | Loan payment grace period for new loan offers |

### setTemplateLoanAPR

```solidity
function setTemplateLoanAPR(uint16 apr) external
```

Set a template loan APR

_APR must be inclusively between SAFE_MIN_APR and 100%.
     Caller must be the staker._

| Name | Type | Description |
| ---- | ---- | ----------- |
| apr | uint16 | Loan APR to be enforced on the new loan offers. |

### requestLoan

```solidity
function requestLoan(uint256 _amount, uint256 _duration, string _profileId, string _profileDigest) external
```

Request a new loan.

_Requested amount must be greater or equal to minLoanAmount().
     Loan duration must be between minDuration() and maxDuration().
     Multiple pending applications from the same address are not allowed.
     _profileId and _profileDigest are optional - provide nill values when not applicable._

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
     Caller must be the staker._

### draftOffer

```solidity
function draftOffer(uint256 appId, uint256 _amount, uint256 _duration, uint256 _gracePeriod, uint256 _installmentAmount, uint16 _installments, uint16 _apr) external
```

Draft a loan offer for an application.

_Loan application must be in APPLIED status.
     Caller must be the staker.
     Loan amount must not exceed available liquidity._

| Name | Type | Description |
| ---- | ---- | ----------- |
| appId | uint256 | Loan application id |
| _amount | uint256 | Loan amount in liquidity tokens |
| _duration | uint256 | Loan term in seconds |
| _gracePeriod | uint256 | Loan payment grace period in seconds |
| _installmentAmount | uint256 | Minimum payment amount on each instalment in liquidity tokens |
| _installments | uint16 | The number of payment installments |
| _apr | uint16 | Annual percentage rate of this loan |

### updateDraftOffer

```solidity
function updateDraftOffer(uint256 appId, uint256 _amount, uint256 _duration, uint256 _gracePeriod, uint256 _installmentAmount, uint16 _installments, uint16 _apr) external
```

Update an existing draft loan offer.

_Loan application must be in OFFER_DRAFTED status.
     Caller must be the staker.
     Loan amount must not exceed available liquidity._

| Name | Type | Description |
| ---- | ---- | ----------- |
| appId | uint256 | Loan application id |
| _amount | uint256 | Loan amount in liquidity tokens |
| _duration | uint256 | Loan term in seconds |
| _gracePeriod | uint256 | Loan payment grace period in seconds |
| _installmentAmount | uint256 | Minimum payment amount on each instalment in liquidity tokens |
| _installments | uint16 | The number of payment installments |
| _apr | uint16 | Annual percentage rate of this loan |

### lockDraftOffer

```solidity
function lockDraftOffer(uint256 appId) external
```

Lock a draft loan offer.

_Loan application must be in OFFER_DRAFTED status.
     Caller must be the staker._

| Name | Type | Description |
| ---- | ---- | ----------- |
| appId | uint256 | Loan application id |

### offerLoan

```solidity
function offerLoan(uint256 appId) external
```

Make a loan offer.

_Loan application must be in OFFER_DRAFT_LOCKED status.
     Caller must be the staker._

| Name | Type | Description |
| ---- | ---- | ----------- |
| appId | uint256 | Loan application id |

### cancelLoan

```solidity
function cancelLoan(uint256 appId) external
```

Cancel a loan.

_Loan application must be in one of OFFER_MADE, OFFER_DRAFT_LOCKED, OFFER_MADE statuses.
     Caller must be the staker or the lender governance within the voting window._

### borrow

```solidity
function borrow(uint256 appId) external
```

Accept a loan offer and withdraw funds

_Caller must be the borrower of the loan in question.
     The loan must be in OFFER_MADE status._

| Name | Type | Description |
| ---- | ---- | ----------- |
| appId | uint256 | ID of the loan application to accept the offer of |

### repay

```solidity
function repay(uint256 loanId, uint256 amount) external
```

Make a payment towards a loan.

_Caller must be the borrower.
     Loan must be in OUTSTANDING status.
     Only the necessary sum is charged if amount exceeds amount due.
     Amount charged will not exceed the amount parameter._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan to make a payment towards. |
| amount | uint256 | Payment amount |

### repayOnBehalf

```solidity
function repayOnBehalf(uint256 loanId, uint256 amount, address borrower) external
```

Make a payment towards a loan on behalf of a borrower.

_Loan must be in OUTSTANDING status.
     Only the necessary sum is charged if amount exceeds amount due.
     Amount charged will not exceed the amount parameter._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan to make a payment towards. |
| amount | uint256 | Payment amount |
| borrower | address | address of the borrower to make a payment on behalf of. |

### defaultLoan

```solidity
function defaultLoan(uint256 loanId) external
```

Default a loan.

_Loan must be in OUTSTANDING status.
     Caller must be the staker.
     canDefault(loanId) must return 'true'._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan to default |

### repayBase

```solidity
function repayBase(uint256 loanId, uint256 amount) internal
```

Make a payment towards a loan.

_Loan must be in OUTSTANDING status.
     Only the necessary sum is charged if amount exceeds amount due.
     Amount charged will not exceed the amount parameter._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan to make a payment towards |
| amount | uint256 | Payment amount in tokens |

### updateAvgApr

```solidity
function updateAvgApr(uint256 amountReducedBy, uint16 apr) internal
```

_Internal method to update the weighted average loan apr based on the amount reduced by and an apr._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amountReducedBy | uint256 | amount by which the funds committed into strategy were reduced, due to repayment or loss |
| apr | uint16 | annual percentage rate of the strategy |

### applicationsCount

```solidity
function applicationsCount() external view returns (uint256)
```

Count of all loan requests in this pool.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | LoanApplication count. |

### loansCount

```solidity
function loansCount() external view returns (uint256)
```

Count of all loans in this pool.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Loan count. |

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

Accessor for loan detail.

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | struct ILoanDesk.LoanDetail | LoanDetail struct instance for the specified loan ID. |

### loanBalanceDue

```solidity
function loanBalanceDue(uint256 loanId) external view returns (uint256)
```

Loan balance due including interest if paid in full at this time.

_Loan must be in OUTSTANDING status._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan to check the balance of |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Total amount due with interest on this loan |

### hasOpenApplication

```solidity
function hasOpenApplication(address account) public view returns (bool)
```

### canDefault

```solidity
function canDefault(uint256 loanId) public view returns (bool)
```

View indicating whether or not a given loan qualifies to be defaulted

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan to check |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the given loan can be defaulted, false otherwise |

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

### loanBalanceDueWithInterest

```solidity
function loanBalanceDueWithInterest(uint256 loanId) private view returns (uint256, uint256, uint256)
```

Loan balances due if paid in full at this time.

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan to check the balance of |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Principal outstanding, interest outstanding, and the number of interest acquired days |
| [1] | uint256 |  |
| [2] | uint256 |  |

### payableLoanBalance

```solidity
function payableLoanBalance(uint256 loanId, uint256 maxPaymentAmount) private view returns (uint256, uint256, uint256)
```

Loan balances payable given a max payment amount.

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan to check the balance of |
| maxPaymentAmount | uint256 | Maximum liquidity token amount user has agreed to pay towards the loan |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Total transfer amount, interest payable, and the number of payable interest days,         and the current loan balance |
| [1] | uint256 |  |
| [2] | uint256 |  |

### countInterestDays

```solidity
function countInterestDays(uint256 timeFrom, uint256 timeTo) private pure returns (uint256)
```

Get the number of days in a time period to witch an interest can be applied.

_Returns the ceiling of the count._

| Name | Type | Description |
| ---- | ---- | ----------- |
| timeFrom | uint256 | Epoch timestamp of the start of the time period. |
| timeTo | uint256 | Epoch timestamp of the end of the time period. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Ceil count of days in a time period to witch an interest can be applied. |

### canClose

```solidity
function canClose() internal view returns (bool)
```

Indicates whether or not the contract can be closed in it's current state.

_Overrides a hook in SaplingStakerContext._

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the contract is closed, false otherwise. |

### canOpen

```solidity
function canOpen() internal view returns (bool)
```

Indicates whether or not the contract can be opened in it's current state.

_Overrides a hook in SaplingStakerContext._

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the conditions to open are met, false otherwise. |

### allocatedFunds

```solidity
function allocatedFunds() external view returns (uint256)
```

Accessor

_Total funds allocated for loan offers, including both drafted and pending acceptance_

### lentFunds

```solidity
function lentFunds() external view returns (uint256)
```

Accessor

_Total funds lent at this time, accounts only for loan principals_

### weightedAvgAPR

```solidity
function weightedAvgAPR() external view returns (uint16)
```

Accessor

_Weighted average loan APR on the borrowed funds_

