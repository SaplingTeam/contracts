# Solidity API

## SaplingLendingPool

_Extends SaplingPoolContext with lending strategy._

### loanDesk

```solidity
address loanDesk
```

Address of the loan desk contract

### loanFundsReleased

```solidity
mapping(address => mapping(uint256 => bool)) loanFundsReleased
```

Mark loan funds released flags to guards against double withdrawals due to future bugs or compromised LoanDesk

### loanClosed

```solidity
mapping(address => mapping(uint256 => bool)) loanClosed
```

Mark the loans closed to guards against double actions due to future bugs or compromised LoanDesk

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
function initialize(address _poolToken, address _liquidityToken, address _accessControl, bytes32 _stakerRole) public
```

Creates a Sapling pool.

_Addresses must not be 0._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _poolToken | address | ERC20 token contract address to be used as the pool issued token. |
| _liquidityToken | address | ERC20 token contract address to be used as pool liquidity currency. |
| _accessControl | address | Access control contract |
| _stakerRole | bytes32 | Staker role |

### setLoanDesk

```solidity
function setLoanDesk(address _loanDesk) external
```

Links a new loan desk for the pool to use. Intended for use upon initial pool deployment.

_Caller must be the governance.
     This setter may also be used to switch loan desks.
     If applicable: Outstanding loan operations must be concluded on the loan desk before the switch._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _loanDesk | address | New LoanDesk address |

### onOffer

```solidity
function onOffer(uint256 amount) external
```

_Hook for a new loan offer. Caller must be the LoanDesk._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Loan offer amount. |

### onOfferUpdate

```solidity
function onOfferUpdate(uint256 prevAmount, uint256 amount) external
```

_Hook for a loan offer amount update. Amount update can be due to offer update or
     cancellation. Caller must be the LoanDesk._

| Name | Type | Description |
| ---- | ---- | ----------- |
| prevAmount | uint256 | The original, now previous, offer amount. |
| amount | uint256 | New offer amount. Cancelled offer must register an amount of 0 (zero). |

### onBorrow

```solidity
function onBorrow(uint256 loanId, address borrower, uint256 amount, uint16 apr) external
```

_Hook for borrow. Releases the loan funds to the borrower. Caller must be the LoanDesk. 
     Loan metadata is passed along as call arguments to avoid reentry callbacks to the LoanDesk._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan which has just been borrowed |
| borrower | address | Address of the borrower |
| amount | uint256 | Loan principal amount |
| apr | uint16 | Loan apr |

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
using the pool staker's earnings and/or staked funds. If these funds are not sufficient, the lenders will
share the loss._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan to close |
| apr | uint16 | Loan apr |
| amountRepaid | uint256 | Amount repaid based on outstanding payment carry |
| remainingDifference | uint256 | Principal amount remaining to be resolved to close the loan |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Amount reimbursed by the pool staker funds |

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

View indicating whether or not a given loan amount can be offered.

_Hook for checking if the lending pool can provide liquidity for the total offered loans amount._

| Name | Type | Description |
| ---- | ---- | ----------- |
| totalOfferedAmount | uint256 | Total sum of offered loan amount including outstanding offers |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the pool has sufficient lending liquidity, false otherwise |

### canOpen

```solidity
function canOpen() internal view returns (bool)
```

Indicates whether or not the contract can be opened in it's current state.

_Overrides a hook in SaplingStakerContext._

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the conditions to open are met, false otherwise. |

