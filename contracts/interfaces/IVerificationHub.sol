// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

/**
 * @title Verification Hub Interface
 */
interface IVerificationHub {

    /**
     * @notice Register a new Sapling Lending Pool.
     * @dev Caller must be the SaplingFactory
     * @param pool Address of the new lending pool.
     */
    function registerSaplingPool(address pool) external;

    /**
     * @notice Set an address as ID verified.
     * @dev Caller must be the governance.
     * @param party Address to set as ID verified
     */
    function verify(address party) external;

    /**
     * @notice Unset an address as ID verified.
     * @dev Caller must be the governance.
     * @param party Address to unset as ID verified
     */
    function unverify(address party) external;

    /**
     * @notice Register an address as a bad actor.
     * @dev Caller must be the governance.
     * @param party Address to set as a bad actor
     */
    function registerBadActor(address party) external;

    /**
     * @notice Unregister an address as a bad actor.
     * @dev Caller must be the governance.
     * @param party Address to unset as a bad actor
     */
    function unregisterBadActor(address party) external;

    /**
     * @notice Check if an address is a registered Sapling Lending Pool
     * @param party An address to check
     * @return True if the specified address is registered with this verification hub, false otherwise.
     */
    function isSaplingPool(address party) external view returns (bool);

    /**
     * @notice Check if an address is ID verified.
     * @param party An address to check
     * @return True if the specified address is ID verified, false otherwise.
     */
    function isVerified(address party) external view returns (bool);

    /**
     * @notice Check if an address is a bad actor.
     * @param party An address to check
     * @return True if the specified address is a bad actor, false otherwise.
     */
    function isBadActor(address party) external view returns (bool);
}
