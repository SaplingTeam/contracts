# Solidity API

## SaplingPool

Provides deposit, withdrawal, and staking functionality.

_Extends Lender. 
     Extends ManagedLendingPool by inheritance._

### constructor

```solidity
constructor(address _token, address _governance, address _protocol, uint256 _minAmount) public
```

Creates a Sapling pool.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _token | address | ERC20 token contract address to be used as main pool liquid currency. |
| _governance | address | Address of the protocol governance. |
| _protocol | address | Address of a wallet to accumulate protocol earnings. |
| _minAmount | uint256 | Minimum amount to be borrowed per loan. |

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

### balanceOf

```solidity
function balanceOf(address wallet) public view returns (uint256)
```

Check wallet&#x27;s token balance in the pool. Balance includes acquired earnings.

| Name | Type | Description |
| ---- | ---- | ----------- |
| wallet | address | Address of the wallet to check the balance of. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Token balance of the wallet in this pool. |

### amountDepositable

```solidity
function amountDepositable() external view returns (uint256)
```

Check token amount depositable by lenders at this time.

_Return value depends on the pool state rather than caller&#x27;s balance._

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

### borrow

```solidity
function borrow(uint256 loanId) external
```

Withdraw funds of an approved loan.

_Caller must be the borrower. 
     The loan must be in APPROVED status._

| Name | Type | Description |
| ---- | ---- | ----------- |
| loanId | uint256 | id of the loan to withdraw funds of. |

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

### balanceStaked

```solidity
function balanceStaked() public view returns (uint256)
```

Check the manager&#x27;s staked token balance in the pool.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Token balance of the manager&#x27;s stake. |

### amountUnstakable

```solidity
function amountUnstakable() public view returns (uint256)
```

Check token amount unstakable by the manager at this time.

_Return value depends on the manager&#x27;s stake balance, and is limited by pool liquidity._

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Max amount of tokens unstakable by the manager. |

