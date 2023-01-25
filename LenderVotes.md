# Solidity API

## LenderVotes

_Governor contract generated using OpenZeppelin contracts wizard_

### constructor

```solidity
constructor(contract IVotes _token) public
```

### votingDelay

```solidity
function votingDelay() public pure returns (uint256)
```

module:user-config

_Delay, in number of block, between the proposal is created and the vote starts. This can be increassed to
leave time for users to buy voting power, or delegate it, before the voting of a proposal starts._

### votingPeriod

```solidity
function votingPeriod() public pure returns (uint256)
```

module:user-config

_Delay, in number of blocks, between the vote start and vote ends.

NOTE: The {votingDelay} can delay the start of the vote. This must be considered when setting the voting
duration compared to the voting delay._

### proposalThreshold

```solidity
function proposalThreshold() public pure returns (uint256)
```

_Part of the Governor Bravo's interface: _"The number of votes required in order for a voter to become a proposer"_._

### quorumDenominator

```solidity
function quorumDenominator() public pure returns (uint256)
```

_Returns the quorum denominator. Defaults to 100, but may be overridden._

### quorum

```solidity
function quorum(uint256 blockNumber) public view returns (uint256)
```

