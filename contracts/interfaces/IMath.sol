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
}
