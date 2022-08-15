# Solidity API

## VerificationHub

### bannedList

```solidity
mapping(address => bool) bannedList
```

### verifiedList

```solidity
mapping(address => bool) verifiedList
```

### constructor

```solidity
constructor(address _governance, address _protocol) public
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

### isBadActor

```solidity
function isBadActor(address party) external view returns (bool)
```

### isVerified

```solidity
function isVerified(address party) external view returns (bool)
```

