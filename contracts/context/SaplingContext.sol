// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "@openzeppelin/contracts/access/IAccessControl.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "./SaplingRoles.sol";

/**
 * @title Sapling Context
 * @notice Provides governance access control, a common reference to the treasury wallet address, and basic pause
 *         functionality by extending OpenZeppelin's Pausable contract.
 */
abstract contract SaplingContext is Initializable, PausableUpgradeable {

    /// Protocol access control
    address public accessControl;

    modifier onlyRole(bytes32 role) {
        require(IAccessControl(accessControl).hasRole(role, msg.sender), "SaplingContext: unauthorized");
        _;
    }

    /**
     * @notice Creates a new SaplingContext.
     * @dev Addresses must not be 0.
     * @param _accessControl Access control contract
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
     * @dev Caller must be the governance.
     *      Only the functions using whenPaused and whenNotPaused modifiers will be affected by pause.
     */
    function pause() external onlyRole(SaplingRoles.PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Resume the contract.
     * @dev Caller must be the governance.
     *      Only the functions using whenPaused and whenNotPaused modifiers will be affected by unpause.
     */
    function unpause() external onlyRole(SaplingRoles.PAUSER_ROLE) {
        _unpause();
    }


    /**
     * @notice Hook that is called to verify if an address is currently in any non-user/management position.
     * @dev When overriding, return "contract local verification result" AND super.isNonUserAddress(party).
     * @param party Address to verify
     */
    function isNonUserAddress(address party) internal view virtual returns (bool) {
        return IAccessControl(accessControl).hasRole(SaplingRoles.GOVERNANCE_ROLE, party) 
            || IAccessControl(accessControl).hasRole(SaplingRoles.TREASURY_ROLE, party)
            || IAccessControl(accessControl).hasRole(SaplingRoles.PAUSER_ROLE, party);
    }
}
