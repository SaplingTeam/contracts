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
     * @param _stakerAddress Staker address
     */
    function initialize(
        address _accessControl,
        address _stakerAddress
    )
        public
        initializer
    {
         __SaplingStakerContext_init(_accessControl, _stakerAddress);
    }

    /**
     * @dev Wrapper for an internal function
     */
    function isNonUserAddressWrapper(address party) external view returns (bool) {
        return isNonUserAddress(party);
    }

    /**
     * @dev Wrapper for an internal function
     */
    function canCloseWrapper() external view returns (bool) {
        return canClose();
    }

    /**
     * @dev Wrapper for an internal function
     */
    function canOpenWrapper() external view returns (bool) {
        return canOpen();
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
