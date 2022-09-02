// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @title Additional security configuration interface
 */
interface ISecurity {

    /**
     * @dev Disable initializers
     */
    function disableIntitializers() external;
}
