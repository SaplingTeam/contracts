// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "./SaplingContext.sol";

/**
 * @title Sapling Manager Context
 * @notice Provides manager access control, and a basic close functionality.
 */
abstract contract SaplingManagerContext is SaplingContext {

    /// Manager role
    bytes32 public POOL_MANAGER_ROLE;

    /// Flag indicating whether or not the pool is closed
    bool private _closed;

    /// Event for when the contract is closed
    event Closed(address account);

    /// Event for when the contract is reopened
    event Opened(address account);

    /// A modifier to limit access only to non-management users
    modifier onlyUser() {
        require(!isNonUserAddress(msg.sender), "SaplingManagerContext: caller is not a user");
        _;
    }

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
     * @param _accessControl Access control contract
     * @param _managerRole Manager role
     */
    function __SaplingManagerContext_init(
        address _accessControl,
        bytes32 _managerRole
    )
        internal
        onlyInitializing
    {
        __SaplingContext_init(_accessControl);

        /*
            Additional check for single init:
                do not init again if a non-zero value is present in the values yet to be initialized.
        */
        assert(_closed == false && POOL_MANAGER_ROLE == 0x00);

        POOL_MANAGER_ROLE = _managerRole;
        _closed = false;
    }

    /**
     * @notice Close the pool and stop borrowing, lender deposits, and staking.
     * @dev Caller must be the manager.
     *      Pool must be open.
     *      No loans or approvals must be outstanding (borrowedFunds must equal to 0).
     *      Emits 'PoolClosed' event.
     */
    function close() external onlyRole(POOL_MANAGER_ROLE) whenNotClosed {
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
    function open() external onlyRole(POOL_MANAGER_ROLE) whenClosed {
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
     * @notice Verify if an address is currently in any non-user/management position.
     * @dev a hook in Sampling Context
     * @param party Address to verify
     */
    function isNonUserAddress(address party) internal view override returns (bool) {
        return hasRole(POOL_MANAGER_ROLE, party) || super.isNonUserAddress(party);
    }

    /**
     * @notice Indicates whether or not the contract can be closed in it's current state.
     * @dev A hook for the extending contract to implement.
     * @return True if the contract is closed, false otherwise.
     */
    function canClose() internal view virtual returns (bool);

    /**
     * @dev Slots reserved for future state variables
     */
    uint256[48] private __gap;
}
