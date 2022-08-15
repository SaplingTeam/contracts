// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.15;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./SaplingContext.sol";

abstract contract SaplingManagerContext is SaplingContext, ReentrancyGuard {

    /// Pool manager address
    address public manager;

    /// Flag indicating whether or not the pool is closed
    bool private _closed;

    /**
     * @notice Grace period for the manager to be inactive on a given loan /cancel/default decision. 
     *         After this grace period of managers inaction on a given loan authorised parties
     *         can also call cancel() and default(). Other requirements for loan cancellation/default still apply.
     */
    uint256 public constant MANAGER_INACTIVITY_GRACE_PERIOD = 90 days;
    
    modifier onlyManager {
        // direct use of msg.sender is intentional
        require(msg.sender == manager, "Sapling: Caller is not the manager");
        _;
    }    

    modifier managerOrApprovedOnInactive {
        require(msg.sender == manager || authorizedOnInactiveManager(msg.sender),
            "Managed: caller is not the manager or an approved party.");
        _;
    }

    modifier onlyUser() {
        require(msg.sender != manager && msg.sender != governance && msg.sender != protocol, "SaplingPool: Caller is not a valid lender.");
        _;
    }

    event Closed(address account);
    event Opened(address account);

    modifier whenNotClosed {
        require(!_closed, "Sapling: closed");
        _;
    }

    modifier whenClosed {
        require(_closed, "Sapling: not closed");
        _;
    }

    /**
     * @notice Create a managed lending pool.
     * @dev msg.sender will be assigned as the manager of the created pool.
     * @param _manager Address of the pool manager
     * @param _governance Address of the protocol governance.
     * @param _protocol Address of a wallet to accumulate protocol earnings.
     */
    constructor(address _manager, address _governance, address _protocol) SaplingContext(_governance, _protocol) {
        require(_manager != address(0), "Sapling: Manager address is not set");
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
        require(canClose(), "Cannot close pool with outstanding loans.");
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

    function closed() public view returns (bool) {
        return _closed;
    }

    function canClose() virtual internal view returns (bool);

    function authorizedOnInactiveManager(address caller) virtual internal view returns (bool);
}
