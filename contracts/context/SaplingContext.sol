// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "@openzeppelin/contracts/security/Pausable.sol";

/**
 * @title Sapling Context
 * @notice Provides governance access control, a common reverence to the treasury wallet address, and basic pause
 *         functionality by extending OpenZeppelin's Pausable contract.
 */
abstract contract SaplingContext is Pausable {

    /// Protocol governance
    address public governance;

    /// Protocol treasury wallet address
    address public treasury;

    /// Event for when a new governance is set
    event GovernanceTransferred(address from, address to);

    /// Event for when a new treasury wallet is set
    event TreasuryWalletTransferred(address from, address to);

    /// A modifier to limit access only to the governance
    modifier onlyGovernance {
        require(msg.sender == governance, "SaplingContext: caller is not the governance");
        _;
    }

    /**
     * @notice Creates a new SaplingContext.
     * @dev Addresses must not be 0.
     * @param _governance Governance address
     * @param _treasury Treasury wallet address
     */
    constructor(address _governance, address _treasury) {
        require(_governance != address(0), "SaplingContext: governance address is not set");
        require(_treasury != address(0), "SaplingContext: treasury wallet address is not set");
        governance = _governance;
        treasury = _treasury;
    }

    /**
     * @notice Pause the contract.
     * @dev Caller must be the governance.
     *      Only the functions using whenPaused and whenNotPaused modifiers will be affected by pause.
     */
    function pause() external onlyGovernance {
        _pause();
    }

    /**
     * @notice Resume the contract.
     * @dev Caller must be the governance.
     *      Only the functions using whenPaused and whenNotPaused modifiers will be affected by unpause.
     */
    function unpause() external onlyGovernance {
        _unpause();
    }

    /**
     * @notice Transfer the governance.
     * @dev Caller must be the governance.
     *      New governance address must not be 0, and must not be one of current non-user addresses.
     * @param _governance New governance address.
     */
    function transferGovernance(address _governance) external onlyGovernance {
        require(
            _governance != address(0) && !isNonUserAddress(_governance),
            "SaplingContext: invalid governance address"
        );
        address prevGovernance = governance;
        governance = _governance;
        emit GovernanceTransferred(prevGovernance, governance);
    }

    /**
     * @notice Transfer the treasury role.
     * @dev Caller must be the governance.
     *      New treasury address must not be 0, and must not be one of current non-user addresses.
     * @param _treasury New treasury wallet address
     */
    function transferTreasury(address _treasury) external onlyGovernance {
        require(
            _treasury != address(0) && !isNonUserAddress(_treasury),
            "SaplingContext: invalid treasury wallet address"
        );
        address prevTreasury = treasury;
        treasury = _treasury;
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
