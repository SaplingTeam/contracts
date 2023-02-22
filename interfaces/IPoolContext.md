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
  uint16 stakerEarnFactorMax;
  uint16 stakerEarnFactor;
  uint16 targetLiquidityPercent;
  uint16 exitFeePercent;
}
```

### PoolBalance

```solidity
struct PoolBalance {
  uint256 rawLiquidity;
  uint256 poolFunds;
  uint256 stakedShares;
}
```

### WithdrawalAllowance

```solidity
struct WithdrawalAllowance {
  uint256 amount;
  uint256 timeFrom;
  uint256 timeTo;
}
```

### APYBreakdown

```solidity
struct APYBreakdown {
  uint16 totalPoolAPY;
  uint16 protocolRevenueComponent;
  uint16 stakerEarningsComponent;
  uint16 lenderComponent;
}
```

### SharedLenderLoss

```solidity
event SharedLenderLoss(uint256 fromLoanId, uint256 amount)
```

Event for when the lender capital is lost due to defaults

### StakerLoss

```solidity
event StakerLoss(uint256 fromLoanId, uint256 amount)
```

Event for when the staker's funds are lost due to defaults or closures

### StakedFundsDepleted

```solidity
event StakedFundsDepleted()
```

Event for when the staked assets are depleted due to defaults

### FundsDeposited

```solidity
event FundsDeposited(address wallet, uint256 amount, uint256 sharesIssued)
```

Event for when lender funds are deposited

### FundsWithdrawn

```solidity
event FundsWithdrawn(address wallet, uint256 amount, uint256 sharesRedeemed)
```

Event for when lender funds are withdrawn

### FundsStaked

```solidity
event FundsStaked(address wallet, uint256 amount, uint256 sharesIssued)
```

Event for when staker funds are staked

### FundsUnstaked

```solidity
event FundsUnstaked(address wallet, uint256 amount, uint256 sharesRedeemed)
```

Event for when staker funds are unstaked

### StakerEarnings

```solidity
event StakerEarnings(address wallet, uint256 amount)
```

Event for when the staker earnings are transferred

### WithdrawalAllowanceRequested

```solidity
event WithdrawalAllowanceRequested(address wallet, uint256 amount, uint256 timeFrom, uint256 timeTo)
```

Event for when a withdrawal allowance request is made

### TargetStakePercentSet

```solidity
event TargetStakePercentSet(uint16 prevValue, uint16 newValue)
```

Setter event

### TargetLiquidityPercentSet

```solidity
event TargetLiquidityPercentSet(uint16 prevValue, uint16 newValue)
```

Setter event

### ProtocolFeePercentSet

```solidity
event ProtocolFeePercentSet(uint16 prevValue, uint16 newValue)
```

Setter event

### StakerEarnFactorMaxSet

```solidity
event StakerEarnFactorMaxSet(uint16 prevValue, uint16 newValue)
```

Setter event

### StakerEarnFactorSet

```solidity
event StakerEarnFactorSet(uint16 prevValue, uint16 newValue)
```

Setter event

