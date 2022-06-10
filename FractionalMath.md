# Solidity API

## FractionalMath

### mulDiv

```solidity
function mulDiv(uint256 x, uint256 y, uint256 denominator) internal pure returns (uint256 result)
```

Calculates floor(x * y / denominator) with full precision. Throws if result overflows a uint256 or denominator &#x3D;&#x3D; 0

_Original credit to Remco Bloemen under MIT license (https://xn--2-umb.com/21/muldiv)
with further edits by Uniswap Labs also under MIT license._

