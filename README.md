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

#### Pool
```solidity
address public manager;
address public protocolWallet;
address public token;

uint16 public constant PERCENT_DECIMALS;

//target stake percentage level
uint16 public targetStakePercent; 

//minimum stake percentage level to allow loan approvals
uint16 public loanApprovalStakePercent; 

uint16 public protocolEarningPercent;
uint16 public managerLeveragedEarningPercent;
```

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

## Events

```solidity
event LoanRequested(uint256 loanId, address borrower);
event LoanApproved(uint256 loanId);
event LoanDenied(uint256 loanId);
event LoanCancelled(uint256 loanId);
event LoanRepaid(uint256 loanId);
event LoanDefaulted(uint256 loanId, uint256 amountLost);
event UnstakedLoss(uint256 amount);
event StakedAssetsDepleted();
```

## Data Structure Definitions

```solidity
enum LoanStatus {
  APPLIED,
  DENIED,
  APPROVED,
  CANCELLED,
  FUNDS_WITHDRAWN,
  REPAID,
  DEFAULTED
}

struct Loan {
  uint256 id;
  address borrower;
  uint256 amount;
  uint256 duration; 
  uint16 apr; 
  uint16 lateAPRDelta; 
  uint256 requestedTime;
  LoanStatus status;
}

struct LoanDetail {
  uint256 loanId;
  uint256 totalAmountRepaid;
  uint256 baseAmountRepaid;
  uint256 interestPaid;
  uint256 approvedTime;
  uint256 lastPaymentTime;
}
```