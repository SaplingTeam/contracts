// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "./SaplingContext.sol";

/**
 * @title Sapling Staker Context
 * @notice Provides staker access control, and a basic close functionality.
 * @dev Close functionality is implemented in the same fashion as Openzeppelin's Pausable.
 */
abstract contract SaplingStakerContext is SaplingContext {

    /// Staker address
    address public staker;

    /// Flag indicating whether or not the pool is closed
    bool private _closed;

    /// Event for when the contract is closed
    event Closed(address account);

    /// Event for when the contract is reopened
    event Opened(address account);

    /// Event for when a new staker is set
    event StakerSet(address prevAddress, address newAddress);

    /// A modifier to limit access only to the staker
    modifier onlyStaker() {
        require(msg.sender == staker, "SaplingStakerContext: caller is the staker");
        _;
    }

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
     * @param _stakerAddress Staker address
     */
    function __SaplingStakerContext_init(
        address _accessControl,
        address _stakerAddress
    )
        internal
        onlyInitializing
    {
        __SaplingContext_init(_accessControl);

        /*
            Additional check for single init:
                do not init again if a non-zero value is present in the values yet to be initialized.
        */
        assert(_closed == false && staker == address(0));

        staker = _stakerAddress;
        _closed = true;
    }

    /**
     * @notice Designates a new staker for the pool.
     * @dev Caller must be the governance. There can only be one staker in the pool.
     *      Staked funds remain staked in the pool and will be owned by the new staker.
     * @param _staker New staker address
     */
    function setStaker(address _staker) external onlyRole(SaplingRoles.GOVERNANCE_ROLE) {
        address prevStaker = staker;
        staker = _staker;
        emit StakerSet(prevStaker, _staker);
    }

    /**
     * @notice Close the pool.
     * @dev Only the functions using whenClosed and whenNotClosed modifiers will be affected by close.
     *      Caller must have the staker role. Pool must be open.
     *
     *      Staker must have access to close function as the ability to unstake and withdraw all staked funds is
     *      only guaranteed when the pool is closed and all outstanding loans resolved. 
     */
    function close() external onlyStaker whenNotClosed {
        require(canClose(), "SaplingStakerContext: cannot close the pool under current conditions");

        _closed = true;

        emit Closed(msg.sender);
    }

    /**
     * @notice Open the pool for normal operations.
     * @dev Only the functions using whenClosed and whenNotClosed modifiers will be affected by open.
     *      Caller must have the staker role. Pool must be closed.
     */
    function open() external onlyStaker whenClosed {
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
        return party == staker || super.isNonUserAddress(party);
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
