// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/access/Ownable.sol";


/**
 * @title Factory base
 * @dev Provides Ownable and shutdown/selfdestruct
 */
abstract contract FactoryBase is Ownable {

    /**
     * @dev permanently shutdown this factory and the sub-factories it manages by self-destructing them.
     */
    function shutdown() external virtual onlyOwner {
        preShutdown();
        selfdestruct(payable(address(0)));
    }

    /**
     * Pre shutdown handler for extending contracts to override
     */
    function preShutdown() internal virtual onlyOwner {}
}
