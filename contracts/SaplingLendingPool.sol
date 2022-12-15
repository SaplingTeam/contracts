// SPDX-License-Identifier: MIT

pragma solidity ^0.8.15;

import "./context/SaplingPoolContext.sol";
import "./interfaces/ILendingPool.sol";
import "./interfaces/ILoanDesk.sol";

/**
 * @title Sapling Lending Pool
 * @dev Extends SaplingPoolContext with lending strategy.
 */
contract SaplingLendingPool is ILendingPool, SaplingPoolContext {

    /// Address of the loan desk contract
    address public loanDesk;

    /// Mark loan funds released flags to guards against double withdrawals due to future bugs or compromised LoanDesk
    mapping(address => mapping(uint256 => bool)) private loanFundsReleased;

    /// Mark the loans closed to guards against double actions due to future bugs or compromised LoanDesk
    mapping(address => mapping(uint256 => bool)) private loanClosed;

    /// A modifier to limit access only to the loan desk contract
    modifier onlyLoanDesk() {
        require(msg.sender == loanDesk, "SaplingLendingPool: caller is not the LoanDesk");
        _;
    }

    /**
     * @dev Disable initializers
     */
    function disableIntitializers() external onlyRole(SaplingRoles.GOVERNANCE_ROLE) {
        _disableInitializers();
    }

    /**
     * @notice Creates a Sapling pool.
     * @dev Addresses must not be 0.
     * @param _poolToken ERC20 token contract address to be used as the pool issued token.
     * @param _liquidityToken ERC20 token contract address to be used as pool liquidity currency.
     * @param _accessControl Access control contract
     * @param _managerRole Manager role
     */
    function initialize(
        address _poolToken,
        address _liquidityToken,
        address _accessControl,
        bytes32 _managerRole
    )
        public
        initializer
    {
        __SaplingPoolContext_init(_poolToken, _liquidityToken, _accessControl, _managerRole);
    }

    /**
     * @notice Links a new loan desk for the pool to use. Intended for use upon initial pool deployment.
     * @dev Caller must be the governance.
     * @param _loanDesk New LoanDesk address
     */
    function setLoanDesk(address _loanDesk) external onlyRole(SaplingRoles.GOVERNANCE_ROLE) {
        address prevLoanDesk = loanDesk;
        loanDesk = _loanDesk;
        emit LoanDeskSet(prevLoanDesk, loanDesk);
    }

    /**
     * @dev Hook for a new loan offer. Caller must be the LoanDesk.
     * @param amount Loan offer amount.
     */
    function onOffer(uint256 amount) external onlyLoanDesk whenNotPaused whenNotClosed {
        require(strategyLiquidity() >= amount, "SaplingLendingPool: insufficient liquidity");

        balances.rawLiquidity -= amount;
        balances.allocatedFunds += amount;

        emit OfferLiquidityAllocated(amount);
    }

    /**
     * @dev Hook for a loan offer amount update. Amount update can be due to offer update or
     *      cancellation. Caller must be the LoanDesk.
     * @param prevAmount The original, now previous, offer amount.
     * @param amount New offer amount. Cancelled offer must register an amount of 0 (zero).
     */
    function onOfferUpdate(uint256 prevAmount, uint256 amount) external onlyLoanDesk whenNotPaused whenNotClosed {
        require(strategyLiquidity() + prevAmount >= amount, "SaplingLendingPool: insufficient liquidity");

        balances.rawLiquidity = balances.rawLiquidity + prevAmount - amount;
        balances.allocatedFunds = balances.allocatedFunds - prevAmount + amount;

        emit OfferLiquidityUpdated(prevAmount, amount);
    }

    /**
     * @dev Hook for borrow. Releases the loan funds to the borrower. Caller must be the LoanDesk. 
     * Loan metadata is passed along as call arguments to avoid reentry callbacks to the LoanDesk.
     * @param loanId ID of the loan which has just been borrowed
     * @param borrower Address of the borrower
     * @param amount Loan principal amount
     * @param apr Loan apr
     */
    function onBorrow(
        uint256 loanId, 
        address borrower, 
        uint256 amount, 
        uint16 apr
    ) 
        external 
        onlyLoanDesk
        nonReentrant
        whenNotPaused
        whenNotClosed
    {
        // check
        require(loanFundsReleased[loanDesk][loanId] == false, "SaplingLendingPool: loan funds already released");

        // @dev trust the loan validity via LoanDesk checks as the only authorized caller is LoanDesk

        //// effect

        loanFundsReleased[loanDesk][loanId] = true;
        
        uint256 prevStrategizedFunds = balances.strategizedFunds;
        
        balances.tokenBalance -= amount;
        balances.allocatedFunds -= amount;
        balances.strategizedFunds += amount;

        config.weightedAvgStrategyAPR = (prevStrategizedFunds * config.weightedAvgStrategyAPR + amount * apr)
            / balances.strategizedFunds;

        //// interactions

        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(tokenConfig.liquidityToken), borrower, amount);

        emit LoanFundsReleased(loanId, borrower, amount);
    }

     /**
     * @dev Hook for repayments. Caller must be the LoanDesk. 
     *      
     *      Parameters besides the loanId exists simply to avoid rereading it from the caller via additinal inter 
     *      contract call. Avoiding loop call reduces gas, contract bytecode size, and reduces the risk of reentrancy.
     *
     * @param loanId ID of the loan which has just been borrowed
     * @param borrower Borrower address
     * @param payer Actual payer address
     * @param apr Loan apr
     * @param transferAmount Amount chargeable
     * @param paymentAmount Logical payment amount, may be different to the transfer amount due to a payment carry
     * @param interestPayable Amount of interest paid, this value is already included in the payment amount
     */
    function onRepay(
        uint256 loanId, 
        address borrower,
        address payer,
        uint16 apr,
        uint256 transferAmount, 
        uint256 paymentAmount, 
        uint256 interestPayable
    ) 
        external 
        onlyLoanDesk
        nonReentrant
        whenNotPaused
        whenNotClosed
    {
        //// check
        require(loanFundsReleased[loanDesk][loanId] == true, "SaplingLendingPool: loan is not borrowed");
        require(loanClosed[loanDesk][loanId] == false, "SaplingLendingPool: loan is closed");

        // @dev trust the loan validity via LoanDesk checks as the only caller authorized is LoanDesk

        //// effect

        balances.tokenBalance += transferAmount;

        uint256 principalPaid;
        if (interestPayable == 0) {
            principalPaid = paymentAmount;
            balances.rawLiquidity += paymentAmount;
        } else {
            principalPaid = paymentAmount - interestPayable;

            //share revenue to treasury
            uint256 protocolEarnedInterest = MathUpgradeable.mulDiv(
                interestPayable,
                config.protocolFeePercent,
                SaplingMath.HUNDRED_PERCENT
            );

            balances.protocolRevenue += protocolEarnedInterest;

            //share revenue to manager
            uint256 currentStakePercent = MathUpgradeable.mulDiv(
                balances.stakedShares,
                SaplingMath.HUNDRED_PERCENT,
                totalPoolTokenSupply()
            );

            uint256 managerEarningsPercent = MathUpgradeable.mulDiv(
                currentStakePercent,
                config.managerEarnFactor - SaplingMath.HUNDRED_PERCENT,
                SaplingMath.HUNDRED_PERCENT
            );

            uint256 managerEarnedInterest = MathUpgradeable.mulDiv(
                interestPayable - protocolEarnedInterest,
                managerEarningsPercent,
                managerEarningsPercent + SaplingMath.HUNDRED_PERCENT
            );

            balances.managerRevenue += managerEarnedInterest;

            balances.rawLiquidity += paymentAmount - (protocolEarnedInterest + managerEarnedInterest);
            balances.poolFunds += interestPayable - (protocolEarnedInterest + managerEarnedInterest);
        }

        balances.strategizedFunds -= principalPaid;

        updateAvgStrategyApr(principalPaid, apr);

        //// interactions

        // charge 'amount' tokens from msg.sender
        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(tokenConfig.liquidityToken),
            payer,
            address(this),
            transferAmount
        );

        emit LoanRepaymentConfirmed(loanId, borrower, payer, transferAmount, interestPayable);
    }

    /**
     * @dev Hook for closing a loan. Caller must be the LoanDesk. Closing a loan will repay the outstanding principal 
     * using the pool manager's revenue and/or staked funds. If these funds are not sufficient, the lenders will 
     * share the loss.
     * @param loanId ID of the loan to close
     * @param apr Loan apr
     * @param amountRepaid Amount repaid based on outstanding payment carry
     * @param remainingDifference Principal amount remaining to be resolved to close the loan
     * @return Amount reimbursed by the pool manager funds
     */
    function onCloseLoan(
        uint256 loanId,
        uint16 apr,
        uint256 amountRepaid,
        uint256 remainingDifference
    )
        external
        onlyLoanDesk
        nonReentrant
        whenNotPaused
        whenNotClosed
        returns (uint256)
    {
        //// check
        require(loanClosed[loanDesk][loanId] == false, "SaplingLendingPool: loan is closed");

        // @dev trust the loan validity via LoanDesk checks as the only caller authorized is LoanDesk

        //// effect

        loanClosed[loanDesk][loanId] == true;

        // charge manager's revenue
        if (remainingDifference > 0 && balances.managerRevenue > 0) {
            uint256 amountChargeable = MathUpgradeable.min(remainingDifference, balances.managerRevenue);

            balances.managerRevenue -= amountChargeable;

            remainingDifference -= amountChargeable;
            amountRepaid += amountChargeable;
        }

        // charge manager's stake
        uint256 stakeChargeable = 0;
        if (remainingDifference > 0 && balances.stakedShares > 0) {
            uint256 stakedBalance = tokensToFunds(balances.stakedShares);
            uint256 amountChargeable = MathUpgradeable.min(remainingDifference, stakedBalance);
            stakeChargeable = fundsToTokens(amountChargeable);

            balances.stakedShares = balances.stakedShares - stakeChargeable;

            if (balances.stakedShares == 0) {
                emit StakedAssetsDepleted();
            }

            remainingDifference -= amountChargeable;
            amountRepaid += amountChargeable;
        }

        if (amountRepaid > 0) {
            balances.strategizedFunds -= amountRepaid;
            balances.rawLiquidity += amountRepaid;
        }

        // charge pool (close loan and reduce borrowed funds/poolfunds)
        if (remainingDifference > 0) {
            balances.strategizedFunds -= remainingDifference;
            balances.poolFunds -= remainingDifference;

            emit UnstakedLoss(remainingDifference);
        }

        updateAvgStrategyApr(amountRepaid + remainingDifference, apr);

        //// interactions
        if (stakeChargeable > 0) {
            IPoolToken(tokenConfig.poolToken).burn(address(this), stakeChargeable);
        }

        return amountRepaid;
    }

    /**
     * @dev Hook for defaulting a loan. Caller must be the LoanDesk. Defaulting a loan will cover the loss using 
     * the staked funds. If these funds are not sufficient, the lenders will share the loss.
     * @param loanId ID of the loan to default
     * @param apr Loan apr
     * @param carryAmountUsed Amount of payment carry repaid 
     * @param loss Loss amount to resolve
     */
    function onDefault(
        uint256 loanId,
        uint16 apr,
        uint256 carryAmountUsed,
        uint256 loss
    )
        external
        onlyLoanDesk
        nonReentrant
        whenNotPaused
        whenNotClosed
        returns (uint256, uint256)
    {
        //// check
        require(loanClosed[loanDesk][loanId] == false, "SaplingLendingPool: loan is closed");

        // @dev trust the loan validity via LoanDesk checks as the only caller authorized is LoanDesk

        //// effect
        loanClosed[loanDesk][loanId] == true;

        if (carryAmountUsed > 0) {
            balances.strategizedFunds -= carryAmountUsed;
            balances.rawLiquidity += carryAmountUsed;
        }

        uint256 managerLoss = loss;
        uint256 lenderLoss = 0;

        if (loss > 0) {
            uint256 remainingLostShares = fundsToTokens(loss);

            balances.poolFunds -= loss;
            balances.strategizedFunds -= loss;
            updateAvgStrategyApr(loss, apr);

            if (balances.stakedShares > 0) {
                uint256 stakedShareLoss = MathUpgradeable.min(remainingLostShares, balances.stakedShares);
                remainingLostShares -= stakedShareLoss;
                balances.stakedShares -= stakedShareLoss;

                if (balances.stakedShares == 0) {
                    emit StakedAssetsDepleted();
                }

                //// interactions

                //burn manager's shares; this external interaction must happen before calculating lender loss
                IPoolToken(tokenConfig.poolToken).burn(address(this), stakedShareLoss);
            }

            if (remainingLostShares > 0) {
                lenderLoss = tokensToFunds(remainingLostShares);
                managerLoss -= lenderLoss;

                emit UnstakedLoss(lenderLoss);
            }
        }

        return (managerLoss, lenderLoss);
    }

    /**
     * @notice View indicating whether or not a given loan can be offered by the manager.
     * @dev Hook for checking if the lending pool can provide liquidity for the total offered loans amount.
     * @param totalOfferedAmount Total sum of offered loan amount including outstanding offers
     * @return True if the pool has sufficient lending liquidity, false otherwise
     */
    function canOffer(uint256 totalOfferedAmount) external view returns (bool) {
        return !paused() 
            && !closed() 
            && maintainsStakeRatio()
            && totalOfferedAmount <= strategyLiquidity() + balances.allocatedFunds;
    }

    /**
     * @notice Indicates whether or not the contract can be opened in it's current state.
     * @dev Overrides a hook in SaplingManagerContext.
     * @return True if the conditions to open are met, false otherwise.
     */
    function canOpen() internal view override returns (bool) {
        return loanDesk != address(0);
    }
}
