# Solidity API

## Strings

_String operations._

### _HEX_SYMBOLS

```solidity
bytes16 _HEX_SYMBOLS
```

### _ADDRESS_LENGTH

```solidity
uint8 _ADDRESS_LENGTH
```

### toString

```solidity
function toString(uint256 value) internal pure returns (string)
```

_Converts a &#x60;uint256&#x60; to its ASCII &#x60;string&#x60; decimal representation._

### toHexString

```solidity
function toHexString(uint256 value) internal pure returns (string)
```

_Converts a &#x60;uint256&#x60; to its ASCII &#x60;string&#x60; hexadecimal representation._

### toHexString

```solidity
function toHexString(uint256 value, uint256 length) internal pure returns (string)
```

_Converts a &#x60;uint256&#x60; to its ASCII &#x60;string&#x60; hexadecimal representation with fixed length._

### toHexString

```solidity
function toHexString(address addr) internal pure returns (string)
```

_Converts an &#x60;address&#x60; with fixed length of 20 bytes to its not checksummed ASCII &#x60;string&#x60; hexadecimal representation._

