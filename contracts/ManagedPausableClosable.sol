// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.15;

/**
 * @title ManagedPausableClosable
 * @notice Provides management access control, lending pause and close functionality.
 * @dev This contract is abstract. Extend the contract and override virtual methods.
 */
abstract contract ManagedPausableClosable {

    /// Pool manager address
    address public manager;

    /// Flag indicating whether or not the pool is closed
    bool public isClosed;

    /// Flag indicating whether or not lending is paused
    bool public isLendingPaused;

    event LendingPaused();
    event LendingResumed();
    event PoolClosed();
    event PoolOpened();

    modifier onlyManager {
        require(msg.sender == manager, "Managed: caller is not the manager");
        _;
    }

    modifier managerOrApprovedOnInactive {
        require(msg.sender == manager || authorizedOnInactiveManager(msg.sender),
            "Managed: caller is not the manager or an approved party.");
        _;
    }

    modifier whenNotClosed {
        require(!isClosed, "Pool is closed.");
        _;
    }

    modifier whenClosed {
        require(isClosed, "Pool is closed.");
        _;
    }

    modifier whenLendingNotPaused {
        require(!isLendingPaused, "Lending is paused.");
        _;
    }

    modifier whenLendingPaused {
        require(isLendingPaused, "Lending is not paused.");
        _;
    }

    /**
     * @notice Create a managed lending pool.
     * @dev msg.sender will be assigned as the manager of the created pool.
     * @param _manager Address of the pool manager
     */
    constructor(address _manager) {
        require(_manager != address(0));
        
        manager = _manager;

        isLendingPaused = false;
        isClosed = false;
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
        isClosed = true;
        emit PoolClosed();
    }

    /**
     * @notice Open the pool for normal operations. 
     * @dev Caller must be the manager. 
     *      Pool must be closed.
     *      Opening the pool will not unpause any pauses in effect.
     *      Emits 'PoolOpened' event.
     */
    function open() external onlyManager whenClosed {
        isClosed = false;
        emit PoolOpened();
    }

    /**
     * @notice Pause new loan requests, approvals, and unstaking.
     * @dev Caller must be the manager.
     *      Lending must not be paused.
     *      Lending can be paused regardless of the pool open/close and governance pause states, 
     *      but some of the states may have a higher priority making pausing irrelevant.
     *      Emits 'LendingPaused' event.
     */
    function pauseLending() external onlyManager whenLendingNotPaused {
        isLendingPaused = true;
        emit LendingPaused();
    }

    /**
     * @notice Resume new loan requests, approvals, and unstaking.
     * @dev Caller must be the manager.
     *      Lending must be paused.
     *      Lending can be resumed regardless of the pool open/close and governance pause states, 
     *      but some of the states may have a higher priority making resuming irrelevant.
     *      Emits 'LendingPaused' event.
     */
    function resumeLending() external onlyManager whenLendingPaused {
        isLendingPaused = false;
        emit LendingResumed();
    }

    function canClose() virtual internal view returns (bool);

    function authorizedOnInactiveManager(address caller) virtual internal view returns (bool);
}
