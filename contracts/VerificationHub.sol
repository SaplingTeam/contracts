// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import "./context/SaplingContext.sol";
import "./interfaces/IVerificationHub.sol";

/**
 * @title Verification Hub
 * @notice Provides a single point for on-chain address verification for Sapling protocol and others who may wish to 
 *         use the address verification database maintained in the contract.
 */
contract VerificationHub is IVerificationHub, SaplingContext {

    /// Address of the sapling factory
    address private saplingFactory;

    /// Registered lending pools
    mapping (address => bool) private saplingLendingPools;

    /// Registered bad actors
    mapping (address => bool) private badActorList;

    /// ID verified addresses
    mapping (address => bool) private verifiedList;

    /// Event for when a new SaplingFactory is set
    event PoolFactorySet(address from, address to);

    /// A modifier to limit access to the SaplingFactory
    modifier onlySaplingFactory {
        require(msg.sender == saplingFactory, "VerificationHub: caller is not the manager");
        _;
    }

    /**
     * @notice Creates a new VerificationHub.
     * @dev Addresses must not be 0.
     * @param _governance Governance address
     * @param _protocol Protocol wallet address
     */
    constructor(address _governance, address _protocol) SaplingContext(_governance, _protocol) {
    }

    /**
     * @notice Set new SaplingFactory.
     * @dev New address must not be zero and must be different from the previous address.
     *      Caller must be the governance.
     * @param _saplingFactory Address of the new SaplingFactory
     */
    function setSaplingFactory(address _saplingFactory) external onlyGovernance {
        require(_saplingFactory != address(0) && _saplingFactory != saplingFactory, 
            "VerificationHub: invalid sapling factory address");
        address prevAddress = saplingFactory;
        saplingFactory = _saplingFactory;
        emit PoolFactorySet(prevAddress, protocol);
    }

    /**
     * @notice Register a new Sapling Lending Pool.
     * @dev Caller must be the SaplingFactory
     * @param pool Address of the new lending pool.
     */
    function registerSaplingPool(address pool) external onlySaplingFactory whenNotPaused {
        saplingLendingPools[pool] = true;
    }

    /**
     * @notice Set an address as ID verified.
     * @dev Caller must be the governance.
     * @param party Address to set as ID verified
     */
    function verify(address party) external onlyGovernance {
        verifiedList[party] = true;
    }

    /**
     * @notice Unset an address as ID verified.
     * @dev Caller must be the governance.
     * @param party Address to unset as ID verified
     */
    function unverify(address party) external onlyGovernance {
        verifiedList[party] = false;
    }

    /**
     * @notice Register an address as a bad actor.
     * @dev Caller must be the governance.
     * @param party Address to set as a bad actor
     */
    function registerBadActor(address party) external onlyGovernance {
        badActorList[party] = true;
    }

    /**
     * @notice Unregister an address as a bad actor.
     * @dev Caller must be the governance.
     * @param party Address to unset as a bad actor
     */
    function unregisterBadActor(address party) external onlyGovernance {
        badActorList[party] = false;
    }

    /**
     * @notice Check if an address is a registered Sapling Lending Pool
     * @param party An address to check
     * @return True if the specified address is registered with this verification hub, false otherwise.
     */
    function isSaplingPool(address party) external view returns (bool) {
        return saplingLendingPools[party];
    }

    /**
     * @notice Check if an address is ID verified.
     * @param party An address to check
     * @return True if the specified address is ID verified, false otherwise.
     */
    function isVerified(address party) external view returns (bool) {
        return verifiedList[party];
    }
    
    /**
     * @notice Check if an address is a bad actor.
     * @param party An address to check
     * @return True if the specified address is a bad actor, false otherwise.
     */
    function isBadActor(address party) external view returns (bool) {
        return badActorList[party];
    }
}
