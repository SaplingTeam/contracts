// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @title Math Context Interface
 */
interface IMath {

    /**
     * @notice Accessor for percentage value decimals used in the current context.
     * @return Number of decimal digits in integer percent values used across the contract.
     */
    function percentDecimals() external view returns (uint16);

    /**
     * @notice Accessor for a contract representation of 100%
     * @return An integer constant representing 100%
     */
    function oneHundredPercent() external view returns (uint16);
}
