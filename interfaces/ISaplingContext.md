# Solidity API

## ISaplingContext

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

