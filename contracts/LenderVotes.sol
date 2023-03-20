// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/governance/Governor.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";


/**
 * @dev Governor contract generated using OpenZeppelin contracts wizard
 */
contract LenderVotes is Governor, GovernorCountingSimple, GovernorVotes, GovernorVotesQuorumFraction {
    constructor(IVotes _token)
    Governor("LenderVotes")
    GovernorVotes(_token)
    GovernorVotesQuorumFraction(501) // 50.1%
    {}

    function votingDelay() public pure override returns (uint256) {
        return 1; // 1 block
    }

    function votingPeriod() public pure override returns (uint256) {
        return 43200; // 1 day using 2s block time
    }

    function proposalThreshold() public pure override returns (uint256) {
        return 1e6; // 1 pool token when using 6 decimal stablecoins / USDC
    }

    function quorumDenominator() public pure override returns (uint256) {
        return 1000;
    }

    function quorum(uint256 blockNumber)
        public
        view
        override(IGovernor, GovernorVotesQuorumFraction)
        returns (uint256)
    {
        return super.quorum(blockNumber);
    }
}
