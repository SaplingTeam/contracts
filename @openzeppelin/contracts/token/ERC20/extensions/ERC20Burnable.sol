# Solidity API

## ERC20Burnable

_Extension of {ERC20} that allows token holders to destroy both their own
tokens and those that they have an allowance for, in a way that can be
recognized off-chain (via event analysis)._

### burn

```solidity
function burn(uint256 amount) public virtual
```

_Destroys &#x60;amount&#x60; tokens from the caller.

See {ERC20-_burn}._

### burnFrom

```solidity
function burnFrom(address account, uint256 amount) public virtual
```

_Destroys &#x60;amount&#x60; tokens from &#x60;account&#x60;, deducting from the caller&#x27;s
allowance.

See {ERC20-_burn} and {ERC20-allowance}.

Requirements:

- the caller must have allowance for &#x60;&#x60;accounts&#x60;&#x60;&#x27;s tokens of at least
&#x60;amount&#x60;._

