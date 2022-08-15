# Solidity API

## SaplingContext

### governance

```solidity
address governance
```

Protocol governance

### protocol

```solidity
address protocol
```

Protocol wallet address

### GovernanceTransferred

```solidity
event GovernanceTransferred(address from, address to)
```

Event emitted when a new governance is set

### ProtocolWalletSet

```solidity
event ProtocolWalletSet(address from, address to)
```

### onlyGovernance

```solidity
modifier onlyGovernance()
```

A modifier to limit access to the governance

### constructor

```solidity
constructor(address _governance, address _protocol) internal
```

Creates new SaplingContext instance.

__governance must not be 0_

| Name | Type | Description |
| ---- | ---- | ----------- |
| _governance | address | Address of the protocol governance. |
| _protocol | address |  |

### transferGovernance

```solidity
function transferGovernance(address _governance) external
```

Transfer the governance.

_Caller must be governance. 
     _governance must not be 0._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _governance | address | Address of the new governance. |

### setProtocolWallet

```solidity
function setProtocolWallet(address _protocol) external
```

### pause

```solidity
function pause() external
```

### unpause

```solidity
function unpause() external
```

