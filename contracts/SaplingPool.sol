// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.15;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./SaplingManagerContext.sol";
import "./SaplingMathContext.sol";
import "./IPoolToken.sol";
import "./ILoanDeskHook.sol";
import "./ILenderHook.sol";

/**
 * @title Sapling Lending Pool
 */
contract SaplingPool is ILenderHook, SaplingManagerContext, SaplingMathContext {

    using SafeMath for uint256;

    enum LoanStatus {
        NULL,
        OUTSTANDING,
        REPAID,
        DEFAULTED
    }

    /// Loan object
    struct Loan {
        uint256 id;
        address loanDeskAddress;
        uint256 applicationId;
        address borrower;
        uint256 amount;
        uint256 duration; 
        uint256 gracePeriod;
        uint16 installments;
        uint16 apr;
        uint16 lateAPRDelta;
        uint256 borrowedTime;
        LoanStatus status;
    }

    struct LoanDetail {
        uint256 loanId;
        uint256 totalAmountRepaid; //total amount paid including interest
        uint256 baseAmountRepaid;
        uint256 interestPaid;
        uint256 lastPaymentTime;
    }

    /// Individual borrower statistics
    struct BorrowerStats {

        /// Wallet address of the borrower
        address borrower; 

        /// All time loan borrow count
        uint256 countBorrowed;

        /// All time loan closure count
        uint256 countRepaid;

        /// All time loan default count
        uint256 countDefaulted;

        /// Current outstanding loan count
        uint256 countOutstanding;

        /// Outstanding loan borrowed amount
        uint256 amountBorrowed;

        /// Outstanding loan repaid base amount
        uint256 amountBaseRepaid;

        /// Outstanding loan paid interest amount
        uint256 amountInterestPaid;

        /// most recent loanId
        uint256 recentLoanId;
    }

    address public loanDesk;

    //FROM managed lending pool /// Address of an ERC20 token issued by the pool
    address public immutable poolToken;

    /// Address of an ERC20 liquidity token accepted by the pool
    address public immutable liquidityToken;

    /// tokenDecimals value retrieved from the token contract upon contract construction
    uint8 public immutable tokenDecimals;

    /// A value representing 1.0 token amount, padded with zeros for decimals
    uint256 public immutable ONE_TOKEN;

    /// Total tokens currently held by this contract
    uint256 public tokenBalance;

    /// MAX amount of tokens allowed in the pool based on staked assets
    uint256 public poolFundsLimit;

    /// Current amount of tokens in the pool, including both liquid and borrowed funds
    uint256 public poolFunds; //poolLiquidity + borrowedFunds

    /// Current amount of liquid tokens, available to lend/withdraw/borrow
    uint256 public poolLiquidity;

    /// Total funds borrowed at this time, including both withdrawn and allocated for withdrawal.
    uint256 public borrowedFunds;

    /// Total pool shares present
    uint256 public totalPoolShares;

    /// Manager's staked shares
    uint256 public stakedShares;

    /// Target percentage ratio of staked shares to total shares
    uint16 public targetStakePercent;

    /// Target percentage of pool funds to keep liquid. 
    uint16 public targetLiquidityPercent;

    /// Locked shares of wallets (i.e. staked shares) 
    mapping(address => uint256) internal lockedShares;

    /// Protocol earnings of wallets
    mapping(address => uint256) internal protocolEarnings; 

    /// Percentage of paid interest to be allocated as protocol earnings
    uint16 public protocolEarningPercent;

    /// Percentage of paid interest to be allocated as protocol earnings
    uint16 public immutable MAX_PROTOCOL_EARNING_PERCENT;

    /// Manager's leveraged earn factor represented as a percentage
    uint16 public managerEarnFactor;
    
    /// Governance set upper bound for the manager's leveraged earn factor
    uint16 public managerEarnFactorMax;

    /// Part of the managers leverage factor, earnings of witch will be allocated for the manager as protocol earnings.
    /// This value is always equal to (managerEarnFactor - ONE_HUNDRED_PERCENT)
    uint256 internal managerExcessLeverageComponent;

    /// exit fee percentage
    uint256 public exitFeePercent = 5; // 0.5%

    /// Total borrowed funds allocated for withdrawal but not yet withdrawn by the borrowers
    uint256 public loanFundsPendingWithdrawal;

    /// Weighted average loan APR on the borrowed funds
    uint256 internal weightedAvgLoanAPR;

    /// Loan id generator counter
    uint256 private nextLoanId;

    /// Loans by loanId
    mapping(uint256 => Loan) public loans;

    mapping(uint256 => LoanDetail) public loanDetails;

    /// Borrower statistics by address 
    mapping(address => BorrowerStats) public borrowerStats;

    event LoanDeskSet(address from, address to);
    event ProtocolWalletTransferred(address from, address to);
    event LoanBorrowed(uint256 loanId, address indexed borrower, uint256 applicationId);
    event LoanRepaid(uint256 loanId, address indexed borrower);
    event LoanDefaulted(uint256 loanId, address indexed borrower, uint256 amountLost);
    event UnstakedLoss(uint256 amount);
    event StakedAssetsDepleted();

    modifier loanInStatus(uint256 loanId, LoanStatus status) {
        Loan storage loan = loans[loanId];
        require(loan.id != 0, "Loan is not found.");
        require(loan.status == status, "Loan does not have a valid status for this operation.");
        _;
    }
    
    /**
     * @notice Creates a Sapling pool.
     * @param _poolToken ERC20 token contract address to be used as the pool issued token.
     * @param _liquidityToken ERC20 token contract address to be used as main pool liquid currency.
     * @param _governance Address of the protocol governance.
     * @param _protocol Address of a wallet to accumulate protocol earnings.
     * @param _manager Address of the pool manager.
     */
    constructor(address _poolToken, address _liquidityToken, address _governance, address _protocol, address _manager) 
        SaplingManagerContext(_manager, _governance, _protocol) {

        require(_poolToken != address(0), "SaplingPool: pool token address is not set");
        require(_liquidityToken != address(0), "SaplingPool: liquidity token address is not set");
        require(_protocol != address(0), "SaplingPool: protocol wallet address is not set");
        
        protocol = _protocol;

        poolToken = _poolToken;
        liquidityToken = _liquidityToken;
        tokenBalance = 0; 
        totalPoolShares = 0;
        stakedShares = 0;

        poolFundsLimit = 0;
        poolFunds = 0;

        targetStakePercent = uint16(10 * 10 ** PERCENT_DECIMALS); //10%
        targetLiquidityPercent = 0; //0%

        protocolEarningPercent = uint16(10 * 10 ** PERCENT_DECIMALS); // 10% by default; safe min 0%, max 10%
        MAX_PROTOCOL_EARNING_PERCENT = protocolEarningPercent;

        managerEarnFactorMax = uint16(500 * 10 ** PERCENT_DECIMALS); // 150% or 1.5x leverage by default (safe min 100% or 1x)
        managerEarnFactor = uint16(150 * 10 ** PERCENT_DECIMALS);

        managerExcessLeverageComponent = uint256(managerEarnFactor).sub(ONE_HUNDRED_PERCENT);

        uint8 decimals = IERC20Metadata(liquidityToken).decimals();
        tokenDecimals = decimals;
        ONE_TOKEN = 10 ** decimals;

        assert(IERC20(poolToken).totalSupply() == 0);
        
        weightedAvgLoanAPR = 0; //templateLoanAPR;

        nextLoanId = 1;

        poolLiquidity = 0;
        borrowedFunds = 0;
        loanFundsPendingWithdrawal = 0;
    }

    /**
     * @notice Deposit tokens to the pool.
     * @dev Deposit amount must be non zero and not exceed amountDepositable().
     *      An appropriate spend limit must be present at the token contract.
     *      Caller must not be any of: manager, protocol, current borrower.
     * @param amount Token amount to deposit.
     */
    function deposit(uint256 amount) external onlyUser whenNotClosed whenNotPaused {
        enterPool(amount);
    }

    /**
     * @notice Withdraw tokens from the pool.
     * @dev Withdrawal amount must be non zero and not exceed amountWithdrawable().
     *      Caller must not be any of: manager, protocol, current borrower.
     * @param amount token amount to withdraw.
     */
    function withdraw(uint256 amount) external whenNotPaused {
        require(msg.sender != manager);
        exitPool(amount);
    }

    /**
     * @notice Stake tokens into the pool.
     * @dev Caller must be the manager.
     *      Stake amount must be non zero.
     *      An appropriate spend limit must be present at the token contract.
     * @param amount Token amount to stake.
     */
     //FIXME whenLendingNotPaused
    function stake(uint256 amount) external onlyManager whenNotClosed whenNotPaused {
        require(amount > 0, "SaplingPool: stake amount is 0");

        uint256 shares = enterPool(amount);
        stakedShares = stakedShares.add(shares);
        updatePoolLimit();
    }

    /**
     * @notice Unstake tokens from the pool.
     * @dev Caller must be the manager.
     *      Unstake amount must be non zero and not exceed amountUnstakable().
     * @param amount Token amount to unstake.
     */
     //FIXME whenLendingNotPaused
    function unstake(uint256 amount) external onlyManager whenNotPaused {
        require(amount > 0, "SaplingPool: unstake amount is 0");
        require(amount <= amountUnstakable(), "SaplingPool: requested amount is not available to be unstaked");

        uint256 shares = tokensToShares(amount);
        stakedShares = stakedShares.sub(shares);
        updatePoolLimit();
        exitPool(amount);
    }

        /**
     * @notice Withdraws protocol earnings belonging to the caller.
     * @dev protocolEarningsOf(msg.sender) must be greater than 0.
     *      Caller's all accumulated earnings will be withdrawn.
     */
    function withdrawProtocolEarnings() external whenNotPaused {
        require(protocolEarnings[msg.sender] > 0, "SaplingPool: protocol earnings is zero on this account");
        uint256 amount = protocolEarnings[msg.sender];
        protocolEarnings[msg.sender] = 0; 

        // give tokens
        tokenBalance = tokenBalance.sub(amount);
        bool success = IERC20(liquidityToken).transfer(msg.sender, amount);
        require(success);
    }

    /**
     * @notice Accept loan offer and withdraw funds
     * @dev Caller must be the borrower. 
     *      The loan must be in APPROVED status.
     * @param appId id of the loan application to accept the offer of. 
     */
    function borrow(uint256 appId) external whenNotClosed whenNotPaused {

        require(ILoanDeskHook(loanDesk).applicationStatus(appId) == ILoanDeskHook.LoanApplicationStatus.OFFER_MADE);

        ILoanDeskHook.LoanOffer memory offer = ILoanDeskHook(loanDesk).loanOfferById(appId);

        require(offer.borrower == msg.sender, "SaplingPool: Withdrawal requester is not the borrower on this loan.");
        ILoanDeskHook(loanDesk).onBorrow(appId);

        // borrowerStats[offer.borrower].countCurrentApproved--;
        borrowerStats[offer.borrower].countOutstanding++;
        borrowerStats[offer.borrower].amountBorrowed = borrowerStats[offer.borrower].amountBorrowed.add(offer.amount);

        uint256 loanId = nextLoanId;
        nextLoanId++;

        loans[loanId] = Loan({
            id: loanId,
            loanDeskAddress: loanDesk,
            applicationId: appId,
            borrower: offer.borrower,
            amount: offer.amount,
            duration: offer.duration,
            gracePeriod: offer.gracePeriod,
            installments: offer.installments,
            apr: offer.apr,
            lateAPRDelta: offer.lateAPRDelta,
            borrowedTime: block.timestamp,
            status: LoanStatus.OUTSTANDING
        });

        loanDetails[loanId] = LoanDetail({
            loanId: loanId,
            totalAmountRepaid: 0,
            baseAmountRepaid: 0,
            interestPaid: 0,
            lastPaymentTime: 0
        });

        borrowerStats[offer.borrower].recentLoanId = loanId;

        poolLiquidity = poolLiquidity.sub(offer.amount);
        uint256 prevBorrowedFunds = borrowedFunds;
        borrowedFunds = borrowedFunds.add(offer.amount);

        weightedAvgLoanAPR = prevBorrowedFunds.mul(weightedAvgLoanAPR).add(offer.amount.mul(offer.apr)).div(borrowedFunds);

        tokenBalance = tokenBalance.sub(offer.amount);
        bool success = IERC20(liquidityToken).transfer(msg.sender, offer.amount);
        require(success);

        emit LoanBorrowed(loanId, offer.borrower, appId);
    }

    /**
     * @notice Make a payment towards a loan.
     * @dev Caller must be the borrower.
     *      Loan must be in OUTSTANDING status.
     *      Only the necessary sum is charged if amount exceeds amount due.
     *      Amount charged will not exceed the amount parameter. 
     * @param loanId ID of the loan to make a payment towards.
     * @param amount Payment amount in tokens.
     * @return A pair of total amount changed including interest, and the interest charged.
     */
    function repay(uint256 loanId, uint256 amount) external loanInStatus(loanId, LoanStatus.OUTSTANDING) returns (uint256, uint256) {

        // require the payer and the borrower to be the same to avoid mispayment
        require(loans[loanId].borrower == msg.sender, "Payer is not the borrower.");

        return repayBase(loanId, amount);
    }

    /**
     * @notice Make a payment towards a loan on behalf od a borrower
     * @dev Loan must be in OUTSTANDING status.
     *      Only the necessary sum is charged if amount exceeds amount due.
     *      Amount charged will not exceed the amount parameter. 
     * @param loanId ID of the loan to make a payment towards.
     * @param amount Payment amount in tokens.
     * @param borrower address of the borrower to make a payment in behalf of.
     * @return A pair of total amount changed including interest, and the interest charged.
     */
    function repayOnBehalf(uint256 loanId, uint256 amount, address borrower) external loanInStatus(loanId, LoanStatus.OUTSTANDING) returns (uint256, uint256) {

        // require the payer and the borrower to be the same to avoid mispayment
        require(loans[loanId].borrower == borrower, "The specified loan does not belong to the borrower.");

        return repayBase(loanId, amount);
    }

    /**
     * @notice Default a loan.
     * @dev Loan must be in OUTSTANDING status.
     *      Caller must be the manager.
     *      canDefault(loanId) must return 'true'.
     * @param loanId ID of the loan to default
     */
    function defaultLoan(uint256 loanId) external managerOrApprovedOnInactive loanInStatus(loanId, LoanStatus.OUTSTANDING) whenNotPaused {
        Loan storage loan = loans[loanId];
        LoanDetail storage loanDetail = loanDetails[loanId];

        // check if the call was made by an eligible non manager party, due to manager's inaction on the loan.
        if (msg.sender != manager) {
            // require inactivity grace period
            require(block.timestamp > loan.borrowedTime + loan.duration + loan.gracePeriod + MANAGER_INACTIVITY_GRACE_PERIOD, 
                "It is too early to default this loan as a non-manager.");
        }
        
        require(block.timestamp > (loan.borrowedTime + loan.duration + loan.gracePeriod), "Lender: It is too early to default this loan.");

        loan.status = LoanStatus.DEFAULTED;
        borrowerStats[loan.borrower].countDefaulted++;
        borrowerStats[loan.borrower].countOutstanding--;

        (, uint256 loss) = loan.amount.trySub(loanDetail.totalAmountRepaid);
        
        emit LoanDefaulted(loanId, loan.borrower, loss);

        borrowerStats[loan.borrower].amountBorrowed = borrowerStats[loan.borrower].amountBorrowed.sub(loan.amount);
        borrowerStats[loan.borrower].amountBaseRepaid = borrowerStats[loan.borrower].amountBaseRepaid.sub(loanDetail.baseAmountRepaid);
        borrowerStats[loan.borrower].amountInterestPaid = borrowerStats[loan.borrower].amountInterestPaid.sub(loanDetail.interestPaid);

        if (loss > 0) {
            uint256 lostShares = tokensToShares(loss);
            uint256 remainingLostShares = lostShares;

            poolFunds = poolFunds.sub(loss);
            
            if (stakedShares > 0) {
                uint256 stakedShareLoss = Math.min(lostShares, stakedShares);
                remainingLostShares = lostShares.sub(stakedShareLoss);
                stakedShares = stakedShares.sub(stakedShareLoss);
                updatePoolLimit();

                //burn manager's shares
                IPoolToken(poolToken).burn(address(this), stakedShareLoss);
                lockedShares[manager] = lockedShares[manager].sub(stakedShareLoss);
                totalPoolShares = totalPoolShares.sub(stakedShareLoss);

                if (stakedShares == 0) {
                    emit StakedAssetsDepleted();
                }
            }

            if (remainingLostShares > 0) {
                emit UnstakedLoss(loss.sub(sharesToTokens(remainingLostShares)));
            }
        }

        if (loanDetail.baseAmountRepaid < loan.amount) {
            uint256 prevBorrowedFunds = borrowedFunds;
            uint256 baseAmountLost = loan.amount.sub(loanDetail.baseAmountRepaid);
            borrowedFunds = borrowedFunds.sub(baseAmountLost);

            if (borrowedFunds > 0) {
                weightedAvgLoanAPR = prevBorrowedFunds.mul(weightedAvgLoanAPR).sub(baseAmountLost.mul(loan.apr)).div(borrowedFunds);
            } else {
                weightedAvgLoanAPR = 0;//templateLoanAPR;
            }
        }
    }

    function setLoanDesk(address _loanDesk) external onlyGovernance {
        address prevLoanDesk = loanDesk;
        loanDesk = _loanDesk;
        emit LoanDeskSet(prevLoanDesk, loanDesk);
    }

    /**
     * @notice Transfer the protocol wallet and accumulated fees to a new wallet.
     * @dev Caller must be governance. 
     *      _protocol must not be 0.
     * @param _protocol Address of the new protocol wallet.
     */
    function transferProtocolWallet(address _protocol) external onlyGovernance {
        require(_protocol != address(0) && _protocol != protocol, "Governed: New protocol address is invalid.");
        protocolEarnings[_protocol] = protocolEarnings[_protocol].add(protocolEarnings[protocol]);
        protocolEarnings[protocol] = 0;

        emit ProtocolWalletTransferred(protocol, _protocol);
        protocol = _protocol;
    }

    /**
     * @notice Set the target stake percent for the pool.
     * @dev _targetStakePercent must be inclusively between 0 and ONE_HUNDRED_PERCENT.
     *      Caller must be the governance.
     * @param _targetStakePercent new target stake percent.
     */
    function setTargetStakePercent(uint16 _targetStakePercent) external onlyGovernance {
        require(0 <= _targetStakePercent && _targetStakePercent <= ONE_HUNDRED_PERCENT, "Target stake percent is out of bounds");
        targetStakePercent = _targetStakePercent;
    }

    /**
     * @notice Set the target liquidity percent for the pool.
     * @dev _targetLiquidityPercent must be inclusively between 0 and ONE_HUNDRED_PERCENT.
     *      Caller must be the manager.
     * @param _targetLiquidityPercent new target liquidity percent.
     */
    function setTargetLiquidityPercent(uint16 _targetLiquidityPercent) external onlyManager {
        require(0 <= _targetLiquidityPercent && _targetLiquidityPercent <= ONE_HUNDRED_PERCENT, "Target liquidity percent is out of bounds");
        targetLiquidityPercent = _targetLiquidityPercent;
    }

    /**
     * @notice Set the protocol earning percent for the pool.
     * @dev _protocolEarningPercent must be inclusively between 0 and MAX_PROTOCOL_EARNING_PERCENT.
     *      Caller must be the governance.
     * @param _protocolEarningPercent new protocol earning percent.
     */
    function setProtocolEarningPercent(uint16 _protocolEarningPercent) external onlyGovernance {
        require(0 <= _protocolEarningPercent && _protocolEarningPercent <= MAX_PROTOCOL_EARNING_PERCENT, "Protocol earning percent is out of bounds");
        protocolEarningPercent = _protocolEarningPercent;
    }

    /**
     * @notice Set an upper bound for the manager's earn factor percent.
     * @dev _managerEarnFactorMax must be greater than or equal to ONE_HUNDRED_PERCENT.
     *      Caller must be the governance.
     *      If the current earn factor is greater than the new maximum, then the current earn factor is set to the new maximum. 
     * @param _managerEarnFactorMax new maximum for manager's earn factor.
     */
    function setManagerEarnFactorMax(uint16 _managerEarnFactorMax) external onlyGovernance {
        require(ONE_HUNDRED_PERCENT <= _managerEarnFactorMax , "Manager's earn factor is out of bounds.");
        managerEarnFactorMax = _managerEarnFactorMax;

        if (managerEarnFactor > managerEarnFactorMax) {
            managerEarnFactor = managerEarnFactorMax;
            managerExcessLeverageComponent = uint256(managerEarnFactor).sub(ONE_HUNDRED_PERCENT);
        }
    }

    /**
     * @notice Set the manager's earn factor percent.
     * @dev _managerEarnFactorMax must be inclusively between ONE_HUNDRED_PERCENT and managerEarnFactorMax.
     *      Caller must be the manager.
     * @param _managerEarnFactor new manager's earn factor.
     */
    function setManagerEarnFactor(uint16 _managerEarnFactor) external onlyManager whenNotPaused {
        require(ONE_HUNDRED_PERCENT <= _managerEarnFactor && _managerEarnFactor <= managerEarnFactorMax, "Manager's earn factor is out of bounds.");
        managerEarnFactor = _managerEarnFactor;
        managerExcessLeverageComponent = uint256(managerEarnFactor).sub(ONE_HUNDRED_PERCENT);
    }

    /**
     * @notice Check token amount depositable by lenders at this time.
     * @dev Return value depends on the pool state rather than caller's balance.
     * @return Max amount of tokens depositable to the pool.
     */
    function amountDepositable() external view returns (uint256) {
        if (poolFundsLimit <= poolFunds || closed() || paused()) {
            return 0;
        }

        return poolFundsLimit.sub(poolFunds);
    }

    /**
     * @notice Check token amount withdrawable by the caller at this time.
     * @dev Return value depends on the callers balance, and is limited by pool liquidity.
     * @param wallet Address of the wallet to check the withdrawable balance of.
     * @return Max amount of tokens withdrawable by msg.sender.
     */
    function amountWithdrawable(address wallet) external view returns (uint256) {
        return paused() ? 0 : Math.min(poolLiquidity, unlockedBalanceOf(wallet));
    }

    /**
     * @notice Estimated lender APY given the current pool state.
     * @return Estimated lender APY
     */
    function currentLenderAPY() external view returns (uint16) {
        return lenderAPY(borrowedFunds);
    }

    /**
     * @notice Projected lender APY given the current pool state and a specific borrow rate.
     * @dev represent borrowRate in contract specific percentage format
     * @param borrowRate percentage of pool funds projected to be borrowed annually
     * @return Projected lender APY
     */
    function projectedLenderAPY(uint16 borrowRate) external view returns (uint16) {
        require(borrowRate <= ONE_HUNDRED_PERCENT, "SaplingPool: Invalid borrow rate. Borrow rate must be less than or equal to 100%");
        return lenderAPY(Math.mulDiv(poolFunds, borrowRate, ONE_HUNDRED_PERCENT));
    }

    /**
     * @notice View indicating whether or not a given loan can be offered by the manager.
     * @param totalLoansAmount loanOfferAmount
     * @return True if the given total loan amount can be offered, false otherwise
     */
    function canOffer(uint256 totalLoansAmount) external view override returns (bool) {
        return poolCanLend() && poolLiquidity >= totalLoansAmount + Math.mulDiv(poolFunds, targetLiquidityPercent, ONE_HUNDRED_PERCENT);
    }

    /**
     * @notice View indicating whether or not a given loan qualifies to be defaulted by a given caller.
     * @param loanId loanId ID of the loan to check
     * @param caller address that intends to call default() on the loan
     * @return True if the given loan can be defaulted, false otherwise
     */
    function canDefault(uint256 loanId, address caller) external view returns (bool) {
        if (caller != manager && !authorizedOnInactiveManager(caller)) {
            return false;
        }

        Loan storage loan = loans[loanId];

        return loan.status == LoanStatus.OUTSTANDING 
            && block.timestamp > (loan.borrowedTime + loan.duration + loan.gracePeriod + (caller == manager ? 0 : MANAGER_INACTIVITY_GRACE_PERIOD));
    }

    /**
     * @notice Loan balance due including interest if paid in full at this time. 
     * @dev Loan must be in OUTSTANDING status.
     * @param loanId ID of the loan to check the balance of.
     * @return Total amount due with interest on this loan.
     */
    function loanBalanceDue(uint256 loanId) external view returns(uint256) {
        (uint256 amountDue,) = loanBalanceDueWithInterest(loanId);
        return amountDue;
    }

    /**
     * @notice Check wallet's token balance in the pool. Balance includes acquired earnings. 
     * @param wallet Address of the wallet to check the balance of.
     * @return Token balance of the wallet in this pool.
     */
    function balanceOf(address wallet) public view returns (uint256) {
        if (wallet != manager) {
            return sharesToTokens(IPoolToken(poolToken).balanceOf(wallet) + lockedShares[wallet]);
        } else {
            return sharesToTokens(lockedShares[manager]);
        }
    }

    /**
     * @notice Check wallet's unlocked token balance in the pool. Balance includes acquired earnings. 
     * @param wallet Address of the wallet to check the unlocked balance of.
     * @return Unlocked token balance of the wallet in this pool.
     */
    function unlockedBalanceOf(address wallet) public view returns (uint256) {
        return sharesToTokens(IPoolToken(poolToken).balanceOf(wallet));
    }

    /**
     * @notice Check the manager's staked token balance in the pool.
     * @return Token balance of the manager's stake.
     */
    function balanceStaked() public view returns (uint256) {
        return balanceOf(manager);
    }

    /**
     * @notice Check token amount unstakable by the manager at this time.
     * @dev Return value depends on the manager's stake balance, and is limited by pool liquidity.
     * @return Max amount of tokens unstakable by the manager.
     */
    function amountUnstakable() public view returns (uint256) {
        if (paused()) {
            return 0;
        }

        uint256 lenderShares = totalPoolShares.sub(stakedShares);
        uint256 lockedStakeShares = Math.mulDiv(lenderShares, targetStakePercent, ONE_HUNDRED_PERCENT - targetStakePercent);

        return Math.min(poolLiquidity, sharesToTokens(stakedShares.sub(lockedStakeShares)));
    }

    /**
     * @notice Check if the pool can lend based on the current stake levels.
     * @return True if the staked funds provide at least a minimum ratio to the pool funds, False otherwise.
     */
    function poolCanLend() public view returns (bool) {
        return !(paused() || closed()) && stakedShares >= Math.mulDiv(totalPoolShares, targetStakePercent, ONE_HUNDRED_PERCENT);
    }

    /**
     * @notice Lender APY given the current pool state and a specific borrowed funds amount.
     * @dev represent borrowRate in contract specific percentage format
     * @param _borrowedFunds pool funds to be borrowed annually
     * @return Lender APY
     */
    function lenderAPY(uint256 _borrowedFunds) private view returns (uint16) {
        if (poolFunds == 0 || _borrowedFunds == 0) {
            return 0;
        }
        
        // pool APY
        uint256 poolAPY = Math.mulDiv(weightedAvgLoanAPR, _borrowedFunds, poolFunds);
        
        // protocol APY
        uint256 protocolAPY = Math.mulDiv(poolAPY, protocolEarningPercent, ONE_HUNDRED_PERCENT);
        
        uint256 remainingAPY = poolAPY.sub(protocolAPY);

        // manager withdrawableAPY
        uint256 currentStakePercent = Math.mulDiv(stakedShares, ONE_HUNDRED_PERCENT, totalPoolShares);
        uint256 managerEarningsPercent = Math.mulDiv(currentStakePercent, managerExcessLeverageComponent, ONE_HUNDRED_PERCENT);
        uint256 managerWithdrawableAPY = Math.mulDiv(remainingAPY, managerEarningsPercent, managerEarningsPercent + ONE_HUNDRED_PERCENT);

        return uint16(remainingAPY.sub(managerWithdrawableAPY));
    }

    /**
     * @notice Count of all loan requests in this pool.
     * @return Loans count.
     */
    function loansCount() external view returns(uint256) {
        return nextLoanId - 1;
    }

    /**
     * @notice Check the special addresses' earnings from the protocol. 
     * @dev This method is useful for manager and protocol addresses. 
     *      Calling this method for a non-protocol associated addresses will return 0.
     * @param wallet Address of the wallet to check the earnings balance of.
     * @return Accumulated earnings of the wallet from the protocol.
     */
    function protocolEarningsOf(address wallet) external view returns (uint256) {
        return protocolEarnings[wallet];
    }

    /**
     * @dev Internal method to enter the pool with a token amount.
     *      With the exception of the manager's call, amount must not exceed amountDepositable().
     *      If the caller is the pool manager, entered funds are considered staked.
     *      New shares are minted in a way that will not influence the current share price.
     * @param amount A token amount to add to the pool on behalf of the caller.
     * @return Amount of shares minted and allocated to the caller.
     */
    function enterPool(uint256 amount) internal returns (uint256) {
        require(amount > 0, "SaplingPool: pool deposit amount is 0");

        // allow the manager to add funds beyond the current pool limit as all funds of the manager in the pool are staked,
        // and staking additional funds will in turn increase pool limit
        require(msg.sender == manager || (poolFundsLimit > poolFunds && amount <= poolFundsLimit.sub(poolFunds)),
         "SaplingPool: Deposit amount goes over the current pool limit.");

        uint256 shares = tokensToShares(amount);

        // charge 'amount' tokens from msg.sender
        bool success = IERC20(liquidityToken).transferFrom(msg.sender, address(this), amount);
        require(success);
        tokenBalance = tokenBalance.add(amount);

        poolLiquidity = poolLiquidity.add(amount);
        poolFunds = poolFunds.add(amount);

        // mint shares
        if (msg.sender != manager) {
            IPoolToken(poolToken).mint(msg.sender, shares);
        } else {
            IPoolToken(poolToken).mint(address(this), shares);
            lockedShares[msg.sender] = lockedShares[msg.sender].add(shares);
        }
        
        totalPoolShares = totalPoolShares.add(shares);

        return shares;
    }

    /**
     * @dev Internal method to exit the pool with a token amount.
     *      Amount must not exceed amountWithdrawable() for non managers, and amountUnstakable() for the manager.
     *      If the caller is the pool manager, exited funds are considered unstaked.
     *      Shares are burned in a way that will not influence the current share price.
     * @param amount A token amount to withdraw from the pool on behalf of the caller.
     * @return Amount of shares burned and taken from the caller.
     */
    function exitPool(uint256 amount) internal returns (uint256) {
        require(amount > 0, "SaplingPool: pool withdrawal amount is 0");
        require(poolLiquidity >= amount, "SaplingPool: pool liquidity is too low");

        uint256 shares = tokensToShares(amount);

        require(msg.sender != manager && shares <= IERC20(poolToken).balanceOf(msg.sender) || shares <= lockedShares[msg.sender],
            "SaplingPool: Insufficient balance for this operation.");

        // burn shares
        if (msg.sender != manager) {
            IPoolToken(poolToken).burn(msg.sender, shares);
        } else {
            lockedShares[msg.sender] = lockedShares[msg.sender].sub(shares);
            IPoolToken(poolToken).burn(address(this), shares);
        }

        totalPoolShares = totalPoolShares.sub(shares);

        uint256 transferAmount = amount.sub(Math.mulDiv(amount, exitFeePercent, ONE_HUNDRED_PERCENT));

        poolFunds = poolFunds.sub(transferAmount);
        poolLiquidity = poolLiquidity.sub(transferAmount);

        tokenBalance = tokenBalance.sub(transferAmount);
        bool success = IERC20(liquidityToken).transfer(msg.sender, transferAmount);
        require(success);

        return shares;
    }

    /**
     * @dev Internal method to update pool limit based on staked funds. 
     */
    function updatePoolLimit() internal {
        poolFundsLimit = sharesToTokens(Math.mulDiv(stakedShares, ONE_HUNDRED_PERCENT, targetStakePercent));
    }

    /**
     * @notice Make a payment towards a loan.
     * @dev Loan must be in OUTSTANDING status.
     *      Only the necessary sum is charged if amount exceeds amount due.
     *      Amount charged will not exceed the amount parameter. 
     * @param loanId ID of the loan to make a payment towards.
     * @param amount Payment amount in tokens.
     * @return A pair of total amount charged including interest, and the interest charged.
     */
    function repayBase(uint256 loanId, uint256 amount) internal loanInStatus(loanId, LoanStatus.OUTSTANDING) returns (uint256, uint256) {

        (uint256 amountDue, uint256 interestPercent) = loanBalanceDueWithInterest(loanId);
        uint256 transferAmount = Math.min(amountDue, amount);

        // enforce a small minimum payment amount, except for the last payment 
        require(transferAmount == amountDue || transferAmount >= ONE_TOKEN, "Sapling: Payment amount is less than the required minimum of 1 token.");

        // charge 'amount' tokens from msg.sender
        bool success = IERC20(liquidityToken).transferFrom(msg.sender, address(this), transferAmount);
        require(success);
        tokenBalance = tokenBalance.add(transferAmount);

        Loan storage loan = loans[loanId];
        LoanDetail storage loanDetail = loanDetails[loanId];
        // loan.lastPaymentTime = block.timestamp;
        
        uint256 interestPaid = Math.mulDiv(transferAmount, interestPercent, ONE_HUNDRED_PERCENT + interestPercent);
        uint256 baseAmountPaid = transferAmount.sub(interestPaid);

        //share profits to protocol
        uint256 protocolEarnedInterest = Math.mulDiv(interestPaid, protocolEarningPercent, ONE_HUNDRED_PERCENT);
        
        protocolEarnings[protocol] = protocolEarnings[protocol].add(protocolEarnedInterest); 

        //share profits to manager 
        uint256 currentStakePercent = Math.mulDiv(stakedShares, ONE_HUNDRED_PERCENT, totalPoolShares);
        uint256 managerEarnedInterest = Math
            .mulDiv(interestPaid.sub(protocolEarnedInterest),
                    Math.mulDiv(currentStakePercent, managerExcessLeverageComponent, ONE_HUNDRED_PERCENT), // managerEarningsPercent
                    ONE_HUNDRED_PERCENT);

        protocolEarnings[manager] = protocolEarnings[manager].add(managerEarnedInterest);

        loanDetail.totalAmountRepaid = loanDetail.totalAmountRepaid.add(transferAmount);
        loanDetail.baseAmountRepaid = loanDetail.baseAmountRepaid.add(baseAmountPaid);
        loanDetail.interestPaid = loanDetail.interestPaid.add(interestPaid);
        loanDetail.lastPaymentTime = block.timestamp;

        borrowerStats[loan.borrower].amountBaseRepaid = borrowerStats[loan.borrower].amountBaseRepaid.add(baseAmountPaid);
        borrowerStats[loan.borrower].amountInterestPaid = borrowerStats[loan.borrower].amountInterestPaid.add(interestPaid);

        borrowedFunds = borrowedFunds.sub(baseAmountPaid);
        poolLiquidity = poolLiquidity.add(transferAmount.sub(protocolEarnedInterest.add(managerEarnedInterest)));

        if (transferAmount == amountDue) {
            loan.status = LoanStatus.REPAID;
            borrowerStats[loan.borrower].countRepaid++;
            borrowerStats[loan.borrower].countOutstanding--;
            borrowerStats[loan.borrower].amountBorrowed = borrowerStats[loan.borrower].amountBorrowed.sub(loan.amount);
            borrowerStats[loan.borrower].amountBaseRepaid = borrowerStats[loan.borrower].amountBaseRepaid.sub(loanDetail.baseAmountRepaid);
            borrowerStats[loan.borrower].amountInterestPaid = borrowerStats[loan.borrower].amountInterestPaid.sub(loanDetail.interestPaid);
        }

        if (borrowedFunds > 0) {
            weightedAvgLoanAPR = borrowedFunds.add(baseAmountPaid).mul(weightedAvgLoanAPR).sub(baseAmountPaid.mul(loan.apr)).div(borrowedFunds);
        } else {
            weightedAvgLoanAPR = 0; //templateLoanAPR;
        }

        return (transferAmount, interestPaid);
    }

    /**
     * @notice Loan balance due including interest if paid in full at this time. 
     * @dev Internal method to get the amount due and the interest rate applied.
     * @param loanId ID of the loan to check the balance of.
     * @return A pair of a total amount due with interest on this loan, and a percentage representing the interest part of the due amount.
     */
    function loanBalanceDueWithInterest(uint256 loanId) internal view returns (uint256, uint256) {
        Loan storage loan = loans[loanId];
        if (loan.status != LoanStatus.OUTSTANDING) {
            return (0, 0);
        }

        // calculate interest percent
        uint256 daysPassed = countInterestDays(loan.borrowedTime, block.timestamp);
        uint256 apr;
        uint256 loanDueTime = loan.borrowedTime.add(loan.duration);
        if (block.timestamp <= loanDueTime) { 
            apr = loan.apr;
        } else {
            uint256 lateDays = countInterestDays(loanDueTime, block.timestamp);
            apr = daysPassed
                .mul(loan.apr)
                .add(lateDays.mul(loan.lateAPRDelta))
                .div(daysPassed);
        }

        uint256 interestPercent = Math.mulDiv(apr, daysPassed, 365);

        uint256 baseAmountDue = loan.amount.sub(loanDetails[loanId].baseAmountRepaid);
        uint256 balanceDue = baseAmountDue.add(Math.mulDiv(baseAmountDue, interestPercent, ONE_HUNDRED_PERCENT));

        return (balanceDue, interestPercent);
    }

    /**
     * @notice Get a token value of shares.
     * @param shares Amount of shares
     */
    function sharesToTokens(uint256 shares) internal view returns (uint256) {
        if (shares == 0 || poolFunds == 0) {
             return 0;
        }

        return Math.mulDiv(shares, poolFunds, totalPoolShares);
    }

    /**
     * @notice Get a share value of tokens.
     * @param tokens Amount of tokens
     */
    function tokensToShares(uint256 tokens) internal view returns (uint256) {
        if (totalPoolShares == 0) {
            // a pool with no positions
            return tokens;
        } else if (poolFunds == 0) {
            /* 
                Handle failed pool case, where: poolFunds == 0, but totalPoolShares > 0
                To minimize loss for the new depositor, assume the total value of existing shares is the minimum possible nonzero integer, which is 1
                simplify (tokens * totalPoolShares) / 1 as tokens * totalPoolShares
            */
            return tokens.mul(totalPoolShares);
        }

        return Math.mulDiv(tokens, totalPoolShares, poolFunds);
    }

    function canClose() internal view override returns (bool) {
        return borrowedFunds == 0;
    }

    function authorizedOnInactiveManager(address caller) internal view override returns (bool) {
        return caller == governance || caller == protocol || sharesToTokens(IERC20(poolToken).balanceOf(caller)) >= ONE_TOKEN;
    }

    /**
     * @notice Get the number of days in a time period to witch an interest can be applied.
     * @dev Internal helper method. Returns the ceiling of the count. 
     * @param timeFrom Epoch timestamp of the start of the time period.
     * @param timeTo Epoch timestamp of the end of the time period. 
     * @return Ceil count of days in a time period to witch an interest can be applied.
     */
    function countInterestDays(uint256 timeFrom, uint256 timeTo) private pure returns(uint256) {
        uint256 countSeconds = timeTo.sub(timeFrom);
        uint256 dayCount = countSeconds.div(86400);

        if (countSeconds.mod(86400) > 0) {
            dayCount++;
        }

        return dayCount;
    }
}
