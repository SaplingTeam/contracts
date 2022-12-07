// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

/**
 * Protocol level Sapling roles
 */
library SaplingRoles {
    
    /// Admin of the core access control 
    bytes32 public constant DEFAULT_ADMIN_ROLE = 0x00;

    /// Protocol governance role
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");

    /// Protocol treasury role
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");

    /**
     * @dev Pauser can be governance or an entity/bot designated as a monitor that 
     *      enacts a pause on emergencies or anomalies.
     *      
     *      PAUSER_ROLE is a protocol level role and should not be granted to pool managers or to users. Doing so would 
     *      give the role holder the ability to pause not just their pool, but any contract within the protocol.
     */
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
}