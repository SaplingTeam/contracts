# Solidity API

## IVerificationHub

### registerSaplingPool

```solidity
function registerSaplingPool(address pool) external
```

Register a new Sapling Lending Pool.

_Caller must be the SaplingFactory_

| Name | Type | Description |
| ---- | ---- | ----------- |
| pool | address | Address of the new lending pool. |

### verify

```solidity
function verify(address party) external
```

Set an address as ID verified.

_Caller must be the governance._

| Name | Type | Description |
| ---- | ---- | ----------- |
| party | address | Address to set as ID verified |

### unverify

```solidity
function unverify(address party) external
```

Unset an address as ID verified.

_Caller must be the governance._

| Name | Type | Description |
| ---- | ---- | ----------- |
| party | address | Address to unset as ID verified |

### registerBadActor

```solidity
function registerBadActor(address party) external
```

Register an address as a bad actor.

_Caller must be the governance._

| Name | Type | Description |
| ---- | ---- | ----------- |
| party | address | Address to set as a bad actor |

### unregisterBadActor

```solidity
function unregisterBadActor(address party) external
```

Unregister an address as a bad actor.

_Caller must be the governance._

| Name | Type | Description |
| ---- | ---- | ----------- |
| party | address | Address to unset as a bad actor |

### isSaplingPool

```solidity
function isSaplingPool(address party) external view returns (bool)
```

Check if an address is a registered Sapling Lending Pool

| Name | Type | Description |
| ---- | ---- | ----------- |
| party | address | An address to check |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the specified address is registered with this verification hub, false otherwise. |

### isVerified

```solidity
function isVerified(address party) external view returns (bool)
```

Check if an address is ID verified.

| Name | Type | Description |
| ---- | ---- | ----------- |
| party | address | An address to check |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the specified address is ID verified, false otherwise. |

### isBadActor

```solidity
function isBadActor(address party) external view returns (bool)
```

Check if an address is a bad actor.

| Name | Type | Description |
| ---- | ---- | ----------- |
| party | address | An address to check |

| Name | Type | Description |
| ---- | ---- | ----------- |
| [0] | bool | True if the specified address is a bad actor, false otherwise. |

