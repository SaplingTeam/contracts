// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.7.0) (access/Ownable.sol)
pragma solidity ^0.8.15;

/**
 * @dev interface to make Ownable contract functions callable without importing the whole Ownable contract and it's dependencies.
 */
interface IOwnable {
    function transferOwnership(address newOwner) external;
}
