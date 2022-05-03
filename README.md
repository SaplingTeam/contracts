# bankfair-contracts

## Lender actions

```solidity
/**
 * @notice Deposit tokens to the pool.
 * @dev Deposit amount must be non zero and not exceed amountDepositable().
 *      An appropriate spend limit must be present at the token contract.
 *      Caller must not be any of: manager, protocol, current borrower.
 * @param amount Token amount to deposit.
 */
function deposit(uint256 amount) external onlyLender;

/**
 * @notice Withdraw tokens from the pool.
 * @dev Withdrawal amount must be non zero and not exceed amountWithdrawable().
 *      Caller must not be any of: manager, protocol, current borrower.
 * @param amount token amount to withdraw.
 */
function withdraw(uint256 amount) external onlyLender;

/**
 * @notice Check wallet's token balance in the pool. Balance includes acquired earnings. 
 * @param wallet Address of the wallet to check the balance of.
 * @return Token balance of the wallet in this pool.
 */
function balanceOf(address wallet) public view returns (uint256)

/**
 * @notice Check token amount depositable by lenders at this time.
 * @dev Return value depends on the pool state rather than caller's balance.
 * @return Max amount of tokens depositable to the pool.
 */
function amountDepositable() external view returns (uint256);

/**
 * @notice Check token amount withdrawable by the caller at this time.
 * @dev Return value depends on the callers balance, and is limited by pool liquidity.
 * @param wallet Address of the wallet to check the withdrawable balance of.
 * @return Max amount of tokens withdrawable by msg.sender.
 */
function amountWithdrawable(address wallet) external view returns (uint256);
```

## Borrower actions

```solidity
/**
 * @notice Request a new loan.
 * @dev Requested amount must be greater or equal to minAmount().
 *      Loan duration must be between minDuration() and maxDuration().
 *      Caller must not be a lender, protocol, or the manager. 
 *      Multiple pending applications from the same address are not allowed,
 *      most recent loan/application of the caller must not have APPLIED status.
 * @param requestedAmount Token amount to be borrowed.
 * @param loanDuration Loan duration in seconds. 
 * @return ID of a new loan application.
 */
function requestLoan(uint256 requestedAmount, uint64 loanDuration) external onlyBorrower returns (uint256);

/**
 * @notice Withdraw funds of an approved loan.
 * @dev Caller must be the borrower. 
 *      The loan must be in APPROVED status.
 * @param loanId id of the loan to withdraw funds of. 
 */
function borrow(uint256 loanId) external loanInStatus(loanId, LoanStatus.APPROVED);

/**
 * @notice Make a payment towards a loan.
 * @dev Caller must be the borrower.
 *      Loan must be in FUNDS_WITHDRAWN status.
 *      Only the necessary sum is charged if amount exceeds amount due.
 *      Amount charged will not exceed the amount parameter. 
 * @param loanId ID of the loan to make a payment towards.
 * @param amount Payment amount in tokens.
 * @return A pair of total amount changed including interest, and the interest charged.
 */
function repay(uint256 loanId, uint256 amount) external loanInStatus(loanId, LoanStatus.FUNDS_WITHDRAWN) returns (uint256, uint256);

/**
 * @notice Loan balance due including interest if paid in full at this time. 
 * @dev Loan must be in FUNDS_WITHDRAWN status.
 * @param loanId ID of the loan to check the balance of.
 * @return Total amount due with interest on this loan.
 */
function loanBalanceDue(uint256 loanId) external view loanInStatus(loanId, LoanStatus.FUNDS_WITHDRAWN);
```

## Manager Staking Actions

```solidity
/**
 * @notice Stake tokens into the pool.
 * @dev Caller must be the manager.
 *      Stake amount must be non zero.
 *      An appropriate spend limit must be present at the token contract.
 * @param amount Token amount to stake.
 */
function stake(uint256 amount) external onlyManager;

/**
 * @notice Unstake tokens from the pool.
 * @dev Caller must be the manager.
 *      Unstake amount must be non zero and not exceed amountUnstakable().
 * @param amount Token amount to unstake.
 */
function unstake(uint256 amount) external onlyManager;

/**
 * @notice Check the manager's staked token balance in the pool.
 * @return Token balance of the manager's stake.
 */
function balanceStaked() public view returns (uint256);

/**
 * @notice Check token amount unstakable by the manager at this time.
 * @dev Return value depends on the manager's stake balance, and is limited by pool liquidity.
 * @return Max amount of tokens unstakable by the manager.
 */
function amountUnstakable();
```

## Manager Lending Actions
```solidity
/**
 * @notice Check if the pool can lend based on the current stake levels.
 * @return True if the staked funds provide at least a minimum ratio to the pool funds, False otherwise.
 */
function poolCanLend() public view returns (bool)

/**
 * @notice Approve a loan.
 * @dev Loan must be in APPLIED status.
 *      Caller must be the manager.
 *      Loan amount must not exceed poolLiquidity();
 *      Stake to pool funds ratio must be good - poolCanLend() must be true.
 */
function approveLoan(uint256 _loanId) external onlyManager loanInStatus(_loanId, LoanStatus.APPLIED);

/**
 * @notice Deny a loan.
 * @dev Loan must be in APPLIED status.
 *      Caller must be the manager.
 */
function denyLoan(uint256 loanId) external onlyManager loanInStatus(loanId, LoanStatus.APPLIED);

/**
 * @notice Cancel a loan.
 * @dev Loan must be in APPROVED status.
 *      Caller must be the manager.
 */
function cancelLoan(uint256 loanId) external onlyManager loanInStatus(loanId, LoanStatus.APPROVED);

/**
 * @notice Default a loan.
 * @dev Loan must be in FUNDS_WITHDRAWN status.
 *      Caller must be the manager.
 */
function defaultLoan(uint256 loanId) external onlyManager loanInStatus(loanId, LoanStatus.FUNDS_WITHDRAWN);
```

## Manager and Protocol Actions

```solidity
/**
 * @notice Withdraws protocol earnings belonging to the caller.
 * @dev protocolEarningsOf(msg.sender) must be greater than 0.
 *      Caller's all accumulated earnings will be withdrawn.
 */
function withdrawProtocolEarnings() external;

/**
 * @notice Check the special addresses' earnings from the protocol. 
 * @dev This method is useful for manager and protocol addresses. 
 *      Calling this method for a non-protocol associated addresses will return 0.
 * @param wallet Address of the wallet to check the earnings balance of.
 * @return Accumulated earnings of the wallet from the protocol.
 */
function protocolEarningsOf(address wallet) external;
```
## Important Public Variables

#### Pool
```solidity
/// Pool manager address
address public manager;

/// Protocol wallet address
address public protocolWallet;

/// Address of an ERC20 token used by the pool
address public token;

/// Number of decimal digits in integer percent values used across the contract
uint16 public constant PERCENT_DECIMALS;

/// Percentage of paid interest to be allocated as protocol earnings
uint16 public protocolEarningPercent;

/// Manager's leveraged earn factor represented as a percentage
uint16 public managerLeveragedEarningPercent;
```

#### Borrowing and Lending
```solidity
/// Loan APR to be applied for the new loan requests
uint16 public defaultAPR;

/// Loan late payment APR delta to be applied fot the new loan requests
uint16 public defaultLateAPRDelta;

/// Minimum allowed loan amount 
uint256 public minAmount;

/// Minimum loan duration in seconds
uint256 public minDuration;

/// Maximum loan duration in seconds
uint256 public maxDuration;

/// Recent loanId of an address. Value of 0 means that the address doe not have any loan requests
mapping(address => uint256) public recentLoanIdOf;

/// Loan applications by loanId
mapping(uint256 => Loan) public loans;

/// Loan payment details by loanId. Loan detail is available only after a loan has been approved.
mapping(uint256 => LoanDetail) public loanDetails;

/// Current amount of liquid tokens, available to lend/withdraw/borrow
uint256 public poolLiquidity;
```

## Events

```solidity
event LoanRequested(uint256 loanId, address indexed borrower);
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
