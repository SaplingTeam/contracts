// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v4.7.0) (access/Ownable.sol)
pragma solidity ^0.8.15;

/**
 * @dev Interface to make Openzeppelin's Ownable contract functions easily callable without importing the whole Ownable 
 *      contract and it's dependencies.
 */
interface IOwnable {
    function transferOwnership(address newOwner) external;
}
