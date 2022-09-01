// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../interfaces/IMath.sol";

/**
 * @title Sapling Math Context
 * @notice Provides common math constants and library imports.
 */
abstract contract SaplingMathContext is IMath {

    /// Number of decimal digits in integer percent values used across the contract
    uint16 public immutable percentDecimals;

    /// A constant representing 100%
    uint16 public immutable oneHundredPercent;

    /**
     * @notice Create a new SaplingMathContext.
     */
    constructor() {
        percentDecimals = 1;
        oneHundredPercent = uint16(100 * 10 ** percentDecimals);
    }
}
