# Solidity API

## GovernedPausable

Provides the basics for governance access and emergency pause functionality.

_This contract is abstract. Extend the contract to implement governance access control and emergency pause functionality._

### governance

```solidity
address governance
```

Protocol governance

### PAUSE_TIMEOUT

```solidity
uint256 PAUSE_TIMEOUT
```

Max pause duration, after witch pause will lose effect.

### PAUSE_MAX_COOLDOWN

```solidity
uint256 PAUSE_MAX_COOLDOWN
```

Max pause cooldown after resume, during which pause cannot be repeated. Actual cooldown will be proportionally reduced if resumed before timeout.

### lastPausedTime

```solidity
uint256 lastPausedTime
```

Epoch second timestamp of the last pause, default value is 1 seconds after epoch 0.

### pauseCooldownTime

```solidity
uint256 pauseCooldownTime
```

Epoch second timestamp when the pausing will come out of a cooldown.

### GovernanceTransferred

```solidity
event GovernanceTransferred(address from, address to)
```

Event emitted when a new governance is set

### Paused

```solidity
event Paused()
```

Event emitted on pause

### Resumed

```solidity
event Resumed()
```

Event emitted on manual resume.

### onlyGovernance

```solidity
modifier onlyGovernance()
```

Limit access to the governance

### notPaused

```solidity
modifier notPaused()
```

Allow execution only when not paused

### paused

```solidity
modifier paused()
```

Allow execution only when paused

### notInPauseCooldown

```solidity
modifier notInPauseCooldown()
```

Allow execution only when the pause cooldown is not in effect

### constructor

```solidity
constructor(address _governance) internal
```

Create new Governed instance.

__governance must not be 0_

| Name | Type | Description |
| ---- | ---- | ----------- |
| _governance | address | Address of the protocol governance. |

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

### pause

```solidity
function pause() external
```

Pause.

_Caller must be the governance.
     Pause or cooldown must not be in effect.
     Emits &#x27;Paused&#x27; event.
     Pause will time out in PAUSE_TIMEOUT seconds after the current block timestamp._

### resume

```solidity
function resume() external
```

Resume.

_Caller must be the governance.
     Pause must be in effect.
     Emits &#x27;Resumed&#x27; event.
     Resuming will update &#x27;pauseCooldownTime&#x27;._

### isPaused

```solidity
function isPaused() public view returns (bool)
```

Flag indicating whether or not the emergency pause is in effect

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the pause in effect, false otherwise |

