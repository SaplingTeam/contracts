# Solidity API

## ManagedLendingPool

Provides the basics of a managed lending pool.

_This contract is abstract. Extend the contract to implement an intended pool functionality._

### manager

```solidity
address manager
```

Pool manager address

### protocolWallet

```solidity
address protocolWallet
```

Protocol wallet address

### token

```solidity
address token
```

Address of an ERC20 token used by the pool

### tokenDecimals

```solidity
uint8 tokenDecimals
```

### ONE_TOKEN

```solidity
uint256 ONE_TOKEN
```

### tokenBalance

```solidity
uint256 tokenBalance
```

Total tokens currently held by this contract

### poolFundsLimit

```solidity
uint256 poolFundsLimit
```

MAX amount of tokens allowed in the pool based on staked assets

### poolFunds

```solidity
uint256 poolFunds
```

Current amount of tokens in the pool, including both liquid and borrowed funds

### poolLiquidity

```solidity
uint256 poolLiquidity
```

Current amount of liquid tokens, available to lend/withdraw/borrow

### totalPoolShares

```solidity
uint256 totalPoolShares
```

Total pool shares present

### stakedShares

```solidity
uint256 stakedShares
```

Manager&#x27;s staked shares

### targetStakePercent

```solidity
uint16 targetStakePercent
```

Target percentage ratio of staked shares to total shares

### poolShares

```solidity
mapping(address &#x3D;&gt; uint256) poolShares
```

Pool shares of wallets

### protocolEarnings

```solidity
mapping(address &#x3D;&gt; uint256) protocolEarnings
```

Protocol earnings of wallets

### PERCENT_DECIMALS

```solidity
uint16 PERCENT_DECIMALS
```

Number of decimal digits in integer percent values used across the contract

### ONE_HUNDRED_PERCENT

```solidity
uint16 ONE_HUNDRED_PERCENT
```

A constant representing 100%

### protocolEarningPercent

```solidity
uint16 protocolEarningPercent
```

Percentage of paid interest to be allocated as protocol earnings

### managerLeveragedEarningPercent

```solidity
uint16 managerLeveragedEarningPercent
```

Manager&#x27;s leveraged earn factor represented as a percentage

### managerExcessLeverageComponent

```solidity
uint256 managerExcessLeverageComponent
```

Part of the managers leverage factor, earnings of witch will be allocated for the manager as protocol earnings.
This value is always equal to (managerLeveragedEarningPercent - ONE_HUNDRED_PERCENT)

### UnstakedLoss

```solidity
event UnstakedLoss(uint256 amount)
```

### StakedAssetsDepleted

```solidity
event StakedAssetsDepleted()
```

### onlyManager

```solidity
modifier onlyManager()
```

### constructor

```solidity
constructor(address tokenAddress, address protocol) internal
```

Create a managed lending pool.

_msg.sender will be assigned as the manager of the created pool._

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokenAddress | address | ERC20 token contract address to be used as main pool liquid currency. |
| protocol | address | Address of a wallet to accumulate protocol earnings. |

### protocolEarningsOf

```solidity
function protocolEarningsOf(address wallet) external view returns (uint256)
```

Check the special addresses&#x27; earnings from the protocol.

_This method is useful for manager and protocol addresses. 
     Calling this method for a non-protocol associated addresses will return 0._

| Name | Type | Description |
| ---- | ---- | ----------- |
| wallet | address | Address of the wallet to check the earnings balance of. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Accumulated earnings of the wallet from the protocol. |

### withdrawProtocolEarnings

```solidity
function withdrawProtocolEarnings() external
```

Withdraws protocol earnings belonging to the caller.

_protocolEarningsOf(msg.sender) must be greater than 0.
     Caller&#x27;s all accumulated earnings will be withdrawn._

### poolCanLend

```solidity
function poolCanLend() public view returns (bool)
```

Check if the pool can lend based on the current stake levels.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the staked funds provide at least a minimum ratio to the pool funds, False otherwise. |

### chargeTokensFrom

```solidity
function chargeTokensFrom(address wallet, uint256 amount) internal
```

_Internal method to charge tokens from a wallet.
     An appropriate approval must be present._

| Name | Type | Description |
| ---- | ---- | ----------- |
| wallet | address | Address to charge tokens from. |
| amount | uint256 | Token amount to charge. |

### enterPool

```solidity
function enterPool(uint256 amount) internal returns (uint256)
```

_Internal method to enter the pool with a token amount.
     With the exception of the manager&#x27;s call, amount must not exceed amountDepositable().
     If the caller is the pool manager, entered funds are considered staked.
     New shares are minted in a way that will not influence the current share price._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | A token amount to add to the pool on behalf of the caller. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Amount of shares minted and allocated to the caller. |

### exitPool

```solidity
function exitPool(uint256 amount) internal returns (uint256)
```

_Internal method to exit the pool with a token amount.
     Amount must not exceed amountWithdrawable() for non managers, and amountUnstakable() for the manager.
     If the caller is the pool manager, exited funds are considered unstaked.
     Shares are burned in a way that will not influence the current share price._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | A token amount to withdraw from the pool on behalf of the caller. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Amount of shares burned and taken from the caller. |

### burnShares

```solidity
function burnShares(address wallet, uint256 shares) internal
```

_Internal method to burn shares of a wallet._

| Name | Type | Description |
| ---- | ---- | ----------- |
| wallet | address | Address to burn shares of. |
| shares | uint256 | Share amount to burn. |

### updatePoolLimit

```solidity
function updatePoolLimit() internal
```

_Internal method to update pool limit based on staked funds._

### sharesToTokens

```solidity
function sharesToTokens(uint256 shares) internal view returns (uint256)
```

Get a token value of shares.

| Name | Type | Description |
| ---- | ---- | ----------- |
| shares | uint256 | Amount of shares |

### tokensToShares

```solidity
function tokensToShares(uint256 tokens) internal view returns (uint256)
```

Get a share value of tokens.

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokens | uint256 | Amount of tokens |

### multiplyByFraction

```solidity
function multiplyByFraction(uint256 a, uint256 b, uint256 c) internal pure returns (uint256)
```

Do a multiplication of a value by a fraction.

| Name | Type | Description |
| ---- | ---- | ----------- |
| a | uint256 | value to be multiplied |
| b | uint256 | numerator of the fraction |
| c | uint256 | denominator of the fraction |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Integer value of (a*b)/c if (a*b) does not overflow, else a*(b/c) |

