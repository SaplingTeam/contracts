# Solidity API

## ILender

### deposit

```solidity
function deposit(uint256 amount) external
```

### withdraw

```solidity
function withdraw(uint256 amount) external
```

### balanceOf

```solidity
function balanceOf(address wallet) external view returns (uint256)
```

### projectedLenderAPY

```solidity
function projectedLenderAPY(uint16 strategyRate, uint256 _avgStrategyAPR) external view returns (uint16)
```

