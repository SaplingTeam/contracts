// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "../context/SaplingStakerContext.sol";

/**
 * @dev Exposes selected internal functions and/or modifiers for direct calling for testing purposes.
 */
contract SaplingStakerContextTester is SaplingStakerContext {

    uint256 public value;

    event ValueChanged(uint256 prevValue, uint256 newValue);


    /**
     * @dev Initializer
     * @param _accessControl Access control contract
     * @param _stakerRole Staker role
     */
    function initialize(
        address _accessControl,
        bytes32 _stakerRole
    )
        public
        initializer
    {
         __SaplingStakerContext_init(_accessControl, _stakerRole);
    }

    /**
     * @dev Wrapper for an internal function
     */
    function isNonUserAddressWrapper(address party) external view returns (bool) {
        return isNonUserAddress(party);
    }

    /**
     * @dev A state changing function with onlyUser modifier
     * @param newValue, new 
     */
    function someOnlyUserFunction(uint256 newValue) external onlyUser {
        uint256 prevValue = value;
        value = newValue;

        emit ValueChanged(prevValue, newValue);
    }
}
