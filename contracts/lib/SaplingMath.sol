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

    /*
     * Math safe and intended limits
     */

    /// Math safe upper bound for percentage of paid interest to be allocated as protocol fee
    uint16 public constant MAX_PROTOCOL_FEE_PERCENT = uint16(50 * 10 ** PERCENT_DECIMALS);

    /// Math safe minimum loan duration in seconds
    uint256 public constant SAFE_MIN_DURATION = 1 days;

    /// Math safe maximum loan duration in seconds
    uint256 public constant SAFE_MAX_DURATION = 51 * 365 days;

    /// Minimum allowed loan payment grace period
    uint256 public constant MIN_LOAN_GRACE_PERIOD = 3 days;

    /// Maximum allowed loan payment grace period
    uint256 public constant MAX_LOAN_GRACE_PERIOD = 365 days;

    /// Safe minimum for APR values
    uint16 public constant SAFE_MIN_APR = 0; // 0%

    /// Math safe minimum loan amount, raw value
    uint256 public constant SAFE_MIN_AMOUNT = 10 ** 6;
}