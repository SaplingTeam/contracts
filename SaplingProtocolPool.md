# Solidity API

## SaplingProtocolPool

### Investment

```solidity
struct Investment {
  address pool;
  uint256 totalAmount;
  uint256 outstandingAmount;
  uint256 baseAmountRecovered;
  uint256 yieldRecovered;
  uint256 createdTime;
  uint256 lastInvestedTime;
  uint256 lastCollectedTime;
}
```

### verificationHub

```solidity
address verificationHub
```

### investments

```solidity
mapping(address => struct SaplingProtocolPool.Investment) investments
```

### NewInvestment

```solidity
event NewInvestment(address toPool, uint256 liquidityTokenAmount)
```

### YieldCollected

```solidity
event YieldCollected(address fromPool, uint256 liquidityTokenAmount)
```

### constructor

```solidity
constructor(address _verificationHub, address _poolToken, address _liquidityToken, address _governance, address _protocol, address _manager) public
```

Creates a Sapling pool.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _verificationHub | address |  |
| _poolToken | address | ERC20 token contract address to be used as the pool issued token. |
| _liquidityToken | address | ERC20 token contract address to be used as main pool liquid currency. |
| _governance | address | Address of the protocol governance. |
| _protocol | address | Address of a wallet to accumulate protocol earnings. |
| _manager | address | Address of the pool manager. |

### invest

```solidity
function invest(address lendingPool, uint256 liquidityTokenAmount) external
```

### collectYield

```solidity
function collectYield(address pool, uint256 amount) external
```

### collectInvestment

```solidity
function collectInvestment(address pool, uint256 amount) external
```

### poolYieldBalanceOn

```solidity
function poolYieldBalanceOn(address pool) public view returns (uint256)
```

