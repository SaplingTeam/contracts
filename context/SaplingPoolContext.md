# Solidity API

## SaplingPoolContext

Provides common pool functionality with lender deposits, first loss capital staking, and reward distribution.

### tokenConfig

```solidity
struct IPoolContext.TokenConfig tokenConfig
```

Tokens configuration

### config

```solidity
struct IPoolContext.PoolConfig config
```

Pool configuration

### balances

```solidity
struct IPoolContext.PoolBalance balances
```

Key pool balances

### withdrawalRequestStates

```solidity
mapping(address => struct IPoolContext.WithdrawalRequestState) withdrawalRequestStates
```

Per user withdrawal request states

### withdrawalQueue

```solidity
struct WithdrawalRequestQueue.LinkedMap withdrawalQueue
```

Withdrawal request queue

### noWithdrawalRequests

```solidity
modifier noWithdrawalRequests()
```

### __SaplingPoolContext_init

```solidity
function __SaplingPoolContext_init(address _poolToken, address _liquidityToken, address _accessControl, address _stakerAddress) internal
```

Creates a SaplingPoolContext.

_Addresses must not be 0._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _poolToken | address | ERC20 token contract address to be used as the pool issued token. |
| _liquidityToken | address | ERC20 token contract address to be used as pool liquidity currency. |
| _accessControl | address | Access control contract |
| _stakerAddress | address | Staker address |

### setTargetStakePercent

```solidity
function setTargetStakePercent(uint16 _targetStakePercent) external
```

Set the target stake percent for the pool.

__targetStakePercent must be greater than 0 and less than or equal to SaplingMath.HUNDRED_PERCENT.
     Caller must be the governance._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _targetStakePercent | uint16 | New target stake percent. |

### setTargetLiquidityPercent

```solidity
function setTargetLiquidityPercent(uint16 _targetLiquidityPercent) external
```

Set the target liquidity percent for the pool.

__targetLiquidityPercent must be inclusively between 0 and SaplingMath.HUNDRED_PERCENT.
     Caller must be the staker._

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

### setStakerEarnFactorMax

```solidity
function setStakerEarnFactorMax(uint16 _stakerEarnFactorMax) external
```

Set an upper bound for the staker earn factor percent.

__stakerEarnFactorMax must be greater than or equal to SaplingMath.HUNDRED_PERCENT. If the current
     earn factor is greater than the new maximum, then the current earn factor is set to the new maximum.
     Caller must be the governance._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _stakerEarnFactorMax | uint16 | new maximum for staker earn factor. |

### setStakerEarnFactor

```solidity
function setStakerEarnFactor(uint16 _stakerEarnFactor) external
```

Set the staker earn factor percent.

__stakerEarnFactor must be inclusively between SaplingMath.HUNDRED_PERCENT and stakerEarnFactorMax.
     Caller must be the staker._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _stakerEarnFactor | uint16 | new staker earn factor. |

### deposit

```solidity
function deposit(uint256 amount) external
```

Deposit funds to the pool. Depositing funds will mint an equivalent amount of pool
        tokens and transfer it to the caller. Exact exchange rate depends on the current pool state.

_Deposit amount must be non zero and not exceed amountDepositable().
     An appropriate spend limit must be present at the token contract.
     Caller must not be a user.
     Caller must not have any outstanding withdrawal requests._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Liquidity token amount to deposit. |

### withdraw

```solidity
function withdraw(uint256 amount) public
```

Withdraw funds from the pool. Withdrawals redeem equivalent amount of the caller's pool tokens
        by burning the tokens in question.
        Exact exchange rate depends on the current pool state.

_Withdrawal amount must be non zero and not exceed amountWithdrawable()._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Liquidity token amount to withdraw. |

### requestWithdrawal

```solidity
function requestWithdrawal(uint256 shares) external
```

Request funds for withdrawal by locking in pool shares.

| Name | Type | Description |
| ---- | ---- | ----------- |
| shares | uint256 | Amount of pool tokens to lock. |

### updateWithdrawalRequest

```solidity
function updateWithdrawalRequest(uint256 id, uint256 newShareAmount) external
```

Update a withdrawal request.

_Existing request funds can only be decreased. Minimum request amount rule must be maintained.
     Requested position must belong to the caller._

| Name | Type | Description |
| ---- | ---- | ----------- |
| id | uint256 | ID of the withdrawal request to update. |
| newShareAmount | uint256 | New total pool token amount to be locked in the request. |

### cancelWithdrawalRequest

```solidity
function cancelWithdrawalRequest(uint256 id) external
```

Cancel a withdrawal request.

_Requested position must belong to the caller._

| Name | Type | Description |
| ---- | ---- | ----------- |
| id | uint256 | ID of the withdrawal request to update. |

### fulfillWithdrawalRequests

```solidity
function fulfillWithdrawalRequests(uint256 count) external
```

Fulfill withdrawal requests in batch if liquidity requirements are met.

_Anyone can trigger fulfillment of a withdrawal request.
     
     It is in the interest of the pool to keep the withdrawal requests fulfilled as soon as there is
     liquidity, as unfulfilled requests will keep earning yield but lock liquidity once the liquidity comes in._

| Name | Type | Description |
| ---- | ---- | ----------- |
| count | uint256 | The number of positions to fulfill starting from the head of the queue.         If the count is greater than queue length, then the entire queue is processed. |

### fulfillWithdrawalRequestById

```solidity
function fulfillWithdrawalRequestById(uint256 id) external
```

Fulfill a single arbitrary withdrawal request.

_Anyone can trigger fulfillment of a withdrawal request. Fulfillment is on demand, and other requests 
     in the queue are not processed but their liquidity requirements have to be met._

| Name | Type | Description |
| ---- | ---- | ----------- |
| id | uint256 | ID of the withdrawal request to fulfill |

### fulfillNextWithdrawalRequest

```solidity
function fulfillNextWithdrawalRequest() private
```

_Fulfill a single withdrawal request at the top of the queue._

### fulfillWithdrawalRequest

```solidity
function fulfillWithdrawalRequest(uint256 id) private
```

_Fulfill a single withdrawal request by id._

| Name | Type | Description |
| ---- | ---- | ----------- |
| id | uint256 | ID of the withdrawal request to fulfill |

### stake

```solidity
function stake(uint256 amount) external
```

Stake funds into the pool. Staking funds will mint an equivalent amount of pool
        tokens and lock them in the pool. Exact exchange rate depends on the current pool state.

_Caller must be the staker.
     Stake amount must be non zero.
     An appropriate spend limit must be present at the token contract._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Liquidity token amount to stake. |

### unstake

```solidity
function unstake(uint256 amount) external
```

Unstake funds from the pool. Unstaking redeems equivalent amount of the caller's pool tokens
        locked in the pool by burning the tokens in question.

_Caller must be the staker.
     Unstake amount must be non zero and not exceed amountUnstakable()._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Liquidity token amount to unstake. |

### collectProtocolRevenue

```solidity
function collectProtocolRevenue(uint256 amount) external
```

Withdraw protocol revenue.

_Revenue is in liquidity tokens.
     Caller must have the treasury role._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Liquidity token amount to withdraw. |

### amountDepositable

```solidity
function amountDepositable() public view returns (uint256)
```

Check liquidity token amount depositable by lenders at this time.

_Return value depends on the pool state rather than caller's balance._

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Max amount of tokens depositable to the pool. |

### amountWithdrawable

```solidity
function amountWithdrawable(address wallet) public view returns (uint256)
```

Check liquidity token amount withdrawable by the caller at this time.

_Return value depends on the callers balance, and is limited by pool liquidity._

| Name | Type | Description |
| ---- | ---- | ----------- |
| wallet | address | Address of the wallet to check the withdrawable balance of. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Max amount of liquidity tokens withdrawable by the caller. |

### withdrawalRequestsLength

```solidity
function withdrawalRequestsLength() external view returns (uint256)
```

Accessor

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Current length of the withdrawal queue |

### getWithdrawalRequestAt

```solidity
function getWithdrawalRequestAt(uint256 i) external view returns (struct WithdrawalRequestQueue.Request)
```

Accessor

| Name | Type | Description |
| ---- | ---- | ----------- |
| i | uint256 | Index of the withdrawal request in the queue |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | struct WithdrawalRequestQueue.Request | WithdrawalRequestQueue object |

### getWithdrawalRequestById

```solidity
function getWithdrawalRequestById(uint256 id) external view returns (struct WithdrawalRequestQueue.Request)
```

Accessor

| Name | Type | Description |
| ---- | ---- | ----------- |
| id | uint256 | ID of the withdrawal request |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | struct WithdrawalRequestQueue.Request | WithdrawalRequestQueue object |

### balanceStaked

```solidity
function balanceStaked() external view returns (uint256)
```

Check the staker's balance in the pool.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Liquidity token balance of the staker's stake. |

### simpleProjectedAPY

```solidity
function simpleProjectedAPY(uint16 strategyRate, uint256 _avgStrategyAPR) external view returns (struct IPoolContext.APYBreakdown)
```

Projected APY breakdown given the current pool state and a specific strategy rate and an average apr.

_Represent percentage parameter values in contract specific format._

| Name | Type | Description |
| ---- | ---- | ----------- |
| strategyRate | uint16 | Percentage of pool funds projected to be used in strategies. |
| _avgStrategyAPR | uint256 | Weighted average APR of the funds in strategies. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | struct IPoolContext.APYBreakdown | Projected APY breakdown |

### balanceOf

```solidity
function balanceOf(address wallet) public view returns (uint256)
```

Check wallet's funds balance in the pool. This balance includes deposited balance and acquired
        yield. This balance does not included staked balance, balance locked in withdrawal requests,
        leveraged earnings or protocol revenue.

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

Check funds amount unstakable by the staker at this time.

_Return value depends on the staked balance and targetStakePercent, and is limited by pool
     liquidity._

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Max amount of liquidity tokens unstakable by the staker. |

### strategyLiquidity

```solidity
function strategyLiquidity() public view returns (uint256)
```

Current liquidity available for pool strategies such as lending or investing.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Strategy liquidity amount. |

### freeLenderLiquidity

```solidity
function freeLenderLiquidity() public view returns (uint256)
```

Accessor

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Shared liquidity available for all lenders to withdraw immediately without queuing withdrawal requests. |

### poolFundsLimit

```solidity
function poolFundsLimit() public view returns (uint256)
```

_View pool funds limit based on the staked funds._

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | MAX amount of liquidity tokens allowed in the pool based on staked assets |

### enter

```solidity
function enter(uint256 amount) internal returns (uint256)
```

_Internal method to enter the pool with a liquidity token amount.
     With the exception of the staker's call, amount must not exceed amountDepositable().
     If the caller is the staker, entered funds are considered staked.
     New pool tokens are minted in a way that will not influence the current share price.
Shares are equivalent to pool tokens and are represented by them._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Liquidity token amount to add to the pool on behalf of the caller. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Amount of pool tokens minted and allocated to the caller. |

### exit

```solidity
function exit(uint256 amount) internal returns (uint256)
```

_Internal method to exit the pool with funds amount.
     Amount must not exceed amountWithdrawable() for non-stakers, and amountUnstakable() for the staker.
     If the caller is the staker, exited funds are considered unstaked.
     Pool tokens are burned in a way that will not influence the current share price.
Shares are equivalent to pool tokens and are represented by them._

| Name | Type | Description |
| ---- | ---- | ----------- |
| amount | uint256 | Liquidity token amount to withdraw from the pool on behalf of the caller. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Amount of pool tokens burned and taken from the caller. |

### sharesToFunds

```solidity
function sharesToFunds(uint256 shares) public view returns (uint256)
```

Get funds value of shares.

| Name | Type | Description |
| ---- | ---- | ----------- |
| shares | uint256 | Pool token amount |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Converted liquidity token value |

### fundsToShares

```solidity
function fundsToShares(uint256 funds) public view returns (uint256)
```

Get share value of funds.

| Name | Type | Description |
| ---- | ---- | ----------- |
| funds | uint256 | Amount of liquidity tokens |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Converted pool token value |

### maintainsStakeRatio

```solidity
function maintainsStakeRatio() public view returns (bool)
```

Check if the pool has sufficient stake

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the staked funds provide at least a minimum ratio to the pool funds, False otherwise. |

### totalPoolTokenSupply

```solidity
function totalPoolTokenSupply() internal view returns (uint256)
```

### projectedAPYBreakdown

```solidity
function projectedAPYBreakdown(uint256 _totalPoolTokens, uint256 _stakedTokens, uint256 _poolFunds, uint256 _strategizedFunds, uint256 _avgStrategyAPR, uint16 _protocolFeePercent, uint16 _stakerEarnFactor) public pure returns (struct IPoolContext.APYBreakdown)
```

APY breakdown given a specified scenario.

_Represent percentage parameter values in contract specific format._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _totalPoolTokens | uint256 | total pull token supply. For current conditions use: totalPoolTokenSupply() |
| _stakedTokens | uint256 | the amount of staked pool tokens. Must be less than or equal to _totalPoolTokens.                       For current conditions use: balances.stakedShares |
| _poolFunds | uint256 | liquidity token funds that make up the pool. For current conditions use: balances.poolFunds |
| _strategizedFunds | uint256 | part of the pool funds that will remain in strategies. Must be less than or equal to                           _poolFunds. For current conditions use: balances.strategizedFunds |
| _avgStrategyAPR | uint256 | Weighted average APR of the funds in strategies.                         For current conditions use: config.weightedAvgStrategyAPR |
| _protocolFeePercent | uint16 | Protocol fee parameter. Must be less than 100%.                            For current conditions use: config.protocolFeePercent |
| _stakerEarnFactor | uint16 | Staker's earn factor. Must be greater than or equal to 1x (100%).                           For current conditions use: config.stakerEarnFactor |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | struct IPoolContext.APYBreakdown | Pool apy with protocol, staker, and lender components broken down. |

### __gap

```solidity
uint256[34] __gap
```

_Slots reserved for future state variables_

