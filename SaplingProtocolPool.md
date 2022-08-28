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

Address of the verification hub

### investments

```solidity
mapping(address => struct SaplingProtocolPool.Investment) investments
```

Investment profile by lending pool address

### NewInvestment

```solidity
event NewInvestment(address toPool, uint256 liquidityTokenAmount)
```

Event for when funds are invested into a lending pool

### YieldCollected

```solidity
event YieldCollected(address fromPool, uint256 liquidityTokenAmount)
```

Event for when an investment yield is collected from a lending pool

### constructor

```solidity
constructor(address _verificationHub, address _poolToken, address _liquidityToken, address _governance, address _protocol, address _manager) public
```

Creates a Sapling pool.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _verificationHub | address | verification hub address |
| _poolToken | address | ERC20 token contract address to be used as the pool issued token. |
| _liquidityToken | address | ERC20 token contract address to be used as pool liquidity currency. |
| _governance | address | Governance address |
| _protocol | address | Protocol wallet address |
| _manager | address | Manager address |

### invest

```solidity
function invest(address lendingPool, uint256 liquidityTokenAmount) external
```

Create new investment or add to an existing investment on a lending pool.

_Caller must be the manager. Stake to pool ratio must be good, protocol pool must have sufficient liquidity, 
     and the lending pool must be registered on the Verification Hub._

| Name | Type | Description |
| ---- | ---- | ----------- |
| lendingPool | address | Address of a lending pool the investment is being made to |
| liquidityTokenAmount | uint256 | Amount of investment in liquidity tokens |

### collectYield

```solidity
function collectYield(address pool, uint256 amount) external
```

Collect investment yield from a lending pool.

_Caller must be the manager. Yield balance on the lending pool must be sufficient._

| Name | Type | Description |
| ---- | ---- | ----------- |
| pool | address | Address of the lending pool to collect from |
| amount | uint256 | Amount to collect in liquidity tokens |

### collectInvestment

```solidity
function collectInvestment(address pool, uint256 amount) external
```

Collect/Withdraw investment principal from a lending pool.

_Caller must be the manager. Lending pool must have sufficient withdrawable liquidity, which can be checked 
     independently._

| Name | Type | Description |
| ---- | ---- | ----------- |
| pool | address | Address of the lending pool to collect from |
| amount | uint256 | Amount to collect in liquidity tokens |

### poolYieldBalanceOn

```solidity
function poolYieldBalanceOn(address pool) public view returns (uint256)
```

Helper function to check the accumulated yield balance of the protocol pool on a specific lending pool.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Yield balance of the protocol pool on a lending pool. |

