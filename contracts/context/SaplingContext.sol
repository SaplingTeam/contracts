// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.15;

import "@openzeppelin/contracts/security/Pausable.sol";

abstract contract SaplingContext is Pausable {

    /// Protocol governance
    address public governance;

    /// Protocol wallet address
    address public protocol;

    /// Event emitted when a new governance is set
    event GovernanceTransferred(address from, address to);
    event ProtocolWalletSet(address from, address to);

    /// A modifier to limit access to the governance
    modifier onlyGovernance {
        // direct use of msg.sender is intentional
        require(msg.sender == governance, "Managed: Caller is not the governance");
        _;
    }

    /**
     * @notice Creates new SaplingContext instance.
     * @dev _governance must not be 0
     * @param _governance Address of the protocol governance.
     */
    constructor(address _governance, address _protocol) {
        require(_governance != address(0), "Sapling: Governance address is not set");
        require(_protocol != address(0), "Sapling: Protocol wallet address is not set");
        governance = _governance;
        protocol = _protocol;
    }

    /**
     * @notice Transfer the governance.
     * @dev Caller must be governance. 
     *      _governance must not be 0.
     * @param _governance Address of the new governance.
     */
    function transferGovernance(address _governance) external onlyGovernance {
        require(_governance != address(0) && _governance != governance, "Governed: New governance address is invalid.");
        address prevGovernance = governance;
        governance = _governance;
        emit GovernanceTransferred(prevGovernance, governance);
    }

    function setProtocolWallet(address _protocol) external onlyGovernance {
        require(_protocol != address(0) && _protocol != protocol, "Governed: New protocol wallet address is invalid.");
        address prevProtocol = protocol;
        protocol = _protocol;
        emit ProtocolWalletSet(prevProtocol, protocol);
    }

    function pause() external onlyGovernance {
        _pause();
    }

    function unpause() external onlyGovernance {
        _unpause();
    }
}
