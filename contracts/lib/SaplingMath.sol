// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

/**
 * Sapling math library
 */
library SaplingMath {
    
    /// The mumber of decimal digits in percentage values
    uint8 public constant PERCENT_DECIMALS = 1;

    /// A constant representing 100%
    uint16 public constant HUNDRED_PERCENT = uint16(100 * 10 ** PERCENT_DECIMALS);
}