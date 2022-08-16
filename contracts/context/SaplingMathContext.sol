// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.15;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "../interfaces/IMath.sol";

abstract contract SaplingMathContext is IMath {

    /// Number of decimal digits in integer percent values used across the contract
    uint16 public constant PERCENT_DECIMALS = 1;

    /// A constant representing 100%
    uint16 public immutable ONE_HUNDRED_PERCENT;

    constructor() {
        ONE_HUNDRED_PERCENT = uint16(100 * 10 ** PERCENT_DECIMALS);
    }
}