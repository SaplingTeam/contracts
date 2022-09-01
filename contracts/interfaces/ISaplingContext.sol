// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @title Sapling Context Interface
 */
interface ISaplingContext {

    /**
     * @notice Transfer the governance.
     * @dev Caller must be the governance.
     *      New governance address must not be 0, and must not be one of current non-user addresses.
     * @param _governance New governance address.
     */
    function transferGovernance(address _governance) external;
}
