# Solidity API

## SaplingMath

Sapling math library

### PERCENT_DECIMALS

```solidity
uint8 PERCENT_DECIMALS
```

The mumber of decimal digits in percentage values

### HUNDRED_PERCENT

```solidity
uint16 HUNDRED_PERCENT
```

A constant representing 100%

### MAX_PROTOCOL_FEE_PERCENT

```solidity
uint16 MAX_PROTOCOL_FEE_PERCENT
```

Math safe upper bound for percentage of paid interest to be allocated as protocol fee

### PPS_RATE_CHECK_DIVISOR

```solidity
uint256 PPS_RATE_CHECK_DIVISOR
```

Total shares divisor to calculate the minimum pool funds to maintain acceptable conversion rate for pool entries

### SAFE_MIN_DURATION

```solidity
uint256 SAFE_MIN_DURATION
```

Math safe minimum loan duration in seconds

### SAFE_MAX_DURATION

```solidity
uint256 SAFE_MAX_DURATION
```

Math safe maximum loan duration in seconds

### MIN_LOAN_GRACE_PERIOD

```solidity
uint256 MIN_LOAN_GRACE_PERIOD
```

Minimum allowed loan payment grace period

### MAX_LOAN_GRACE_PERIOD

```solidity
uint256 MAX_LOAN_GRACE_PERIOD
```

Maximum allowed loan payment grace period

### SAFE_MIN_APR

```solidity
uint16 SAFE_MIN_APR
```

Safe minimum for APR values

### SAFE_MIN_AMOUNT

```solidity
uint256 SAFE_MIN_AMOUNT
```

Math safe minimum loan amount, raw value

### LOAN_LOCK_PERIOD

```solidity
uint256 LOAN_LOCK_PERIOD
```

Minimum loan offer lock period for lenders to be able to vite against

