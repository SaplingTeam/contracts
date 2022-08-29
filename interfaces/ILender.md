# Solidity API

## ILender

_Lender interface providing a simple way for other contracts to be lenders into lending pools._

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

### balanceOf

```solidity
function balanceOf(address wallet) external view returns (uint256)
```

Check wallet's liquidity token balance in the pool. This balance includes deposited balance and acquired
        yield. This balance does not included staked balance, leveraged earnings or protocol earnings.

| Name | Type | Description |
| ---- | ---- | ----------- |
| wallet | address | Address of the wallet to check the balance of. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Liquidity token balance of the wallet in this pool. |

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

