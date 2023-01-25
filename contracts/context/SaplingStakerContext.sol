// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "./SaplingContext.sol";

/**
 * @title Sapling Staker Context
 * @notice Provides staker access control, and a basic close functionality.
 * @dev Close functionality is implemented in the same fashion as Openzeppelin's Pausable.
 */
abstract contract SaplingStakerContext is SaplingContext {

    /**
     * Staker role
     * 
     * @dev The value of this role should be unique for each pool. Role must be created before the pool contract 
     *      deployment, then passed during construction/initialization.
     */
    bytes32 public poolStakerRole;

    /// Flag indicating whether or not the pool is closed
    bool private _closed;

    /// Event for when the contract is closed
    event Closed(address account);

    /// Event for when the contract is reopened
    event Opened(address account);

    /// A modifier to limit access only to users without roles
    modifier onlyUser() {
        require(!isNonUserAddress(msg.sender), "SaplingStakerContext: caller is not a user");
        _;
    }

    /// Modifier to limit function access to when the contract is not closed
    modifier whenNotClosed {
        require(!_closed, "SaplingStakerContext: closed");
        _;
    }

    /// Modifier to limit function access to when the contract is closed
    modifier whenClosed {
        require(_closed, "SaplingStakerContext: not closed");
        _;
    }

    /**
     * @notice Create a new SaplingStakerContext.
     * @dev Addresses must not be 0.
     * @param _accessControl Access control contract address
     * @param _stakerRole Staker role
     */
    function __SaplingStakerContext_init(
        address _accessControl,
        bytes32 _stakerRole
    )
        internal
        onlyInitializing
    {
        __SaplingContext_init(_accessControl);

        /*
            Additional check for single init:
                do not init again if a non-zero value is present in the values yet to be initialized.
        */
        assert(_closed == false && poolStakerRole == 0x00);

        poolStakerRole = _stakerRole;
        _closed = true;
    }

    /**
     * @notice Close the pool.
     * @dev Only the functions using whenClosed and whenNotClosed modifiers will be affected by close.
     *      Caller must have the staker role. Pool must be open.
     *
     *      Staker must have access to close function as the ability to unstake and withdraw all staked funds is
     *      only guaranteed when the pool is closed and all outstanding loans resolved. 
     */
    function close() external onlyRole(poolStakerRole) whenNotClosed {
        require(canClose(), "SaplingStakerContext: cannot close the pool under current conditions");

        _closed = true;

        emit Closed(msg.sender);
    }

    /**
     * @notice Open the pool for normal operations.
     * @dev Only the functions using whenClosed and whenNotClosed modifiers will be affected by open.
     *      Caller must have the staker role. Pool must be closed.
     */
    function open() external onlyRole(poolStakerRole) whenClosed {
        require(canOpen(), "SaplingStakerContext: cannot open the pool under current conditions");
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
        return hasRole(poolStakerRole, party) || super.isNonUserAddress(party);
    }

    /**
     * @notice Indicates whether or not the contract can be closed in it's current state.
     * @dev A hook for the extending contract to implement.
     * @return True if the conditions of the closure are met, false otherwise.
     */
    function canClose() internal view virtual returns (bool) {
        return true;
    }

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
