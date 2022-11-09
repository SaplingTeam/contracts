// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlEnumerableUpgradeable.sol";

/**
 * @title Sapling Context
 * @notice Provides governance access control, a common reference to the treasury wallet address, and basic pause
 *         functionality by extending OpenZeppelin's Pausable contract.
 */
abstract contract SaplingContext is Initializable, AccessControlEnumerableUpgradeable, PausableUpgradeable {

    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");

    /// Protocol governance
    address public governance;

    /// Protocol treasury wallet address
    address public treasury;

    /// Event for when a new governance is set
    event GovernanceTransferred(address from, address to);

    /// Event for when a new treasury wallet is set
    event TreasuryWalletTransferred(address from, address to);

    /**
     * @notice Creates a new SaplingContext.
     * @dev Addresses must not be 0.
     * @param _governance Governance address
     * @param _treasury Treasury wallet address
     */
    function __SaplingContext_init(address _governance, address _treasury) internal onlyInitializing {
        __AccessControlEnumerable_init();
        __Pausable_init();

        /*
            Additional check for single init:
                do not init again if a non-zero value is present in the values yet to be initialized.
        */
        assert(governance == address(0) && treasury == address(0));

        require(_governance != address(0), "SaplingContext: governance address is not set");
        require(_treasury != address(0), "SaplingContext: treasury wallet address is not set");
        
        governance = _governance;
        treasury = _treasury;

        _grantRole(DEFAULT_ADMIN_ROLE, _governance);
        _grantRole(TREASURY_ROLE, _treasury);
    }

    /**
     * @notice Pause the contract.
     * @dev Caller must be the governance.
     *      Only the functions using whenPaused and whenNotPaused modifiers will be affected by pause.
     */
    function pause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _pause();
    }

    /**
     * @notice Resume the contract.
     * @dev Caller must be the governance.
     *      Only the functions using whenPaused and whenNotPaused modifiers will be affected by unpause.
     */
    function unpause() external onlyRole(DEFAULT_ADMIN_ROLE) {
        _unpause();
    }

    /**
     * @notice Transfer the governance.
     * @dev Caller must be the governance.
     *      New governance address must not be 0, and must not be one of current non-user addresses.
     * @param _governance New governance address.
     */
    function transferGovernance(address _governance) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(
            _governance != address(0) && !isNonUserAddress(_governance),
            "SaplingContext: invalid governance address"
        );

        address prevGovernance = governance;
        governance = _governance;

        _grantRole(DEFAULT_ADMIN_ROLE, governance);
        _revokeRole(DEFAULT_ADMIN_ROLE, prevGovernance);

        emit GovernanceTransferred(prevGovernance, governance);
    }

    /**
     * @notice Transfer the treasury role.
     * @dev Caller must be the governance.
     *      New treasury address must not be 0, and must not be one of current non-user addresses.
     * @param _treasury New treasury wallet address
     */
    function transferTreasury(address _treasury) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(
            _treasury != address(0) && !isNonUserAddress(_treasury),
            "SaplingContext: invalid treasury wallet address"
        );

        address prevTreasury = treasury;
        treasury = _treasury;

        _grantRole(TREASURY_ROLE, treasury);
        _revokeRole(TREASURY_ROLE, prevTreasury);

        emit TreasuryWalletTransferred(prevTreasury, treasury);

        afterTreasuryWalletTransfer(prevTreasury);
    }

    /**
     * @notice Hook that is called after a new treasury wallet address has been set.
     * @param from Address of the previous treasury wallet.
     */
    function afterTreasuryWalletTransfer(address from) internal virtual {}

    /**
     * @notice Hook that is called to verify if an address is currently in any non-user/management position.
     * @dev When overriding, return "contract local verification result" AND super.isNonUserAddress(party).
     * @param party Address to verify
     */
    function isNonUserAddress(address party) internal view virtual returns (bool) {
        return party == governance || party == treasury;
    }
}
