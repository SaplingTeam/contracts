// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;


interface IVerificationHub {

    function ban(address party) external;

    function unban(address party) external;

    function verify(address party) external;

    function unverify(address party) external;

    function isBadActor(address party) external view returns (bool);

    function isVerified(address party) external view returns (bool);

}   