// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.15;

import "./context/SaplingPoolContext.sol";
import "./interfaces/ILoanDeskHook.sol";
import "./interfaces/ILendingPoolHook.sol";

/**
 * @title Sapling Lending Pool
 */
contract SaplingLendingPool is ILendingPoolHook, SaplingPoolContext {

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

    /// Loans by loanId
    mapping(uint256 => Loan) public loans;

    mapping(uint256 => LoanDetail) public loanDetails;

    /// Borrower statistics by address 
    mapping(address => BorrowerStats) public borrowerStats;

    event LoanDeskSet(address from, address to);
    event LoanBorrowed(uint256 loanId, address indexed borrower, uint256 applicationId);
    event LoanRepaid(uint256 loanId, address indexed borrower);
    event LoanDefaulted(uint256 loanId, address indexed borrower, uint256 amountLost);

    modifier loanInStatus(uint256 loanId, LoanStatus status) {
        Loan storage loan = loans[loanId];
        require(loan.id != 0, "Loan is not found.");
        require(loan.status == status, "Loan does not have a valid status for this operation.");
        _;
    }

    modifier onlyLoanDesk() {
        require(msg.sender == loanDesk, "Sapling: caller is not the LoanDesk");
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
        SaplingPoolContext(_poolToken, _liquidityToken, _governance, _protocol, _manager) {
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

        uint256 loanId = getNextStrategyId();

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

        uint256 prevStrategizedFunds = strategizedFunds;
        allocatedFunds = allocatedFunds.sub(offer.amount);
        strategizedFunds = strategizedFunds.add(offer.amount);

        weightedAvgStrategyAPR = prevStrategizedFunds.mul(weightedAvgStrategyAPR).add(offer.amount.mul(offer.apr)).div(strategizedFunds);

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
            uint256 prevStrategizedFunds = strategizedFunds;
            uint256 baseAmountLost = loan.amount.sub(loanDetail.baseAmountRepaid);
            strategizedFunds = strategizedFunds.sub(baseAmountLost);

            if (strategizedFunds > 0) {
                weightedAvgStrategyAPR = prevStrategizedFunds.mul(weightedAvgStrategyAPR).sub(baseAmountLost.mul(loan.apr)).div(strategizedFunds);
            } else {
                weightedAvgStrategyAPR = 0;//templateLoanAPR;
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

    function onOffer(uint256 amount) external override onlyLoanDesk {
        require(strategyLiquidity() >= amount, "Sapling: insufficient liquidity for this operation");
        poolLiquidity = poolLiquidity.sub(amount);
        allocatedFunds = allocatedFunds.add(amount);
    }

    function onOfferUpdate(uint256 prevAmount, uint256 amount) external onlyLoanDesk {
        require(strategyLiquidity().add(prevAmount) >= amount, "Sapling: insufficient liquidity for this operation");

        poolLiquidity = poolLiquidity.add(prevAmount).sub(amount);
        allocatedFunds = allocatedFunds.sub(prevAmount).add(amount);
    }

    /**
     * @notice View indicating whether or not a given loan can be offered by the manager.
     * @param totalOfferedAmount loanOfferAmount
     * @return True if the given total loan amount can be offered, false otherwise
     */
    function canOffer(uint256 totalOfferedAmount) external view override returns (bool) {
        return isPoolFunctional() && strategyLiquidity().add(allocatedFunds) >= totalOfferedAmount;
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
     * @notice Check if the pool can lend based on the current stake levels.
     * @return True if the staked funds provide at least a minimum ratio to the pool funds, False otherwise.
     */
    function poolCanLend() external view returns (bool) {
        return isPoolFunctional();
    }

    /**
     * @notice Count of all loan requests in this pool.
     * @return Loans count.
     */
    function loansCount() external view returns(uint256) {
        return strategyCount();
    }

    function borrowedFunds() external view returns(uint256) {
        return strategizedFunds;
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

        strategizedFunds = strategizedFunds.sub(baseAmountPaid);
        poolLiquidity = poolLiquidity.add(transferAmount.sub(protocolEarnedInterest.add(managerEarnedInterest)));

        if (transferAmount == amountDue) {
            loan.status = LoanStatus.REPAID;
            borrowerStats[loan.borrower].countRepaid++;
            borrowerStats[loan.borrower].countOutstanding--;
            borrowerStats[loan.borrower].amountBorrowed = borrowerStats[loan.borrower].amountBorrowed.sub(loan.amount);
            borrowerStats[loan.borrower].amountBaseRepaid = borrowerStats[loan.borrower].amountBaseRepaid.sub(loanDetail.baseAmountRepaid);
            borrowerStats[loan.borrower].amountInterestPaid = borrowerStats[loan.borrower].amountInterestPaid.sub(loanDetail.interestPaid);
        }

        if (strategizedFunds > 0) {
            weightedAvgStrategyAPR = strategizedFunds.add(baseAmountPaid).mul(weightedAvgStrategyAPR).sub(baseAmountPaid.mul(loan.apr)).div(strategizedFunds);
        } else {
            weightedAvgStrategyAPR = 0; //templateLoanAPR;
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
