# Solidity API

## ILendingPool

_This interface has all LendingPool events, structs, and LoanDesk function hooks._

### LoanDeskSet

```solidity
event LoanDeskSet(address from, address to)
```

Event for when a new loan desk is set

### LoanFundsReleased

```solidity
event LoanFundsReleased(uint256 loanId, address borrower, uint256 amount)
```

Event whn loan funds are released after accepting a loan offer

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

### OfferLiquidityAllocated

```solidity
event OfferLiquidityAllocated(uint256 amount)
```

Event for when a liquidity is allocated for a loan offer

### OfferLiquidityUpdated

```solidity
event OfferLiquidityUpdated(uint256 prevAmount, uint256 newAmount)
```

Event for when the liquidity is adjusted for a loan offer

### LoanRepaymentConfirmed

```solidity
event LoanRepaymentConfirmed(uint256 loanId, address borrower, address payer, uint256 amount, uint256 interestAmount)
```

Event for when a loan repayments are made

### onOffer

```solidity
function onOffer(uint256 amount) external
```

_Hook for a new loan offer.
     Caller must be the LoanDesk._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Loan offer amount. |

### onOfferUpdate

```solidity
function onOfferUpdate(uint256 prevAmount, uint256 amount) external
```

_Hook for a loan offfer amount update._

| Name | Type | Description |
| ---- | ---- | ----------- |
| prevAmount | uint256 | The original, now previous, offer amount. |
| amount | uint256 | New offer amount. Cancelled offer must register an amount of 0 (zero). |

### onBorrow

```solidity
function onBorrow(uint256 loanId, address borrower, uint256 amount, uint16 apr) external
```

_Hook for borrowing a loan. Caller must be the loan desk.

     Parameters besides the loanId exists simply to avoid rereading it from the caller via additinal inter 
     contract call. Avoiding loop call reduces gas, contract bytecode size, and reduces the risk of reentrancy._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan being borrowed |
| borrower | address | Wallet address of the borrower, same as loan.borrower |
| amount | uint256 | Loan principal amount, same as loan.amount |
| apr | uint16 | Loan annual percentage rate, same as loan.apr |

### onRepay

```solidity
function onRepay(uint256 loanId, address borrower, address payer, uint16 apr, uint256 transferAmount, uint256 paymentAmount, uint256 interestPayable) external
```

_Hook for repayments. Caller must be the LoanDesk. 
     
     Parameters besides the loanId exists simply to avoid rereading it from the caller via additional inter 
     contract call. Avoiding loop call reduces gas, contract bytecode size, and reduces the risk of reentrancy._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan which has just been borrowed |
| borrower | address | Borrower address |
| payer | address | Actual payer address |
| apr | uint16 | Loan apr |
| transferAmount | uint256 | Amount chargeable |
| paymentAmount | uint256 | Logical payment amount, may be different to the transfer amount due to a payment carry |
| interestPayable | uint256 | Amount of interest paid, this value is already included in the payment amount |

### onCloseLoan

```solidity
function onCloseLoan(uint256 loanId, uint16 apr, uint256 amountRepaid, uint256 remainingDifference) external returns (uint256)
```

_Hook for closing a loan. Caller must be the LoanDesk. Closing a loan will repay the outstanding principal 
     using the pool manager's revenue and/or staked funds. If these funds are not sufficient, the lenders will 
     share the loss._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan to close |
| apr | uint16 | Loan apr |
| amountRepaid | uint256 | Amount repaid based on outstanding payment carry |
| remainingDifference | uint256 | Principal amount remaining to be resolved to close the loan |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Amount reimbursed by the pool manager funds |

### onDefault

```solidity
function onDefault(uint256 loanId, uint16 apr, uint256 carryAmountUsed, uint256 loss) external returns (uint256, uint256)
```

_Hook for defaulting a loan. Caller must be the LoanDesk. Defaulting a loan will cover the loss using 
the staked funds. If these funds are not sufficient, the lenders will share the loss._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan to default |
| apr | uint16 | Loan apr |
| carryAmountUsed | uint256 | Amount of payment carry repaid |
| loss | uint256 | Loss amount to resolve |

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

