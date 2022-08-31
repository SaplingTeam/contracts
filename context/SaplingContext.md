# Solidity API

## SaplingContext

Provides governance access control, a common reverence to the protocol wallet address, and basic pause
        functionality by extending OpenZeppelin's Pausable contract.

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

Event for when a new governance is set

### ProtocolWalletTransferred

```solidity
event ProtocolWalletTransferred(address from, address to)
```

Event for when a new protocol wallet is set

### onlyGovernance

```solidity
modifier onlyGovernance()
```

A modifier to limit access only to the governance

### constructor

```solidity
constructor(address _governance, address _protocol) internal
```

Creates a new SaplingContext.

_Addresses must not be 0._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _governance | address | Governance address |
| _protocol | address | Protocol wallet address |

### pause

```solidity
function pause() external
```

Pause the contract.

_Caller must be the governance.
     Only the functions using whenPaused and whenNotPaused modifiers will be affected by pause._

### unpause

```solidity
function unpause() external
```

Resume the contract.

_Caller must be the governance.
     Only the functions using whenPaused and whenNotPaused modifiers will be affected by unpause._

### transferGovernance

```solidity
function transferGovernance(address _governance) external
```

Transfer the governance.

_Caller must be the governance.
     New governance address must not be 0, and must not be one of current non-user addresses._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _governance | address | New governance address. |

### transferProtocolWallet

```solidity
function transferProtocolWallet(address _protocol) external
```

Transfer the protocol wallet.

_Caller must be the governance.
     New governance address must not be 0, and must not be one of current non-user addresses._

| Name | Type | Description |
| ---- | ---- | ----------- |
| _protocol | address | New protocol wallet address. |

### afterProtocolWalletTransfer

```solidity
function afterProtocolWalletTransfer(address from) internal virtual
```

Hook that is called after a new protocol wallet address has been set.

| Name | Type | Description |
| ---- | ---- | ----------- |
| from | address | Address of the previous protocol wallet. |

### isNonUserAddress

```solidity
function isNonUserAddress(address party) internal view virtual returns (bool)
```

Hook that is called to verify if an address is currently in any non-user/management position.

_When overriding, return "contract local verification result" AND super.isNonUserAddress(party)._

| Name | Type | Description |
| ---- | ---- | ----------- |
| party | address | Address to verify |

