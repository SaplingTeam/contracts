// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

library SaplingMath {
    
    uint16 public constant percentDecimals = 1;

    /// A constant representing 100%
    uint16 public constant oneHundredPercent = uint16(100 * 10 ** percentDecimals);
}