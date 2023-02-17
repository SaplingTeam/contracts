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
     * @param _stakerAddress Staker address
     */
    function initialize(
        address _poolToken,
        address _liquidityToken,
        address _accessControl,
        address _stakerAddress
    )
        public
        initializer
    {
        __SaplingPoolContext_init(_poolToken, _liquidityToken, _accessControl, _stakerAddress);
    }

    /**
     * @notice Links a new loan desk for the pool to use. Intended for use upon initial pool deployment.
     * @dev Caller must be the governance.
     *      This setter may also be used to switch loan desks.
     *      If applicable: Outstanding loan operations must be concluded on the loan desk before the switch.
     * @param _loanDesk New LoanDesk address
     */
    function setLoanDesk(address _loanDesk) external onlyRole(SaplingRoles.GOVERNANCE_ROLE) {
        address prevLoanDesk = loanDesk;
        loanDesk = _loanDesk;
        emit LoanDeskSet(prevLoanDesk, _loanDesk);
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
     *      Loan metadata is passed along as call arguments to avoid reentry callbacks to the LoanDesk.
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

        config.weightedAvgStrategyAPR = uint16(
            (prevStrategizedFunds * config.weightedAvgStrategyAPR + amount * apr) / balances.strategizedFunds
        );

        //// interactions

        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(tokenConfig.liquidityToken), borrower, amount);

        emit LoanFundsReleased(loanId, borrower, amount);
    }

     /**
     * @dev Hook for repayments. Caller must be the LoanDesk. 
     *      
     *      Parameters besides the loanId exists simply to avoid rereading it from the caller via additional inter
     *      contract call. Avoiding loop call reduces gas, contract bytecode size, and reduces the risk of reentrancy.
     *
     * @param loanId ID of the loan which has just been borrowed
     * @param borrower Borrower address
     * @param payer Actual payer address
     * @param apr Loan apr
     * @param transferAmount Amount chargeable
     * @param interestPayable Amount of interest paid, this value is already included in the payment amount
     */
    function onRepay(
        uint256 loanId, 
        address borrower,
        address payer,
        uint16 apr,
        uint256 transferAmount,
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
            principalPaid = transferAmount;
            balances.rawLiquidity += transferAmount;
        } else {
            principalPaid = transferAmount - interestPayable;

            //share revenue to treasury
            uint256 protocolEarnedInterest = MathUpgradeable.mulDiv(
                interestPayable,
                config.protocolFeePercent,
                SaplingMath.HUNDRED_PERCENT
            );

            balances.protocolRevenue += protocolEarnedInterest;

            //share earnings to staker
            uint256 currentStakePercent = MathUpgradeable.mulDiv(
                balances.stakedShares,
                SaplingMath.HUNDRED_PERCENT,
                totalPoolTokenSupply()
            );

            uint256 stakerEarningsPercent = MathUpgradeable.mulDiv(
                currentStakePercent,
                config.stakerEarnFactor - SaplingMath.HUNDRED_PERCENT,
                SaplingMath.HUNDRED_PERCENT
            );

            uint256 stakerEarnedInterest = MathUpgradeable.mulDiv(
                interestPayable - protocolEarnedInterest,
                stakerEarningsPercent,
                stakerEarningsPercent + SaplingMath.HUNDRED_PERCENT
            );

            balances.stakerEarnings += stakerEarnedInterest;

            balances.rawLiquidity += transferAmount - (protocolEarnedInterest + stakerEarnedInterest);
            balances.poolFunds += interestPayable - (protocolEarnedInterest + stakerEarnedInterest);
        }

        balances.strategizedFunds -= principalPaid;

        updateAvgStrategyApr(principalPaid, apr);

        //// interactions

        // charge msg.sender
        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(tokenConfig.liquidityToken),
            payer,
            address(this),
            transferAmount
        );

        emit LoanRepaymentProcessed(loanId, borrower, payer, transferAmount, interestPayable);
    }

    /**
     * @dev Hook for defaulting a loan. Caller must be the LoanDesk. Defaulting a loan will cover the loss using 
     *      the staked funds. If these funds are not sufficient, the lenders will share the loss.
     * @param loanId ID of the loan to default
     * @param apr Loan apr
     * @param loss Loss amount to resolve
     */
    function onDefault(
        uint256 loanId,
        uint16 apr,
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
        loanClosed[loanDesk][loanId] = true;

        uint256 stakerLoss = loss;
        uint256 lenderLoss = 0;

        if (loss > 0) {
            uint256 remainingLostShares = fundsToShares(loss);

            balances.poolFunds -= loss;
            balances.strategizedFunds -= loss;
            updateAvgStrategyApr(loss, apr);

            if (balances.stakedShares > 0) {
                uint256 stakedShareLoss = MathUpgradeable.min(remainingLostShares, balances.stakedShares);
                remainingLostShares -= stakedShareLoss;
                balances.stakedShares -= stakedShareLoss;

                if (balances.stakedShares == 0) {
                    emit StakedFundsDepleted();
                }

                //// interactions

                //burn staked shares; this external interaction must happen before calculating lender loss
                IPoolToken(tokenConfig.poolToken).burn(address(this), stakedShareLoss);
            }

            if (remainingLostShares > 0) {
                lenderLoss = sharesToFunds(remainingLostShares);
                stakerLoss -= lenderLoss;

                emit SharedLenderLoss(loanId, lenderLoss);
            }
        }

        return (stakerLoss, lenderLoss);
    }

    /**
     * @notice View indicating whether or not a given loan amount can be offered.
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
     * @dev Overrides a hook in SaplingStakerContext.
     * @return True if the conditions to open are met, false otherwise.
     */
    function canOpen() internal view override returns (bool) {
        return loanDesk != address(0);
    }
}
