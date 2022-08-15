// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import "./SaplingContext.sol";
import "./IVerificationHub.sol";

contract VerificationHub is IVerificationHub, SaplingContext {

    mapping (address => bool) private bannedList;
    mapping (address => bool) private verifiedList;


    constructor(address _governance, address _protocol) SaplingContext(_governance, _protocol) {
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
    
    function isBadActor(address party) external view returns (bool) {
        return bannedList[party];
    }

    function isVerified(address party) external view returns (bool) {
        return !bannedList[party] && verifiedList[party];
    }
}
