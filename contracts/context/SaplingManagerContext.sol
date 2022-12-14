// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "./SaplingContext.sol";

/**
 * @title Sapling Manager Context
 * @notice Provides manager access control, and a basic close functionality.
 * @dev Close functionality is implemented in the same fashion as Openzeppelin's Pausable. 
 */
abstract contract SaplingManagerContext is SaplingContext {

    /*
     * Pool manager role
     * 
     * @dev The value of this role should be unique for each pool. Role must be created before the pool contract 
     *      deployment, then passed during construction/initialization.
     */
    bytes32 public poolManagerRole;

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
     * @param _accessControl Access control contract address
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
        assert(_closed == false && poolManagerRole == 0x00);

        poolManagerRole = _managerRole;
        _closed = true;
    }

    /**
     * @notice Close the pool.
     * @dev Only the functions using whenClosed and whenNotClosed modifiers will be affected by close.
     *      Caller must have the pool manager role. Pool must be open.
     *
     *      Manager must have access to close function as the ability to unstake and withdraw all manager funds is 
     *      only guaranteed when the pool is closed and all outstanding loans resolved. 
     */
    function close() external onlyRole(poolManagerRole) whenNotClosed {
        require(canClose(), "SaplingManagerContext: cannot close the pool under current conditions");

        _closed = true;

        emit Closed(msg.sender);
    }

    /**
     * @notice Open the pool for normal operations.
     * @dev Only the functions using whenClosed and whenNotClosed modifiers will be affected by open.
     *      Caller must have the pool manager role. Pool must be closed.
     */
    function open() external onlyRole(poolManagerRole) whenClosed {
        require(canOpen(), "SaplingManagerContext: cannot open the pool under current conditions");
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
     * @notice Verify if an address has any non-user/management roles
     * @dev Overrides the same function in SaplingContext
     * @param party Address to verify
     * @return True if the address has any roles, false otherwise
     */
    function isNonUserAddress(address party) internal view override returns (bool) {
        return hasRole(poolManagerRole, party) || super.isNonUserAddress(party);
    }

    /**
     * @notice Indicates whether or not the contract can be closed in it's current state.
     * @dev A hook for the extending contract to implement.
     * @return True if the conditions of the closure are met, false otherwise.
     */
    function canClose() internal view virtual returns (bool);

    /**
     * @notice Indicates whether or not the contract can be opened in it's current state.
     * @dev A hook for the extending contract to implement.
     * @return True if the conditions to open are met, false otherwise.
     */
    function canOpen() internal view virtual returns (bool) {
        return true;
    }

    /**
     * @dev Slots reserved for future state variables
     */
    uint256[48] private __gap;
}
