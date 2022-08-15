// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import "./context/SaplingContext.sol";
import "./interfaces/IVerificationHub.sol";

contract VerificationHub is IVerificationHub, SaplingContext {

    address private poolFactory;

    mapping (address => bool) private saplingLendingPools;
    mapping (address => bool) private bannedList;
    mapping (address => bool) private verifiedList;

    event PoolFactorySet(address from, address to);

    modifier onlyPoolFactory {
        // direct use of msg.sender is intentional
        require(msg.sender == poolFactory, "Sapling: Caller is not the manager");
        _;
    }

    constructor(address _governance, address _protocol) SaplingContext(_governance, _protocol) {
        poolFactory = _governance;
    }

    function setPoolFactory(address _poolFactory) external onlyGovernance {
        require(_poolFactory != address(0) && _poolFactory != poolFactory, "VerificationHub: new address is invalid");
        address prevAddress = poolFactory;
        poolFactory = _poolFactory;
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

    function registerSaplingPool(address pool) external whenNotPaused onlyPoolFactory {
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
