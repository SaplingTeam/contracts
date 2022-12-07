// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "@openzeppelin/contracts/access/IAccessControl.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "../lib/SaplingRoles.sol";

/**
 * @title Sapling Context
 * @notice Provides reference to protocol level access control, and basic pause
 *         functionality by extending OpenZeppelin's Pausable contract.
 */
abstract contract SaplingContext is Initializable, PausableUpgradeable {

    /// Protocol access control
    address public accessControl;

    /// Modifier to limit function access to a specific role
    modifier onlyRole(bytes32 role) {
        require(hasRole(role, msg.sender), "SaplingContext: unauthorized");
        _;
    }

    /**
     * @notice Creates a new SaplingContext.
     * @dev Addresses must not be 0.
     * @param _accessControl Protocol level access control contract address
     */
    function __SaplingContext_init(address _accessControl) internal onlyInitializing {
        __Pausable_init();

        /*
            Additional check for single init:
                do not init again if a non-zero value is present in the values yet to be initialized.
        */
        assert(accessControl == address(0));

        require(_accessControl != address(0), "SaplingContext: access control contract address is not set");
        
        accessControl = _accessControl;
    }

    /**
     * @notice Pause the contract.
     * @dev Only the functions using whenPaused and whenNotPaused modifiers will be affected by pause.
     *      Caller must have the PAUSER_ROLE. 
     */
    function pause() external onlyRole(SaplingRoles.PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Resume the contract.
     * @dev Only the functions using whenPaused and whenNotPaused modifiers will be affected by unpause.
     *      Caller must have the PAUSER_ROLE. 
     *      
     */
    function unpause() external onlyRole(SaplingRoles.PAUSER_ROLE) {
        _unpause();
    }

    /**
     * @notice Verify if an address has any non-user/management roles
     * @dev When overriding, return "contract local verification result" AND super.isNonUserAddress(party).
     * @param party Address to verify
     * @return True if the address has any roles, false otherwise
     */
    function isNonUserAddress(address party) internal view virtual returns (bool) {
        return hasRole(SaplingRoles.GOVERNANCE_ROLE, party) 
            || hasRole(SaplingRoles.TREASURY_ROLE, party)
            || hasRole(SaplingRoles.PAUSER_ROLE, party);
    }

    /**
     * @notice Verify if an address has a specific role.
     * @param role Role to check against
     * @param party Address to verify
     * @return True if the address has the specified role, false otherwise
     */
    function hasRole(bytes32 role, address party) internal view returns (bool) {
        return IAccessControl(accessControl).hasRole(role, party);
    }

    /**
     * @dev Slots reserved for future state variables
     */
    uint256[49] private __gap;
}
