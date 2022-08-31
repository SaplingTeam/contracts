# Solidity API

## SaplingPoolContext

Provides common pool functionality with lender deposits, manager's first loss capital staking,
        and reward distribution.

### poolToken

```solidity
address poolToken
```

Address of an ERC20 token managed and issued by the pool

### liquidityToken

```solidity
address liquidityToken
```

Address of an ERC20 liquidity token accepted by the pool

### tokenDecimals

```solidity
uint8 tokenDecimals
```

tokenDecimals value retrieved from the liquidity token contract upon contract construction

### ONE_TOKEN

```solidity
uint256 ONE_TOKEN
```

A value representing 1.0 token amount, padded with zeros for decimals

### tokenBalance

```solidity
uint256 tokenBalance
```

Total liquidity tokens currently held by this contract

### poolFundsLimit

```solidity
uint256 poolFundsLimit
```

MAX amount of liquidity tokens allowed in the pool based on staked assets

### poolFunds

```solidity
uint256 poolFunds
```

Current amount of liquidity tokens in the pool, including both liquid and allocated funds

### poolLiquidity

```solidity
uint256 poolLiquidity
```

Current amount of liquid tokens, available to for pool strategies or withdrawals

### allocatedFunds

```solidity
uint256 allocatedFunds
```

Current funds allocated for pool strategies

### strategizedFunds

```solidity
uint256 strategizedFunds
```

Current funds committed to strategies such as borrowing or investing

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

### exitFeePercent

```solidity
uint256 exitFeePercent
```

exit fee percentage

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

### protocolFeePercent

```solidity
uint16 protocolFeePercent
```

Percentage of paid interest to be allocated as protocol fee

### MAX_PROTOCOL_FEE_PERCENT

```solidity
uint16 MAX_PROTOCOL_FEE_PERCENT
```

An upper bound for percentage of paid interest to be allocated as protocol fee

### nonUserRevenues

```solidity
mapping(address => uint256) nonUserRevenues
```

Protocol revenues of non-user addresses

### weightedAvgStrategyAPR

```solidity
uint256 weightedAvgStrategyAPR
```

Weighted average loan APR on the borrowed funds

### nextStrategyId

```solidity
uint256 nextStrategyId
```

Strategy id generator counter

### UnstakedLoss

```solidity
event UnstakedLoss(uint256 amount)
```

Event for when the lender capital is lost due to defaults

### StakedAssetsDepleted

```solidity
event StakedAssetsDepleted()
```

Event for when the Manager's staked assets are depleted due to defaults

### constructor

```solidity
constructor(address _poolToken, address _liquidityToken, address _governance, address _treasury, address _manager) internal
```

Creates a SaplingPoolContext.

_Addresses must not be 0._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _poolToken | address | ERC20 token contract address to be used as the pool issued token. |
| _liquidityToken | address | ERC20 token contract address to be used as pool liquidity currency. |
| _governance | address | Governance address |
| _treasury | address | Treasury wallet address |
| _manager | address | Manager address |

### setTargetStakePercent

```solidity
function setTargetStakePercent(uint16 _targetStakePercent) external
```

Set the target stake percent for the pool.

__targetStakePercent must be inclusively between 0 and ONE_HUNDRED_PERCENT.
     Caller must be the governance._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _targetStakePercent | uint16 | New target stake percent. |

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

__protocolEarningPercent must be inclusively between 0 and MAX_PROTOCOL_FEE_PERCENT.
     Caller must be the governance._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _protocolEarningPercent | uint16 | new protocol earning percent. |

### setManagerEarnFactorMax

```solidity
function setManagerEarnFactorMax(uint16 _managerEarnFactorMax) external
```

Set an upper bound for the manager's earn factor percent.

__managerEarnFactorMax must be greater than or equal to ONE_HUNDRED_PERCENT. If the current earn factor is
     greater than the new maximum, then the current earn factor is set to the new maximum.
     Caller must be the governance._

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

### deposit

```solidity
function deposit(uint256 amount) external
```

Deposit liquidity tokens to the pool. Depositing liquidity tokens will mint an equivalent amount of pool
        tokens and transfer it to the caller. Exact exchange rate depends on the current pool state.

_Deposit amount must be non zero and not exceed amountDepositable().
     An appropriate spend limit must be present at the token contract.
     Caller must not be any of: manager, protocol, governance._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Liquidity token amount to deposit. |

### withdraw

```solidity
function withdraw(uint256 amount) external
```

Withdraw liquidity tokens from the pool. Withdrawals redeem equivalent amount of the caller's pool tokens
        by burning the tokens in question.
        Exact exchange rate depends on the current pool state.

_Withdrawal amount must be non zero and not exceed amountWithdrawable()._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Liquidity token amount to withdraw. |

### stake

```solidity
function stake(uint256 amount) external
```

Stake liquidity tokens into the pool. Staking liquidity tokens will mint an equivalent amount of pool
        tokens and lock them in the pool. Exact exchange rate depends on the current pool state.

_Caller must be the manager.
     Stake amount must be non zero.
     An appropriate spend limit must be present at the token contract._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Liquidity token amount to stake. |

### unstake

```solidity
function unstake(uint256 amount) external
```

Unstake liquidity tokens from the pool. Unstaking redeems equivalent amount of the caller's pool tokens
        locked in the pool by burning the tokens in question.

_Caller must be the manager.
     Unstake amount must be non zero and not exceed amountUnstakable()._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Liquidity token amount to unstake. |

### withdrawRevenue

```solidity
function withdrawRevenue() external
```

Withdraws protocol revenue belonging to the caller.

_revenueBalanceOf(msg.sender) must be greater than 0.
     Caller's all accumulated earnings will be withdrawn.
     Protocol earnings are represented in liquidity tokens._

### amountDepositable

```solidity
function amountDepositable() external view returns (uint256)
```

Check liquidity token amount depositable by lenders at this time.

_Return value depends on the pool state rather than caller's balance._

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Max amount of tokens depositable to the pool. |

### amountWithdrawable

```solidity
function amountWithdrawable(address wallet) external view returns (uint256)
```

Check liquidity token amount withdrawable by the caller at this time.

_Return value depends on the callers balance, and is limited by pool liquidity._

| Name | Type | Description |
| ---- | ---- | ----------- |
| wallet | address | Address of the wallet to check the withdrawable balance of. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Max amount of tokens withdrawable by the caller. |

### balanceStaked

```solidity
function balanceStaked() external view returns (uint256)
```

Check the manager's staked liquidity token balance in the pool.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Liquidity token balance of the manager's stake. |

### revenueBalanceOf

```solidity
function revenueBalanceOf(address wallet) external view returns (uint256)
```

Check the special addresses' revenue from the protocol.

_This method is useful for manager and protocol addresses.
     Calling this method for a non-protocol associated addresses will return 0._

| Name | Type | Description |
| ---- | ---- | ----------- |
| wallet | address | Address of the wallet to check the earnings balance of. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Accumulated liquidity token revenue of the wallet from the protocol. |

### currentLenderAPY

```solidity
function currentLenderAPY() external view returns (uint16)
```

Estimated lender APY given the current pool state.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint16 | Estimated current lender APY |

### projectedLenderAPY

```solidity
function projectedLenderAPY(uint16 strategyRate, uint256 _avgStrategyAPR) external view returns (uint16)
```

Projected lender APY given the current pool state and a specific strategy rate and an average apr.

_Represent percentage parameter values in contract specific format._

| Name | Type | Description |
| ---- | ---- | ----------- |
| strategyRate | uint16 | Percentage of pool funds projected to be used in strategies. |
| _avgStrategyAPR | uint256 |  |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint16 | Projected lender APY |

### balanceOf

```solidity
function balanceOf(address wallet) public view returns (uint256)
```

Check wallet's liquidity token balance in the pool. This balance includes deposited balance and acquired
        yield. This balance does not included staked balance, leveraged revenue or protocol revenue.

| Name | Type | Description |
| ---- | ---- | ----------- |
| wallet | address | Address of the wallet to check the balance of. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Liquidity token balance of the wallet in this pool. |

### amountUnstakable

```solidity
function amountUnstakable() public view returns (uint256)
```

Check liquidity token amount unstakable by the manager at this time.

_Return value depends on the manager's stake balance and targetStakePercent, and is limited by pool
     liquidity._

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Max amount of tokens unstakable by the manager. |

### strategyLiquidity

```solidity
function strategyLiquidity() public view returns (uint256)
```

Current liquidity available for pool strategies such as lending or investing.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Strategy liquidity amount. |

### getNextStrategyId

```solidity
function getNextStrategyId() internal returns (uint256)
```

_Generator for next strategy id. i.e. loan, investment._

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Next available id. |

### enterPool

```solidity
function enterPool(uint256 amount) internal returns (uint256)
```

_Internal method to enter the pool with a liquidity token amount.
     With the exception of the manager's call, amount must not exceed amountDepositable().
     If the caller is the pool manager, entered funds are considered staked.
     New pool tokens are minted in a way that will not influence the current share price.
Shares are equivalent to pool tokens and are represented by them._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Liquidity token amount to add to the pool on behalf of the caller. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Amount of pool tokens minted and allocated to the caller. |

### exitPool

```solidity
function exitPool(uint256 amount) internal returns (uint256)
```

_Internal method to exit the pool with a liquidity token amount.
     Amount must not exceed amountWithdrawable() for non managers, and amountUnstakable() for the manager.
     If the caller is the pool manager, exited funds are considered unstaked.
     Pool tokens are burned in a way that will not influence the current share price.
Shares are equivalent to pool tokens and are represented by them._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Liquidity token amount to withdraw from the pool on behalf of the caller. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Amount of pool tokens burned and taken from the caller. |

### updatePoolLimit

```solidity
function updatePoolLimit() internal
```

_Internal method to update the pool funds limit based on the staked funds._

### sharesToTokens

```solidity
function sharesToTokens(uint256 shares) internal view returns (uint256)
```

Get liquidity token value of shares.

_Shares are equivalent to pool tokens and are represented by them._

| Name | Type | Description |
| ---- | ---- | ----------- |
| shares | uint256 | Amount of shares |

### tokensToShares

```solidity
function tokensToShares(uint256 tokens) internal view returns (uint256)
```

Get a share value of liquidity tokens.

_Shares are equivalent to pool tokens and are represented by them._

| Name | Type | Description |
| ---- | ---- | ----------- |
| tokens | uint256 | Amount of liquidity tokens. |

### strategyCount

```solidity
function strategyCount() internal view returns (uint256)
```

_All time count of created strategies. i.e. Loans and investments_

### lenderAPY

```solidity
function lenderAPY(uint256 _strategizedFunds, uint256 _avgStrategyAPR) internal view returns (uint16)
```

Lender APY given the current pool state, a specific strategized funds, and an average apr.

_Represent percentage parameter values in contract specific format._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _strategizedFunds | uint256 | Pool funds to be borrowed annually. |
| _avgStrategyAPR | uint256 |  |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint16 | Lender APY |

### isPoolFunctional

```solidity
function isPoolFunctional() internal view returns (bool)
```

Check if the pool is functional based on the current stake levels.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the staked funds provide at least a minimum ratio to the pool funds, False otherwise. |

### authorizedOnInactiveManager

```solidity
function authorizedOnInactiveManager(address caller) internal view returns (bool)
```

_Implementation of the abstract hook in SaplingManagedContext.
     Governance, protocol wallet addresses and lenders with at least 1.00 liquidity tokens are authorised to take
     certain actions when the manager is inactive._

### canClose

```solidity
function canClose() internal view returns (bool)
```

_Implementation of the abstract hook in SaplingManagedContext.
     Pool can be close when no funds remain committed to strategies._

