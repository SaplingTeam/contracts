# Solidity API

## SaplingProtocolPool

### poolToken

```solidity
address poolToken
```

### liquidityToken

```solidity
address liquidityToken
```

Address of an ERC20 liquidity token accepted by the pool

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

### investedFunds

```solidity
uint256 investedFunds
```

Total funds borrowed at this time, including both withdrawn and allocated for withdrawal.

### weightedAvgInvestAPR

```solidity
uint256 weightedAvgInvestAPR
```

Weighted average loan APR on the borrowed funds

### totalPoolShares

```solidity
uint256 totalPoolShares
```

Total pool shares present

### stakedShares

```solidity
uint256 stakedShares
```

Manager's staked shares

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

### lockedShares

```solidity
mapping(address => uint256) lockedShares
```

Locked shares of wallets (i.e. staked shares)

### protocolEarnings

```solidity
mapping(address => uint256) protocolEarnings
```

Protocol earnings of wallets

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

Manager's leveraged earn factor represented as a percentage

### managerEarnFactorMax

```solidity
uint16 managerEarnFactorMax
```

Governance set upper bound for the manager's leveraged earn factor

### managerExcessLeverageComponent

```solidity
uint256 managerExcessLeverageComponent
```

Part of the managers leverage factor, earnings of witch will be allocated for the manager as protocol earnings.
This value is always equal to (managerEarnFactor - ONE_HUNDRED_PERCENT)

### exitFeePercent

```solidity
uint256 exitFeePercent
```

exit fee percentage

### ProtocolWalletTransferred

```solidity
event ProtocolWalletTransferred(address from, address to)
```

### UnstakedLoss

```solidity
event UnstakedLoss(uint256 amount)
```

### StakedAssetsDepleted

```solidity
event StakedAssetsDepleted()
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

### deposit

```solidity
function deposit(uint256 amount) external
```

Deposit tokens to the pool.

_Deposit amount must be non zero and not exceed amountDepositable().
     An appropriate spend limit must be present at the token contract.
     Caller must not be any of: manager, protocol, current borrower._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Token amount to deposit. |

### withdraw

```solidity
function withdraw(uint256 amount) external
```

Withdraw tokens from the pool.

_Withdrawal amount must be non zero and not exceed amountWithdrawable().
     Caller must not be any of: manager, protocol, current borrower._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | token amount to withdraw. |

### stake

```solidity
function stake(uint256 amount) external
```

Stake tokens into the pool.

_Caller must be the manager.
     Stake amount must be non zero.
     An appropriate spend limit must be present at the token contract._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Token amount to stake. |

### unstake

```solidity
function unstake(uint256 amount) external
```

Unstake tokens from the pool.

_Caller must be the manager.
     Unstake amount must be non zero and not exceed amountUnstakable()._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Token amount to unstake. |

### withdrawProtocolEarnings

```solidity
function withdrawProtocolEarnings() external
```

Withdraws protocol earnings belonging to the caller.

_protocolEarningsOf(msg.sender) must be greater than 0.
     Caller's all accumulated earnings will be withdrawn._

### invest

```solidity
function invest(address lendingPool, uint256 liquidityTokenAmount) external
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

Set an upper bound for the manager's earn factor percent.

__managerEarnFactorMax must be greater than or equal to ONE_HUNDRED_PERCENT.
     Caller must be the governance.
     If the current earn factor is greater than the new maximum, then the current earn factor is set to the new maximum._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _managerEarnFactorMax | uint16 | new maximum for manager's earn factor. |

### setManagerEarnFactor

```solidity
function setManagerEarnFactor(uint16 _managerEarnFactor) external
```

Set the manager's earn factor percent.

__managerEarnFactorMax must be inclusively between ONE_HUNDRED_PERCENT and managerEarnFactorMax.
     Caller must be the manager._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _managerEarnFactor | uint16 | new manager's earn factor. |

### amountDepositable

```solidity
function amountDepositable() external view returns (uint256)
```

Check token amount depositable by lenders at this time.

_Return value depends on the pool state rather than caller's balance._

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Max amount of tokens depositable to the pool. |

### amountWithdrawable

```solidity
function amountWithdrawable(address wallet) external view returns (uint256)
```

Check token amount withdrawable by the caller at this time.

_Return value depends on the callers balance, and is limited by pool liquidity._

| Name | Type | Description |
| ---- | ---- | ----------- |
| wallet | address | Address of the wallet to check the withdrawable balance of. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Max amount of tokens withdrawable by msg.sender. |

### currentLenderAPY

```solidity
function currentLenderAPY() external view returns (uint16)
```

Estimated lender APY given the current pool state.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint16 | Estimated lender APY |

### projectedLenderAPY

```solidity
function projectedLenderAPY(uint16 investRate) external view returns (uint16)
```

Projected lender APY given the current pool state and a specific borrow rate.

_represent borrowRate in contract specific percentage format_

| Name | Type | Description |
| ---- | ---- | ----------- |
| investRate | uint16 | percentage of pool funds projected to be borrowed annually |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint16 | Projected lender APY |

### balanceOf

```solidity
function balanceOf(address wallet) public view returns (uint256)
```

Check wallet's token balance in the pool. Balance includes acquired earnings.

| Name | Type | Description |
| ---- | ---- | ----------- |
| wallet | address | Address of the wallet to check the balance of. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Token balance of the wallet in this pool. |

### unlockedBalanceOf

```solidity
function unlockedBalanceOf(address wallet) public view returns (uint256)
```

Check wallet's unlocked token balance in the pool. Balance includes acquired earnings.

| Name | Type | Description |
| ---- | ---- | ----------- |
| wallet | address | Address of the wallet to check the unlocked balance of. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Unlocked token balance of the wallet in this pool. |

### balanceStaked

```solidity
function balanceStaked() public view returns (uint256)
```

Check the manager's staked token balance in the pool.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Token balance of the manager's stake. |

### amountUnstakable

```solidity
function amountUnstakable() public view returns (uint256)
```

Check token amount unstakable by the manager at this time.

_Return value depends on the manager's stake balance, and is limited by pool liquidity._

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Max amount of tokens unstakable by the manager. |

### poolCanLend

```solidity
function poolCanLend() public view returns (bool)
```

Check if the pool can lend based on the current stake levels.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the staked funds provide at least a minimum ratio to the pool funds, False otherwise. |

### lenderAPY

```solidity
function lenderAPY(uint256 _investedFunds) private view returns (uint16)
```

Lender APY given the current pool state and a specific borrowed funds amount.

_represent borrowRate in contract specific percentage format_

| Name | Type | Description |
| ---- | ---- | ----------- |
| _investedFunds | uint256 | pool funds to be borrowed annually |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint16 | Lender APY |

### protocolEarningsOf

```solidity
function protocolEarningsOf(address wallet) external view returns (uint256)
```

Check the special addresses' earnings from the protocol.

_This method is useful for manager and protocol addresses. 
     Calling this method for a non-protocol associated addresses will return 0._

| Name | Type | Description |
| ---- | ---- | ----------- |
| wallet | address | Address of the wallet to check the earnings balance of. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Accumulated earnings of the wallet from the protocol. |

### enterPool

```solidity
function enterPool(uint256 amount) internal returns (uint256)
```

_Internal method to enter the pool with a token amount.
     With the exception of the manager's call, amount must not exceed amountDepositable().
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

