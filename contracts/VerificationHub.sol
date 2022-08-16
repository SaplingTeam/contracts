// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import "./context/SaplingContext.sol";
import "./interfaces/IVerificationHub.sol";

contract VerificationHub is IVerificationHub, SaplingContext {

    address private saplingFactory;

    mapping (address => bool) private saplingLendingPools;
    mapping (address => bool) private bannedList;
    mapping (address => bool) private verifiedList;

    event PoolFactorySet(address from, address to);

    modifier onlySaplingFactory {
        // direct use of msg.sender is intentional
        require(msg.sender == saplingFactory, "Sapling: Caller is not the manager");
        _;
    }

    constructor(address _governance, address _protocol) SaplingContext(_governance, _protocol) {
    }

    function setSaplingFactory(address _saplingFactory) external onlyGovernance {
        require(_saplingFactory != address(0) && _saplingFactory != saplingFactory, "VerificationHub: new address is invalid");
        address prevAddress = saplingFactory;
        saplingFactory = _saplingFactory;
        emit PoolFactorySet(prevAddress, protocol);
    }

    function ban(address party) external onlyGovernance {
        bannedList[party] = true;
    }

    function unban(address party) external onlyGovernance {
        bannedList[party] = false;
    }

    function verify(address party) external onlyGovernance {
        verifiedList[party] = true;
    }

    function unverify(address party) external onlyGovernance {
        verifiedList[party] = false;
    }

    function registerSaplingPool(address pool) external onlySaplingFactory whenNotPaused {
        saplingLendingPools[pool] = true;
    }
    
    function isBadActor(address party) external view returns (bool) {
        return bannedList[party];
    }

    function isVerified(address party) external view returns (bool) {
        return !bannedList[party] && verifiedList[party];
    }

    function isSaplingPool(address party) external view returns (bool) {
        return saplingLendingPools[party];
    }
}
