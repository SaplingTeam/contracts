# bankfair-contracts

## Lender actions

```solidity
function deposit(uint256 amount) external onlyLender;

function withdraw(uint256 amount) external onlyLender;

function balanceOf(address wallet) public view returns (uint256)

function amountDepositable() external view returns (uint256);

function amountWithdrawable() external view returns (uint256);
```

## Borrower actions

```solidity
function requestLoan(uint256 requestedAmount, uint64 loanDuration) external onlyBorrower returns (uint256);

function borrow(uint256 loanId) external loanInStatus(loanId, LoanStatus.APPROVED);

function repay(uint256 loanId, uint256 amount) external loanInStatus(loanId, LoanStatus.FUNDS_WITHDRAWN) returns (uint256, uint256);

function loanBalanceDue(uint256 loanId) external view loanInStatus(loanId, LoanStatus.FUNDS_WITHDRAWN);
```

## Manager Staking Actions

```solidity
function stake(uint256 amount) external onlyManager;

function unstake(uint256 amount) external onlyManager;

function balanceStaked() public view returns (uint256);

function amountUnstakeable();
```

## Manager Lending Actions
```solidity
function approveLoan(uint256 _loanId) external onlyManager loanInStatus(_loanId, LoanStatus.APPLIED);

function denyLoan(uint256 loanId) external onlyManager loanInStatus(loanId, LoanStatus.APPLIED);

function cancelLoan(uint256 loanId) external onlyManager loanInStatus(loanId, LoanStatus.APPROVED);

function defaultLoan(uint256 loanId) external onlyManager loanInStatus(loanId, LoanStatus.FUNDS_WITHDRAWN);
```

## Manager and Protocol Actions

```solidity
function withdrawProtocolEarnings() external;

function protocolEarningsOf(address wallet) external;
```
## Important Public Variables

#### Borrowing and Lending
```solidity
uint16 public defaultAPR;
uint16 public defaultLateAPRDelta;
uint256 public minAmount;
uint256 public minDuration;
uint256 public maxDuration;

mapping(address => uint256) public recentLoanIdOf;
mapping(uint256 => Loan) public loans;
mapping(uint256 => LoanDetail) public loanDetails;

uint256 public poolLiqudity;
```