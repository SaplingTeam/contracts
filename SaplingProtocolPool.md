# Solidity API

## SaplingProtocolPool

### constructor

```solidity
constructor(address _poolToken, address _liquidityToken, address _governance, address _protocol, address _manager) public
```

Creates a Sapling pool.

| Name | Type | Description |
| ---- | ---- | ----------- |
| _poolToken | address | ERC20 token contract address to be used as the pool issued token. |
| _liquidityToken | address | ERC20 token contract address to be used as main pool liquid currency. |
| _governance | address | Address of the protocol governance. |
| _protocol | address | Address of a wallet to accumulate protocol earnings. |
| _manager | address | Address of the pool manager. |

### invest

```solidity
function invest(address lendingPool, uint256 liquidityTokenAmount) external
```

### poolCanLend

```solidity
function poolCanLend() public view returns (bool)
```

Check if the pool can lend based on the current stake levels.

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the staked funds provide at least a minimum ratio to the pool funds, False otherwise. |

