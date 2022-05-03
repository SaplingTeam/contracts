# Solidity API

## SafeMath

_Wrappers over Solidity&#x27;s arithmetic operations.

NOTE: &#x60;SafeMath&#x60; is generally not needed starting with Solidity 0.8, since the compiler
now has built in overflow checking._

### tryAdd

```solidity
function tryAdd(uint256 a, uint256 b) internal pure returns (bool, uint256)
```

_Returns the addition of two unsigned integers, with an overflow flag.

_Available since v3.4.__

### trySub

```solidity
function trySub(uint256 a, uint256 b) internal pure returns (bool, uint256)
```

_Returns the subtraction of two unsigned integers, with an overflow flag.

_Available since v3.4.__

### tryMul

```solidity
function tryMul(uint256 a, uint256 b) internal pure returns (bool, uint256)
```

_Returns the multiplication of two unsigned integers, with an overflow flag.

_Available since v3.4.__

### tryDiv

```solidity
function tryDiv(uint256 a, uint256 b) internal pure returns (bool, uint256)
```

_Returns the division of two unsigned integers, with a division by zero flag.

_Available since v3.4.__

### tryMod

```solidity
function tryMod(uint256 a, uint256 b) internal pure returns (bool, uint256)
```

_Returns the remainder of dividing two unsigned integers, with a division by zero flag.

_Available since v3.4.__

### add

```solidity
function add(uint256 a, uint256 b) internal pure returns (uint256)
```

_Returns the addition of two unsigned integers, reverting on
overflow.

Counterpart to Solidity&#x27;s &#x60;+&#x60; operator.

Requirements:

- Addition cannot overflow._

### sub

```solidity
function sub(uint256 a, uint256 b) internal pure returns (uint256)
```

_Returns the subtraction of two unsigned integers, reverting on
overflow (when the result is negative).

Counterpart to Solidity&#x27;s &#x60;-&#x60; operator.

Requirements:

- Subtraction cannot overflow._

### mul

```solidity
function mul(uint256 a, uint256 b) internal pure returns (uint256)
```

_Returns the multiplication of two unsigned integers, reverting on
overflow.

Counterpart to Solidity&#x27;s &#x60;*&#x60; operator.

Requirements:

- Multiplication cannot overflow._

### div

```solidity
function div(uint256 a, uint256 b) internal pure returns (uint256)
```

_Returns the integer division of two unsigned integers, reverting on
division by zero. The result is rounded towards zero.

Counterpart to Solidity&#x27;s &#x60;/&#x60; operator.

Requirements:

- The divisor cannot be zero._

### mod

```solidity
function mod(uint256 a, uint256 b) internal pure returns (uint256)
```

_Returns the remainder of dividing two unsigned integers. (unsigned integer modulo),
reverting when dividing by zero.

Counterpart to Solidity&#x27;s &#x60;%&#x60; operator. This function uses a &#x60;revert&#x60;
opcode (which leaves remaining gas untouched) while Solidity uses an
invalid opcode to revert (consuming all remaining gas).

Requirements:

- The divisor cannot be zero._

### sub

```solidity
function sub(uint256 a, uint256 b, string errorMessage) internal pure returns (uint256)
```

_Returns the subtraction of two unsigned integers, reverting with custom message on
overflow (when the result is negative).

CAUTION: This function is deprecated because it requires allocating memory for the error
message unnecessarily. For custom revert reasons use {trySub}.

Counterpart to Solidity&#x27;s &#x60;-&#x60; operator.

Requirements:

- Subtraction cannot overflow._

### div

```solidity
function div(uint256 a, uint256 b, string errorMessage) internal pure returns (uint256)
```

_Returns the integer division of two unsigned integers, reverting with custom message on
division by zero. The result is rounded towards zero.

Counterpart to Solidity&#x27;s &#x60;/&#x60; operator. Note: this function uses a
&#x60;revert&#x60; opcode (which leaves remaining gas untouched) while Solidity
uses an invalid opcode to revert (consuming all remaining gas).

Requirements:

- The divisor cannot be zero._

### mod

```solidity
function mod(uint256 a, uint256 b, string errorMessage) internal pure returns (uint256)
```

_Returns the remainder of dividing two unsigned integers. (unsigned integer modulo),
reverting with custom message when dividing by zero.

CAUTION: This function is deprecated because it requires allocating memory for the error
message unnecessarily. For custom revert reasons use {tryMod}.

Counterpart to Solidity&#x27;s &#x60;%&#x60; operator. This function uses a &#x60;revert&#x60;
opcode (which leaves remaining gas untouched) while Solidity uses an
invalid opcode to revert (consuming all remaining gas).

Requirements:

- The divisor cannot be zero._

