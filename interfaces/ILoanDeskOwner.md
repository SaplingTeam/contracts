# Solidity API

## ILoanDeskOwner

### setLoanDesk

```solidity
function setLoanDesk(address _loanDesk) external
```

### canOffer

```solidity
function canOffer(uint256 totalLoansAmount) external view returns (bool)
```

### onOffer

```solidity
function onOffer(uint256 amount) external
```

### onOfferUpdate

```solidity
function onOfferUpdate(uint256 prevAmount, uint256 amount) external
```

