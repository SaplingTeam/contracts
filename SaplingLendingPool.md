# Solidity API

## SaplingLendingPool

_Extends SaplingPoolContext with lending strategy._

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
  enum SaplingLendingPool.LoanStatus status;
}
```

### LoanDetail

```solidity
struct LoanDetail {
  uint256 loanId;
  uint256 totalAmountRepaid;
  uint256 principalAmountRepaid;
  uint256 interestPaid;
  uint256 interestPaidTillTime;
  uint256 lastPaymentTime;
}
```

### BorrowerStats

```solidity
struct BorrowerStats {
  address borrower;
  uint256 countBorrowed;
  uint256 countRepaid;
  uint256 countDefaulted;
  uint256 countOutstanding;
  uint256 amountBorrowed;
  uint256 amountBaseRepaid;
  uint256 amountInterestPaid;
  uint256 recentLoanId;
}
```

### loanDesk

```solidity
address loanDesk
```

Address of the loan desk contract

### loans

```solidity
mapping(uint256 => struct SaplingLendingPool.Loan) loans
```

Loans by loan ID

### loanDetails

```solidity
mapping(uint256 => struct SaplingLendingPool.LoanDetail) loanDetails
```

LoanDetails by loan ID

### borrowerStats

```solidity
mapping(address => struct SaplingLendingPool.BorrowerStats) borrowerStats
```

Borrower statistics by address

### LoanDeskSet

```solidity
event LoanDeskSet(address from, address to)
```

Event for when a new loan desk is set

### LoanBorrowed

```solidity
event LoanBorrowed(uint256 loanId, address borrower, uint256 applicationId)
```

Event for when loan offer is accepted and the loan is borrowed

### LoanRepaid

```solidity
event LoanRepaid(uint256 loanId, address borrower)
```

Event for when a loan is fully repaid

### LoanDefaulted

```solidity
event LoanDefaulted(uint256 loanId, address borrower, uint256 amountLost)
```

Event for when a loan is defaulted

### loanInStatus

```solidity
modifier loanInStatus(uint256 loanId, enum SaplingLendingPool.LoanStatus status)
```

A modifier to limit access to when a loan has the specified status

### onlyLoanDesk

```solidity
modifier onlyLoanDesk()
```

A modifier to limit access only to the loan desk contract

### disableIntitializers

```solidity
function disableIntitializers() external
```

_Disable initializers_

### initialize

```solidity
function initialize(address _poolToken, address _liquidityToken, address _governance, address _treasury, address _manager) public
```

Creates a Sapling pool.

_Addresses must not be 0._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _poolToken | address | ERC20 token contract address to be used as the pool issued token. |
| _liquidityToken | address | ERC20 token contract address to be used as pool liquidity currency. |
| _governance | address | Governance address |
| _treasury | address | Treasury wallet address |
| _manager | address | Manager address |

### setLoanDesk

```solidity
function setLoanDesk(address _loanDesk) external
```

Links a new loan desk for the pool to use. Intended for use upon initial pool deployment.

_Caller must be the governance._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _loanDesk | address | New LoanDesk address |

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
| [0] | uint256 | A pair of total amount charged including interest, and the interest charged. |
| [1] | uint256 |  |

### repayOnBehalf

```solidity
function repayOnBehalf(uint256 loanId, uint256 amount, address borrower) external returns (uint256, uint256)
```

Make a payment towards a loan on behalf of a borrower.

_Loan must be in OUTSTANDING status.
     Only the necessary sum is charged if amount exceeds amount due.
     Amount charged will not exceed the amount parameter._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan to make a payment towards. |
| amount | uint256 | Payment amount in tokens. |
| borrower | address | address of the borrower to make a payment on behalf of. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | A pair of total amount charged including interest, and the interest charged. |
| [1] | uint256 |  |

### defaultLoan

```solidity
function defaultLoan(uint256 loanId) public
```

Default a loan.

_Loan must be in OUTSTANDING status.
     Caller must be the manager.
     canDefault(loanId, msg.sender) must return 'true'._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan to default |

### closeLoan

```solidity
function closeLoan(uint256 loanId) external
```

Closes a loan. Closing a loan will repay the outstanding principal using the pool manager's revenue
                            and/or staked funds. If these funds are not sufficient, the lenders will take the loss.

_Loan must be in OUTSTANDING status.
     Caller must be the manager._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan to close |

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

Handles liquidity state changes on a loan offer update.

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

View indicating whether or not a given loan can be offered by the manager.

_Hook for checking if the lending pool can provide liquidity for the total offered loans amount._

| Name | Type | Description |
| ---- | ---- | ----------- |
| totalOfferedAmount | uint256 | Total sum of offered loan amount including outstanding offers |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the pool has sufficient lending liquidity, false otherwise |

### poolCanLend

```solidity
function poolCanLend() external view returns (bool)
```

Check if the pool can lend based on the current stake levels.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the staked funds provide at least a minimum ratio to the pool funds, false otherwise. |

### loansCount

```solidity
function loansCount() external view returns (uint256)
```

Count of all loan requests in this pool.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Loans count. |

### borrowedFunds

```solidity
function borrowedFunds() external view returns (uint256)
```

Current pool funds borrowed.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Amount of funds borrowed in liquidity tokens. |

### canDefault

```solidity
function canDefault(uint256 loanId, address caller) public view returns (bool)
```

View indicating whether or not a given loan qualifies to be defaulted by a given caller.

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan to check |
| caller | address | An address that intends to call default() on the loan |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the given loan can be defaulted, false otherwise |

### loanBalanceDue

```solidity
function loanBalanceDue(uint256 loanId) public view returns (uint256)
```

Loan balance due including interest if paid in full at this time.

_Loan must be in OUTSTANDING status._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan to check the balance of |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Total amount due with interest on this loan |

### afterTreasuryWalletTransfer

```solidity
function afterTreasuryWalletTransfer(address from) internal
```

Transfer the previous treasury wallet's accumulated fees to current treasury wallet.

_Overrides a hook in SaplingContext._

| Name | Type | Description |
| ---- | ---- | ----------- |
| from | address | Address of the previous treasury wallet. |

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
| loanId | uint256 | ID of the loan to make a payment towards |
| amount | uint256 | Payment amount in tokens |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | A pair of total amount charged including interest, and the interest charged |
| [1] | uint256 |  |

### loanBalanceDueWithInterest

```solidity
function loanBalanceDueWithInterest(uint256 loanId) internal view returns (uint256, uint256, uint256)
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
function payableLoanBalance(uint256 loanId, uint256 maxPaymentAmount) private view returns (uint256, uint256, uint256, uint256)
```

Loan balances payable given a max payment amount.

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan to check the balance of |
| maxPaymentAmount | uint256 | Maximum liquidity token amount user has agreed to pay towards the loan |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Total amount payable, interest payable, and the number of payable interest days |
| [1] | uint256 |  |
| [2] | uint256 |  |
| [3] | uint256 |  |

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

