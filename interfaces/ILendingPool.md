# Solidity API

## ILendingPool

_This interface has all LendingPool events, structs, and LoanDesk function hooks._

### LoanDeskSet

```solidity
event LoanDeskSet(address prevAddress, address newAddress)
```

Event for when a new loan desk is set

### TreasurySet

```solidity
event TreasurySet(address prevAddress, address newAddress)
```

Setter event

### ProtocolRevenue

```solidity
event ProtocolRevenue(address treasury, uint256 amount)
```

Event for when the protocol revenue is collected

### LoanDefaulted

```solidity
event LoanDefaulted(uint256 loanId, address borrower, uint256 stakerLoss, uint256 lenderLoss)
```

Event for when a loan is defaulted

### OfferLiquidityAllocated

```solidity
event OfferLiquidityAllocated(uint256 amount)
```

Event for when a liquidity is allocated for a loan offer

### OfferLiquidityDeallocated

```solidity
event OfferLiquidityDeallocated(uint256 amount)
```

Event for when the liquidity is removed from a loan offer

### LoanRepaymentProcessed

```solidity
event LoanRepaymentProcessed(uint256 loanId, address borrower, address payer, uint256 amount, uint256 interestAmount)
```

Event for when a loan repayments are made

### onOfferAllocate

```solidity
function onOfferAllocate(uint256 amount) external
```

_Hook for a new loan offer.
     Caller must be the LoanDesk._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Amount to be allocated for loan offers. |

### onOfferDeallocate

```solidity
function onOfferDeallocate(uint256 amount) external
```

_Hook for a loan offer amount update._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Previously allocated amount being returned. |

### onRepay

```solidity
function onRepay(uint256 loanId, address borrower, address payer, uint256 transferAmount, uint256 interestPayable) external
```

_Hook for repayments. Caller must be the LoanDesk. 
     
     Parameters besides the loanId exists simply to avoid rereading it from the caller via additional inter 
     contract call. Avoiding loop call reduces gas, contract bytecode size, and reduces the risk of reentrancy._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan which has just been borrowed |
| borrower | address | Borrower address |
| payer | address | Actual payer address |
| transferAmount | uint256 | Amount chargeable |
| interestPayable | uint256 | Amount of interest paid, this value is already included in the payment amount |

### onDefault

```solidity
function onDefault(uint256 loanId, uint256 principalLoss, uint256 yieldLoss) external returns (uint256, uint256)
```

_Hook for defaulting a loan. Caller must be the LoanDesk. Defaulting a loan will cover the loss using 
the staked funds. If these funds are not sufficient, the lenders will share the loss._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | ID of the loan to default |
| principalLoss | uint256 | Unpaid principal amount to resolve |
| yieldLoss | uint256 | Unpaid yield amount to resolve |

### canOffer

```solidity
function canOffer(uint256 amount) external view returns (bool)
```

View indicating whether or not a given loan can be offered by the staker.

_Hook for checking if the lending pool can provide liquidity for the total offered loans amount._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Amount to check for new loan allocation |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the pool has sufficient lending liquidity, false otherwise |

