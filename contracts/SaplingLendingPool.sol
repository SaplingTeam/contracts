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

    /// Address where the protocol fees are sent to
    address public treasury;

    /// timestamp up to which the yield has been settled.
    uint256 public yieldSettledTime;

    /// Mark the loans closed to guards against double actions due to future bugs or compromised LoanDesk
    mapping(address => mapping(uint256 => bool)) private loanClosed;

    /// A modifier to limit access only to the loan desk contract
    modifier onlyLoanDesk() {
        require(msg.sender == loanDesk, "SaplingLendingPool: caller is not the LoanDesk");
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Creates a Sapling pool.
     * @dev Addresses must not be 0.
     * @param _poolToken ERC20 token contract address to be used as the pool issued token.
     * @param _liquidityToken ERC20 token contract address to be used as pool liquidity currency.
     * @param _accessControl Access control contract
     * @param _treasury Address where the protocol fees are sent to
     * @param _stakerAddress Staker address
     */
    function initialize(
        address _poolToken,
        address _liquidityToken,
        address _accessControl,
        address _treasury,
        address _stakerAddress
    )
        public
        initializer
    {
        __SaplingPoolContext_init(_poolToken, _liquidityToken, _accessControl, _stakerAddress);

        require(_treasury != address(0), "SaplingPoolContext: treasury address is not set");

        treasury = _treasury;
        yieldSettledTime = block.timestamp;
    }

    /**
     * @notice Links a new loan desk for the pool to use. Intended for use upon initial pool deployment.
     * @dev Caller must be the governance.
     *      This setter may also be used to switch loan desks.
     *      If applicable: Outstanding loan operations must be concluded on the loan desk before the switch.
     * @param _loanDesk New LoanDesk address
     */
    function setLoanDesk(address _loanDesk) external onlyRole(SaplingRoles.GOVERNANCE_ROLE) {
        require(address (loanDesk) == address (0), "SaplingLendingPool: LoanDesk already set");

        address prevLoanDesk = loanDesk;
        loanDesk = _loanDesk;
        emit LoanDeskSet(prevLoanDesk, _loanDesk);
    }

    /**
     * @notice Designates a new treasury address for the pool.
     * @dev Protocol fees will be sent to this address on every interest payment.
     * @param _treasury New treasury address
     */
    function setTreasury(address _treasury) external onlyRole(SaplingRoles.GOVERNANCE_ROLE) {
        address prevTreasury = treasury;
        treasury = _treasury;
        emit TreasurySet(prevTreasury, _treasury);
    }

    /**
     * @notice Settle pending yield.
     * @dev Calculates interest due since last update and increases preSettledYield,
     *      taking into account the protocol fee and the staker earnings.
     */
    function settleYield() public override {
        if (block.timestamp < yieldSettledTime + 86400) {
            // re-settlement is too soon, do nothing
            return;
        }

        uint256 principalOutstanding = ILoanDesk(loanDesk).lentFunds();
        uint16 avgApr = ILoanDesk(loanDesk).weightedAvgAPR();

        if (principalOutstanding == 0 || avgApr == 0) {
            // new yield will be zero, update settled time and do nothing
            yieldSettledTime = block.timestamp;
            return;
        }

        uint256 interestDays = MathUpgradeable.ceilDiv(block.timestamp - yieldSettledTime, 86400);
        uint256 interestPercent = MathUpgradeable.mulDiv(uint256(avgApr) * 1e18, interestDays, 365);
        uint256 interestDue = MathUpgradeable.mulDiv(
            principalOutstanding,
            interestPercent,
            SaplingMath.HUNDRED_PERCENT
        ) / 1e18;

        // account for protocol fee and staker earnings
        (uint256 shareholderYield, /* ignored */, /* ignored */) = breakdownEarnings(interestDue);

        balances.preSettledYield += shareholderYield;
        yieldSettledTime += interestDays * 86400;
    }

    /**
     * @dev Hook for a new loan offer. Caller must be the LoanDesk.
     * @param amount Amount to be allocated for loan offers.
     */
    function onOfferAllocate(uint256 amount) external onlyLoanDesk whenNotPaused whenNotClosed updatedState {
        require(amount > 0, "SaplingLendingPool: invalid amount");
        require(strategyLiquidity() >= amount, "SaplingLendingPool: insufficient liquidity");

        SafeERC20Upgradeable.safeTransfer(IERC20Upgradeable(tokenConfig.liquidityToken), loanDesk, amount);

        emit OfferLiquidityAllocated(amount);
    }

    /**
     * @dev Hook for a loan offer amount update. Amount update can be due to offer update or
     *      cancellation. Caller must be the LoanDesk.
     * @param amount Previously allocated amount being returned.
     */
    function onOfferDeallocate(uint256 amount) external onlyLoanDesk whenNotPaused whenNotClosed {
        require(amount > 0, "SaplingLendingPool: invalid amount");

        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(tokenConfig.liquidityToken),
            loanDesk,
            address(this),
            amount
        );

        emit OfferLiquidityDeallocated(amount);
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
     * @param transferAmount Amount chargeable
     * @param interestPayable Amount of interest paid, this value is already included in the payment amount
     */
    function onRepay(
        uint256 loanId, 
        address borrower,
        address payer,
        uint256 transferAmount,
        uint256 interestPayable
    ) 
        external 
        onlyLoanDesk
        nonReentrant
        whenNotPaused
        whenNotClosed
        updatedState
    {
        //// check
        require(loanClosed[loanDesk][loanId] == false, "SaplingLendingPool: loan is closed");

        // @dev trust the loan validity via LoanDesk checks as the only caller authorized is LoanDesk

        uint256 principalPaid;
        uint256 stakerEarnedInterest;
        uint256 protocolEarnedInterest;
        if (interestPayable == 0) {
            principalPaid = transferAmount;
            stakerEarnedInterest = 0;
            protocolEarnedInterest = 0;
        } else {
            principalPaid = transferAmount - interestPayable;
            uint256 shareholderYield;
            (shareholderYield, protocolEarnedInterest, stakerEarnedInterest) = breakdownEarnings(interestPayable);

            if (balances.preSettledYield > shareholderYield) {
                balances.preSettledYield -= shareholderYield;
            } else {
                balances.preSettledYield = 0;
            }
        }

        //// interactions

        // charge msg.sender
        SafeERC20Upgradeable.safeTransferFrom(
            IERC20Upgradeable(tokenConfig.liquidityToken),
            payer,
            address(this),
            transferAmount
        );

        // send protocol fees to treasury
        if (protocolEarnedInterest > 0) {
            SafeERC20Upgradeable.safeTransfer(
                IERC20Upgradeable(tokenConfig.liquidityToken),
                treasury,
                protocolEarnedInterest
            );

            emit ProtocolRevenue(treasury, protocolEarnedInterest);
        }

        // send staker earnings
        if (stakerEarnedInterest > 0) {
            SafeERC20Upgradeable.safeTransfer(
                IERC20Upgradeable(tokenConfig.liquidityToken),
                staker,
                stakerEarnedInterest
            );

            emit StakerEarnings(staker, stakerEarnedInterest);
        }

        emit LoanRepaymentProcessed(loanId, borrower, payer, transferAmount, interestPayable);
    }

    /**
     * @dev Hook for defaulting a loan. Caller must be the LoanDesk. Defaulting a loan will cover the loss using 
     *      the staked funds. If these funds are not sufficient, the lenders will share the loss.
     * @param loanId ID of the loan to default
     * @param principalLoss Unpaid principal amount to resolve
     * @param yieldLoss Unpaid yield amount to resolve
     */
    function onDefault(
        uint256 loanId,
        uint256 principalLoss,
        uint256 yieldLoss
    )
        external
        onlyLoanDesk
        nonReentrant
        whenNotPaused
        whenNotClosed
        updatedState
        returns (uint256, uint256)
    {
        //// check
        require(loanClosed[loanDesk][loanId] == false, "SaplingLendingPool: loan is closed");

        // @dev trust the loan validity via LoanDesk checks as the only caller authorized is LoanDesk

        //// effect
        loanClosed[loanDesk][loanId] = true;

        //remove protocol and staker earnings from yield loss
        if (yieldLoss > 0) {
            (/* ignored */, uint256 protocolFee, uint256 stakerEarnings) = breakdownEarnings(yieldLoss);

            yieldLoss -= (protocolFee + stakerEarnings);
        }

        uint256 totalLoss = principalLoss + yieldLoss;
        uint256 stakerLoss = 0;
        uint256 lenderLoss = 0;

        if (totalLoss > 0) {
            uint256 remainingLostShares = fundsToShares(totalLoss);

            if (balances.stakedShares > 0) {
                uint256 stakedShareLoss = MathUpgradeable.min(remainingLostShares, balances.stakedShares);
                stakerLoss = sharesToFunds(stakedShareLoss);

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
                lenderLoss = totalLoss - stakerLoss;

                emit SharedLenderLoss(loanId, lenderLoss);
            }
        }

        if (balances.preSettledYield > 0 && balances.preSettledYield > yieldLoss) {
            balances.preSettledYield -= yieldLoss;
        } else {
            balances.preSettledYield = 0;
        }

        return (stakerLoss, lenderLoss);
    }

    /**
     * @notice View indicating whether or not a given loan amount can be offered.
     * @dev Hook for checking if the lending pool can provide liquidity for the total offered loans amount.
     * @param amount Amount to check for new loan allocation
     * @return True if the pool has sufficient lending liquidity, false otherwise
     */
    function canOffer(uint256 amount) external view returns (bool) {
        return !paused() 
            && !closed() 
            && maintainsStakeRatio()
            && amount <= strategyLiquidity();
    }

    /**
     * @notice Indicates whether or not the contract can be opened in it's current state.
     * @dev Overrides a hook in SaplingStakerContext.
     * @return True if the conditions to open are met, false otherwise.
     */
    function canOpen() internal view override returns (bool) {
        return loanDesk != address(0)
            && IPoolToken(tokenConfig.poolToken).balanceOf(accessControl) >= 10 ** tokenConfig.decimals;
    }

    /**
     * @dev Implementation of the abstract hook in SaplingManagedContext.
     *      Pool can be close when no funds remain committed to strategies.
     */
    function canClose() internal view override returns (bool) {
        return IERC20(tokenConfig.liquidityToken).balanceOf(loanDesk) == 0
            && ILoanDesk(loanDesk).lentFunds() == 0;
    }

    /**
     * @notice Current amount of liquidity tokens in strategies, including both allocated and committed
     *         but excluding pending yield.
     * @dev Overrides the same method in the base contract.
     */
    function strategizedFunds() internal view override returns (uint256) {
        return IERC20(tokenConfig.liquidityToken).balanceOf(loanDesk) + ILoanDesk(loanDesk).lentFunds();
    }

    /**
     * @notice Estimate APY breakdown given the current pool state.
     * @return Current APY breakdown
     */
    function currentAPY() external view returns (APYBreakdown memory) {
        return projectedAPYBreakdown(
            totalPoolTokenSupply(),
            balances.stakedShares,
            poolFunds(),
            ILoanDesk(loanDesk).lentFunds(),
            ILoanDesk(loanDesk).weightedAvgAPR(),
            config.protocolFeePercent,
            config.stakerEarnFactor
        );
    }

    /**
     * @dev Breaks down an interest amount to shareholder yield, protocol fee and staker earnings.
     * @param interestAmount Interest amount paid by the borrower
     * @return Amounts for (shareholderYield, protocolFee, stakerEarnings)
     */
    function breakdownEarnings(uint256 interestAmount) public view returns (uint256, uint256, uint256) {
        uint256 protocolFee = MathUpgradeable.mulDiv(
            interestAmount,
            config.protocolFeePercent,
            SaplingMath.HUNDRED_PERCENT
        );

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

        uint256 stakerEarnings = MathUpgradeable.mulDiv(
            interestAmount - protocolFee,
            stakerEarningsPercent,
            stakerEarningsPercent + SaplingMath.HUNDRED_PERCENT
        );

        uint256 shareholderYield = interestAmount - (protocolFee + stakerEarnings);

        return (shareholderYield, protocolFee, stakerEarnings);
    }
}
