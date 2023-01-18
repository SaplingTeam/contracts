# Solidity API

## WithdrawalRequestQueue

Withdrawal request queue for Sapling lending pools. 
The queue is virtual, and implements a doubly linked map with functions limited to intended business logic.

### Request

```solidity
struct Request {
  uint256 id;
  address wallet;
  uint256 sharesLocked;
  uint256 prev;
  uint256 next;
}
```

### LinkedMap

```solidity
struct LinkedMap {
  uint256 _lastRequestId;
  uint256 _head;
  uint256 _tail;
  struct EnumerableSet.UintSet _ids;
  mapping(uint256 => struct WithdrawalRequestQueue.Request) _requests;
}
```

### queue

```solidity
function queue(struct WithdrawalRequestQueue.LinkedMap list, address user, uint256 shares) internal returns (uint256)
```

Queue a new withdrawal request

| Name | Type | Description |
| ---- | ---- | ----------- |
| list | struct WithdrawalRequestQueue.LinkedMap | storage reference to LinkedMap |
| user | address | requestor wallet address |
| shares | uint256 | poolTokens locked in the withdrawal request |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | id of the newly queued request |

### update

```solidity
function update(struct WithdrawalRequestQueue.LinkedMap list, uint256 id, uint256 newShareAmount) internal returns (uint256)
```

Update an existing withdrawal request

_Locked token amount can only be decreased but must stay above 0. Use remove for a value of 0 instead._

| Name | Type | Description |
| ---- | ---- | ----------- |
| list | struct WithdrawalRequestQueue.LinkedMap | Storage reference to LinkedMap |
| id | uint256 | Requestor wallet address |
| newShareAmount | uint256 | new amount of poolTokens locked in the withdrawal request |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Difference in the locked pool tokens after the update |

### remove

```solidity
function remove(struct WithdrawalRequestQueue.LinkedMap list, uint256 id) internal
```

Remove an existing withdrawal request

| Name | Type | Description |
| ---- | ---- | ----------- |
| list | struct WithdrawalRequestQueue.LinkedMap | Storage reference to LinkedMap |
| id | uint256 | Requestor wallet address |

### length

```solidity
function length(struct WithdrawalRequestQueue.LinkedMap list) internal view returns (uint256)
```

Accessor

| Name | Type | Description |
| ---- | ---- | ----------- |
| list | struct WithdrawalRequestQueue.LinkedMap | storage reference to LinkedMap |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | Length of the queue |

### headID

```solidity
function headID(struct WithdrawalRequestQueue.LinkedMap list) internal view returns (uint256)
```

Accessor

_ID value of 0 is not used, and a return value of 0 means the queue is empty._

| Name | Type | Description |
| ---- | ---- | ----------- |
| list | struct WithdrawalRequestQueue.LinkedMap | Storage reference to LinkedMap |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | uint256 | ID of the first (head) node in the queue |

### head

```solidity
function head(struct WithdrawalRequestQueue.LinkedMap list) internal view returns (struct WithdrawalRequestQueue.Request)
```

Accessor

_ID value of 0 is not used, and a return value of 0 means the queue is empty._

| Name | Type | Description |
| ---- | ---- | ----------- |
| list | struct WithdrawalRequestQueue.LinkedMap | Storage reference to LinkedMap |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | struct WithdrawalRequestQueue.Request | First node in the queue |

### tail

```solidity
function tail(struct WithdrawalRequestQueue.LinkedMap list) internal view returns (struct WithdrawalRequestQueue.Request)
```

Accessor

_ID value of 0 is not used, and a return value of 0 means the queue is empty._

| Name | Type | Description |
| ---- | ---- | ----------- |
| list | struct WithdrawalRequestQueue.LinkedMap | storage reference to LinkedMap |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | struct WithdrawalRequestQueue.Request | Last node in the queue |

### get

```solidity
function get(struct WithdrawalRequestQueue.LinkedMap list, uint256 id) internal view returns (struct WithdrawalRequestQueue.Request)
```

Accessor

_ID must belong to a node that is still in the queue._

| Name | Type | Description |
| ---- | ---- | ----------- |
| list | struct WithdrawalRequestQueue.LinkedMap | Storage reference to LinkedMap |
| id | uint256 | Id of the node to get |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | struct WithdrawalRequestQueue.Request | Node (withdrawal request) with the given ID |

### at

```solidity
function at(struct WithdrawalRequestQueue.LinkedMap list, uint256 index) internal view returns (struct WithdrawalRequestQueue.Request)
```

Accessor

_Index must be within bounds/less than the queue length._

| Name | Type | Description |
| ---- | ---- | ----------- |
| list | struct WithdrawalRequestQueue.LinkedMap | Storage reference to LinkedMap |
| index | uint256 | Index of the node to get. |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | struct WithdrawalRequestQueue.Request | Node (withdrawal request) at the given index |

