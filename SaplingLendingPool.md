# Solidity API

## SaplingLendingPool

_Extends SaplingPoolContext with lending strategy._

### loanDesk

```solidity
address loanDesk
```

Address of the loan desk contract

### treasury

```solidity
address treasury
```

Address where the protocol fees are sent to

### yieldSettledDay

```solidity
uint256 yieldSettledDay
```

unix day up to which the yield has been settled.

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

### constructor

```solidity
constructor() public
```

### initialize

```solidity
function initialize(address _poolToken, address _liquidityToken, address _accessControl, address _treasury, address _stakerAddress) public
```

Creates a Sapling pool.

_Addresses must not be 0._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _poolToken | address | ERC20 token contract address to be used as the pool issued token. |
| _liquidityToken | address | ERC20 token contract address to be used as pool liquidity currency. |
| _accessControl | address | Access control contract |
| _treasury | address | Address where the protocol fees are sent to |
| _stakerAddress | address | Staker address |

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

### setTreasury

```solidity
function setTreasury(address _treasury) external
```

Designates a new treasury address for the pool.

_Protocol fees will be sent to this address on every interest payment._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _treasury | address | New treasury address |

### settleYield

```solidity
function settleYield() public
```

Settle pending yield.

_Calculates interest due since last update and increases preSettledYield,
     taking into account the protocol fee and the staker earnings._

### onOfferAllocate

```solidity
function onOfferAllocate(uint256 amount) external
```

_Hook for a new loan offer. Caller must be the LoanDesk._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Amount to be allocated for loan offers. |

### onOfferDeallocate

```solidity
function onOfferDeallocate(uint256 amount) external
```

_Hook for a loan offer amount update. Amount update can be due to offer update or
     cancellation. Caller must be the LoanDesk._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Previously allocated amount being returned. |

### onRepay

```solidity
function onRepay(uint256 loanId, address borrower, address payer, uint256 transferAmount, uint256 interestPayable, uint256 borrowedTime) external
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
| borrowedTime | uint256 | Block timestamp when this loan was borrowed |

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

View indicating whether or not a given loan amount can be offered.

_Hook for checking if the lending pool can provide liquidity for the total offered loans amount._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Amount to check for new loan allocation |

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

### canClose

```solidity
function canClose() internal view returns (bool)
```

_Implementation of the abstract hook in SaplingManagedContext.
     Pool can be close when no funds remain committed to strategies._

### strategizedFunds

```solidity
function strategizedFunds() internal view returns (uint256)
```

Current amount of liquidity tokens in strategies, including both allocated and committed
        but excluding pending yield.

_Overrides the same method in the base contract._

### currentAPY

```solidity
function currentAPY() external view returns (struct IPoolContext.APYBreakdown)
```

Estimate APY breakdown given the current pool state.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | struct IPoolContext.APYBreakdown | Current APY breakdown |

### breakdownEarnings

```solidity
function breakdownEarnings(uint256 interestAmount) public view returns (uint256, uint256, uint256)
```

_Breaks down an interest amount to shareholder yield, protocol fee and staker earnings._

| Name | Type | Description |
| ---- | ---- | ----------- |
| interestAmount | uint256 | Interest amount paid by the borrower |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Amounts for (shareholderYield, protocolFee, stakerEarnings) |
| [1] | uint256 |  |
| [2] | uint256 |  |

