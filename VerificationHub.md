# Solidity API

## VerificationHub

### poolFactory

```solidity
address poolFactory
```

### saplingLendingPools

```solidity
mapping(address => bool) saplingLendingPools
```

### bannedList

```solidity
mapping(address => bool) bannedList
```

### verifiedList

```solidity
mapping(address => bool) verifiedList
```

### PoolFactorySet

```solidity
event PoolFactorySet(address from, address to)
```

### onlyPoolFactory

```solidity
modifier onlyPoolFactory()
```

### constructor

```solidity
constructor(address _governance, address _protocol) public
```

### setPoolFactory

```solidity
function setPoolFactory(address _poolFactory) external
```

### ban

```solidity
function ban(address party) external
```

### unban

```solidity
function unban(address party) external
```

### verify

```solidity
function verify(address party) external
```

### unverify

```solidity
function unverify(address party) external
```

### registerSaplingPool

```solidity
function registerSaplingPool(address pool) external
```

### isBadActor

```solidity
function isBadActor(address party) external view returns (bool)
```

### isVerified

```solidity
function isVerified(address party) external view returns (bool)
```

### isSaplingPool

```solidity
function isSaplingPool(address party) external view returns (bool)
```

