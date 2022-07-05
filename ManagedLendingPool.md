# Solidity API

## ManagedLendingPool

Provides the basics of a Sapling lending pool.

_This contract is abstract. Extend the contract to implement an intended pool functionality._

### protocol

```solidity
address protocol
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

tokenDecimals value retrieved from the token contract upon contract construction

### ONE_TOKEN

```solidity
uint256 ONE_TOKEN
```

A value representing 1.0 token amount, padded with zeros for decimals

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

### borrowedFunds

```solidity
uint256 borrowedFunds
```

Total funds borrowed at this time, including both withdrawn and allocated for withdrawal.

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

### targetLiquidityPercent

```solidity
uint16 targetLiquidityPercent
```

Target percentage of pool funds to keep liquid.

### poolShares

```solidity
mapping(address &#x3D;&gt; uint256) poolShares
```

Pool shares of wallets

### lockedShares

```solidity
mapping(address &#x3D;&gt; uint256) lockedShares
```

Locked shares of wallets (i.e. staked shares)

### protocolEarnings

```solidity
mapping(address &#x3D;&gt; uint256) protocolEarnings
```

Protocol earnings of wallets

### totalRequestedLiquidity

```solidity
uint256 totalRequestedLiquidity
```

Total amount of requested withdrawal liquidity

### requestedLiquidity

```solidity
mapping(address &#x3D;&gt; uint256) requestedLiquidity
```

Withdrawal liquidity requests by address

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

### MAX_PROTOCOL_EARNING_PERCENT

```solidity
uint16 MAX_PROTOCOL_EARNING_PERCENT
```

Percentage of paid interest to be allocated as protocol earnings

### managerEarnFactor

```solidity
uint16 managerEarnFactor
```

Manager&#x27;s leveraged earn factor represented as a percentage

### managerEarnFactorMax

```solidity
uint16 managerEarnFactorMax
```

Governance set upper bound for the manager&#x27;s leveraged earn factor

### managerExcessLeverageComponent

```solidity
uint256 managerExcessLeverageComponent
```

Part of the managers leverage factor, earnings of witch will be allocated for the manager as protocol earnings.
This value is always equal to (managerEarnFactor - ONE_HUNDRED_PERCENT)

### EARLY_EXIT_COOLDOWN

```solidity
uint256 EARLY_EXIT_COOLDOWN
```

Max cooldown period for early exit

### exitFeePercent

```solidity
uint256 exitFeePercent
```

Early exit fee percentage

### earlyExitDeadlines

```solidity
mapping(address &#x3D;&gt; uint256) earlyExitDeadlines
```

Early exit deadlines by wallets

### UnstakedLoss

```solidity
event UnstakedLoss(uint256 amount)
```

### StakedAssetsDepleted

```solidity
event StakedAssetsDepleted()
```

### ProtocolWalletTransferred

```solidity
event ProtocolWalletTransferred(address from, address to)
```

Event emitted when a new protocol wallet is set

### constructor

```solidity
constructor(address _token, address _governance, address _protocol, address _manager) internal
```

Create a managed lending pool.

_msg.sender will be assigned as the manager of the created pool._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _token | address | ERC20 token contract address to be used as main pool liquid currency. |
| _governance | address | Address of the protocol governance. |
| _protocol | address | Address of a wallet to accumulate protocol earnings. |
| _manager | address | Address of the pool manager |

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

### setTargetStakePercent

```solidity
function setTargetStakePercent(uint16 _targetStakePercent) external
```

Set the target stake percent for the pool.

__targetStakePercent must be inclusively between 0 and ONE_HUNDRED_PERCENT.
     Caller must be the governance._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _targetStakePercent | uint16 | new target stake percent. |

### setTargetLiquidityPercent

```solidity
function setTargetLiquidityPercent(uint16 _targetLiquidityPercent) external
```

Set the target liquidity percent for the pool.

__targetLiquidityPercent must be inclusively between 0 and ONE_HUNDRED_PERCENT.
     Caller must be the manager._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _targetLiquidityPercent | uint16 | new target liquidity percent. |

### setProtocolEarningPercent

```solidity
function setProtocolEarningPercent(uint16 _protocolEarningPercent) external
```

Set the protocol earning percent for the pool.

__protocolEarningPercent must be inclusively between 0 and MAX_PROTOCOL_EARNING_PERCENT.
     Caller must be the governance._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _protocolEarningPercent | uint16 | new protocol earning percent. |

### setManagerEarnFactorMax

```solidity
function setManagerEarnFactorMax(uint16 _managerEarnFactorMax) external
```

Set an upper bound for the manager&#x27;s earn factor percent.

__managerEarnFactorMax must be greater than or equal to ONE_HUNDRED_PERCENT.
     Caller must be the governance.
     If the current earn factor is greater than the new maximum, then the current earn factor is set to the new maximum._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _managerEarnFactorMax | uint16 | new maximum for manager&#x27;s earn factor. |

### setManagerEarnFactor

```solidity
function setManagerEarnFactor(uint16 _managerEarnFactor) external
```

Set the manager&#x27;s earn factor percent.

__managerEarnFactorMax must be inclusively between ONE_HUNDRED_PERCENT and managerEarnFactorMax.
     Caller must be the manager._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _managerEarnFactor | uint16 | new manager&#x27;s earn factor. |

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

### canClose

```solidity
function canClose() internal view returns (bool)
```

### authorizedOnInactiveManager

```solidity
function authorizedOnInactiveManager(address caller) internal view returns (bool)
```

