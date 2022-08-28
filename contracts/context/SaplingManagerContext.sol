// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.15;

import "./SaplingContext.sol";

/**
 * @title Sapling Manager Context
 * @notice Provides manager access control, and a basic close functionality.
 */
abstract contract SaplingManagerContext is SaplingContext {

    /// Manager address
    address public manager;

    /// Flag indicating whether or not the pool is closed
    bool private _closed;

    /**
     * @notice Grace period for the manager to be inactive on a given loan /cancel/default decision. 
     *         After this grace period of managers inaction on a given loan authorized parties
     *         can also call cancel() and default(). Other requirements for loan cancellation/default still apply.
     */
    uint256 public constant MANAGER_INACTIVITY_GRACE_PERIOD = 90 days;
    
    /// A modifier to limit access only to the manager
    modifier onlyManager {
        require(msg.sender == manager, "SaplingManagerContext: caller is not the manager");
        _;
    }    

    /// A modifier to limit access to the manager or to other applicable parties when the manager is considered inactive
    modifier managerOrApprovedOnInactive {
        require(msg.sender == manager || authorizedOnInactiveManager(msg.sender),
            "SaplingManagerContext: caller is neither the manager nor an approved party");
        _;
    }

    /// A modifier to limit access only to non-management users
    modifier onlyUser() {
        require(msg.sender != manager && msg.sender != governance && msg.sender != protocol,
             "SaplingManagerContext: caller is not a user");
        _;
    }

    /// Event for when the contract is closed
    event Closed(address account);

    /// Event for when the contract is reopened
    event Opened(address account);

    /// Modifier to limit function access to when the contract is not closed
    modifier whenNotClosed {
        require(!_closed, "SaplingManagerContext: closed");
        _;
    }

    /// Modifier to limit function access to when the contract is closed
    modifier whenClosed {
        require(_closed, "SaplingManagerContext: not closed");
        _;
    }

    /**
     * @notice Create a new SaplingManagedContext.
     * @dev Addresses must not be 0.
     * @param _governance Governance address
     * @param _protocol Protocol wallet address
     * @param _manager Manager address
     */
    constructor(address _governance, address _protocol, address _manager) SaplingContext(_governance, _protocol) {
        require(_manager != address(0), "SaplingManagerContext: manager address is not set");
        manager = _manager;
        _closed = false;
    }

    /**
     * @notice Close the pool and stop borrowing, lender deposits, and staking. 
     * @dev Caller must be the manager. 
     *      Pool must be open.
     *      No loans or approvals must be outstanding (borrowedFunds must equal to 0).
     *      Emits 'PoolClosed' event.
     */
    function close() external onlyManager whenNotClosed {
        require(canClose(), "SaplingManagerContext: cannot close the pool with outstanding loans");
        _closed = true;
        emit Closed(msg.sender);
    }

    /**
     * @notice Open the pool for normal operations. 
     * @dev Caller must be the manager. 
     *      Pool must be closed.
     *      Opening the pool will not unpause any pauses in effect.
     *      Emits 'PoolOpened' event.
     */
    function open() external onlyManager whenClosed {
        _closed = false;
        emit Opened(msg.sender);
    }

    /**
     * @notice Indicates whether or not the contract is closed.
     * @return True if the contract is closed, false otherwise.
     */
    function closed() public view returns (bool) {
        return _closed;
    }

    /**
     * @notice Indicates whether or not the contract can be closed in it's current state.
     * @dev A hook for the extending contract to implement.
     * @return True if the contract is closed, false otherwise.
     */
    function canClose() virtual internal view returns (bool);

    /**
     * @notice Indicates whether or not the the caller is authorized to take applicable managing actions when the 
     *         manager is inactive.
     * @dev A hook for the extending contract to implement.
     * @param caller Caller's address.
     * @return True if the caller is authorized at this time, false otherwise.
     */
    function authorizedOnInactiveManager(address caller) virtual internal view returns (bool);
}
