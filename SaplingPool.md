# Solidity API

## SaplingPool

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
  uint16 installments;
  uint16 apr;
  uint16 lateAPRDelta;
  uint256 borrowedTime;
  enum SaplingPool.LoanStatus status;
}
```

### LoanDetail

```solidity
struct LoanDetail {
  uint256 loanId;
  uint256 totalAmountRepaid;
  uint256 baseAmountRepaid;
  uint256 interestPaid;
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

### loans

```solidity
mapping(uint256 => struct SaplingPool.Loan) loans
```

Loans by loanId

### loanDetails

```solidity
mapping(uint256 => struct SaplingPool.LoanDetail) loanDetails
```

### borrowerStats

```solidity
mapping(address => struct SaplingPool.BorrowerStats) borrowerStats
```

Borrower statistics by address

### LoanDeskSet

```solidity
event LoanDeskSet(address from, address to)
```

### LoanBorrowed

```solidity
event LoanBorrowed(uint256 loanId, address borrower, uint256 applicationId)
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
modifier loanInStatus(uint256 loanId, enum SaplingPool.LoanStatus status)
```

### onlyLoanDesk

```solidity
modifier onlyLoanDesk()
```

### constructor

```solidity
constructor(address _poolToken, address _liquidityToken, address _governance, address _protocol, address _manager) public
```

Creates a Sapling pool.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _poolToken | address | ERC20 token contract address to be used as the pool issued token. |
| _liquidityToken | address | ERC20 token contract address to be used as main pool liquid currency. |
| _governance | address | Address of the protocol governance. |
| _protocol | address | Address of a wallet to accumulate protocol earnings. |
| _manager | address | Address of the pool manager. |

### borrow

```solidity
function borrow(uint256 appId) external
```

Accept loan offer and withdraw funds

_Caller must be the borrower. 
     The loan must be in APPROVED status._

| Name | Type | Description |
| ---- | ---- | ----------- |
| appId | uint256 | id of the loan application to accept the offer of. |

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

### defaultLoan

```solidity
function defaultLoan(uint256 loanId) external
```

Default a loan.

_Loan must be in OUTSTANDING status.
     Caller must be the manager.
     canDefault(loanId) must return 'true'._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan to default |

### setLoanDesk

```solidity
function setLoanDesk(address _loanDesk) external
```

### transferProtocolWallet

```solidity
function transferProtocolWallet(address _protocol) external
```

Transfer the protocol wallet and accumulated fees to a new wallet.

_Caller must be governance. 
     _protocol must not be 0._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _protocol | address | Address of the new protocol wallet. |

### onOffer

```solidity
function onOffer(uint256 amount) external
```

### onOfferUpdate

```solidity
function onOfferUpdate(uint256 prevAmount, uint256 amount) external
```

### canOffer

```solidity
function canOffer(uint256 totalOfferedAmount) external view returns (bool)
```

View indicating whether or not a given loan can be offered by the manager.

| Name | Type | Description |
| ---- | ---- | ----------- |
| totalOfferedAmount | uint256 | loanOfferAmount |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the given total loan amount can be offered, false otherwise |

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

### poolCanLend

```solidity
function poolCanLend() external view returns (bool)
```

Check if the pool can lend based on the current stake levels.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the staked funds provide at least a minimum ratio to the pool funds, False otherwise. |

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

### lendingLiquidity

```solidity
function lendingLiquidity() public view returns (uint256)
```

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

