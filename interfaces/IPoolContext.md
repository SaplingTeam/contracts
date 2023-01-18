# Solidity API

## IPoolContext

### TokenConfig

```solidity
struct TokenConfig {
  address poolToken;
  address liquidityToken;
  uint8 decimals;
}
```

### PoolConfig

```solidity
struct PoolConfig {
  uint256 minWithdrawalRequestAmount;
  uint16 targetStakePercent;
  uint16 protocolFeePercent;
  uint16 managerEarnFactorMax;
  uint16 managerEarnFactor;
  uint16 targetLiquidityPercent;
  uint16 weightedAvgStrategyAPR;
  uint16 exitFeePercent;
}
```

### PoolBalance

```solidity
struct PoolBalance {
  uint256 tokenBalance;
  uint256 rawLiquidity;
  uint256 poolFunds;
  uint256 allocatedFunds;
  uint256 strategizedFunds;
  uint256 withdrawalRequestedShares;
  uint256 stakedShares;
  uint256 managerRevenue;
  uint256 protocolRevenue;
}
```

### WithdrawalRequestState

```solidity
struct WithdrawalRequestState {
  uint256 sharesLocked;
  uint8 countOutstanding;
}
```

### APYBreakdown

```solidity
struct APYBreakdown {
  uint16 totalPoolAPY;
  uint16 protocolRevenueComponent;
  uint16 managerRevenueComponent;
  uint16 lenderComponent;
}
```

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

### FundsDeposited

```solidity
event FundsDeposited(address wallet, uint256 amount, uint256 tokensIssued)
```

Event for when lender funds are deposited

### FundsWithdrawn

```solidity
event FundsWithdrawn(address wallet, uint256 amount, uint256 tokensRedeemed)
```

Event for when lender funds are withdrawn

### FundsStaked

```solidity
event FundsStaked(address wallet, uint256 amount, uint256 tokensIssued)
```

Event for when pool manager funds are staked

### FundsUnstaked

```solidity
event FundsUnstaked(address wallet, uint256 amount, uint256 tokensRedeemed)
```

Event for when pool manager funds are unstaked

### RevenueWithdrawn

```solidity
event RevenueWithdrawn(address wallet, uint256 amount)
```

Event for when a non user revenue is withdrawn

### WithdrawalRequested

```solidity
event WithdrawalRequested(uint256 id, address wallet, uint256 tokensLocked)
```

Event for when a new withdrawal request is made

### WithdrawalRequestUpdated

```solidity
event WithdrawalRequestUpdated(uint256 id, uint256 prevTokensLocked, uint256 tokensLocked)
```

Event for when a withdrawal request amount is updated

### WithdrawalRequestCancelled

```solidity
event WithdrawalRequestCancelled(uint256 id)
```

Event for when a withdrawal request is cancelled

### WithdrawalRequestFulfilled

```solidity
event WithdrawalRequestFulfilled(uint256 id, uint256 amount)
```

Event for when a withdrawal request is fully fulfilled

### TargetStakePercentSet

```solidity
event TargetStakePercentSet(uint16 prevValue, uint16 newValue)
```

Setter event

### TargetLiqudityPercentSet

```solidity
event TargetLiqudityPercentSet(uint16 prevValue, uint16 newValue)
```

Setter event

### ProtocolFeePercentSet

```solidity
event ProtocolFeePercentSet(uint16 prevValue, uint16 newValue)
```

Setter event

### ManagerEarnFactorMaxSet

```solidity
event ManagerEarnFactorMaxSet(uint16 prevValue, uint16 newValue)
```

Setter event

### ManagerEarnFactorSet

```solidity
event ManagerEarnFactorSet(uint16 prevValue, uint16 newValue)
```

Setter event

### tokensToFunds

```solidity
function tokensToFunds(uint256 poolTokens) external view returns (uint256)
```

Get liquidity token value of shares.

| Name | Type | Description |
| ---- | ---- | ----------- |
| poolTokens | uint256 | Pool token amount. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Converted liqudity token value. |

### fundsToTokens

```solidity
function fundsToTokens(uint256 liquidityTokens) external view returns (uint256)
```

Get pool token value of liquidity tokens.

| Name | Type | Description |
| ---- | ---- | ----------- |
| liquidityTokens | uint256 | Amount of liquidity tokens. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Converted pool token value. |

