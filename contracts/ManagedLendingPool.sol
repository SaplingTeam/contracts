// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "./Governed.sol";

/**
 * @title SaplingPool Managed Lending Pool
 * @notice Provides the basics of a managed lending pool.
 * @dev This contract is abstract. Extend the contract to implement an intended pool functionality.
 *      Extends Governed.
 */
abstract contract ManagedLendingPool is Governed {

    using SafeMath for uint256;

    /// Pool manager address
    address public manager;

    /// Protocol wallet address
    address public protocol;

    /// Address of an ERC20 token used by the pool
    address public token;

    /// tokenDecimals value retrieved from the token contract upon contract construction
    uint8 public tokenDecimals;

    /// A value representing 1.0 token amount, padded with zeros for decimals
    uint256 public ONE_TOKEN;

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

    /// Pool shares of wallets
    mapping(address => uint256) internal poolShares;

    /// Locked shares of wallets (i.e. staked shares) 
    mapping(address => uint256) internal lockedShares;

    /// Protocol earnings of wallets
    mapping(address => uint256) internal protocolEarnings; 

    /// Total amount of requested withdrawal liquidity
    uint256 public totalRequestedLiquidity = 0;

    /// Withdrawal liquidity requests by address
    mapping(address => uint256) public requestedLiquidity;
    
    /// Number of decimal digits in integer percent values used across the contract
    uint16 public constant PERCENT_DECIMALS = 1;

    /// A constant representing 100%
    uint16 public constant ONE_HUNDRED_PERCENT = 1000;

    /// Percentage of paid interest to be allocated as protocol earnings
    uint16 public protocolEarningPercent = 100; //10% by default; safe min 0%, max 10%

    /// Percentage of paid interest to be allocated as protocol earnings
    uint16 public constant MAX_PROTOCOL_EARNING_PERCENT = 100; //10%

    /// Manager's leveraged earn factor represented as a percentage
    uint16 public managerEarnFactor = 1500; // 150% or 1.5x leverage by default (safe min 100% or 1x)
    
    /// Governance set upper bound for the manager's leveraged earn factor
    uint16 public managerEarnFactorMax = 1500; //150%

    /// Part of the managers leverage factor, earnings of witch will be allocated for the manager as protocol earnings.
    /// This value is always equal to (managerEarnFactor - ONE_HUNDRED_PERCENT)
    uint256 internal managerExcessLeverageComponent;

    /// Max cooldown period for early exit
    uint256 public constant EARLY_EXIT_COOLDOWN = 90 days;

    /// Early exit fee percentage
    uint256 public earlyExitFeePercent = 5; // 0.5%

    /// Early exit deadlines by wallets
    mapping(address => uint256) public earlyExitDeadlines;

    /// Flag indicating whether or not the pool is closed
    bool public isClosed;

    /// Flag indicating whether or not lending is paused
    bool public isLendingPaused;

    event LendingPaused();
    event LendingResumed();
    event PoolClosed();
    event PoolOpened();
    event UnstakedLoss(uint256 amount);
    event StakedAssetsDepleted();

    /// Event emitted when a new protocol wallet is set
    event ProtocolWalletTransferred(address from, address to);

    modifier onlyManager {
        require(msg.sender == manager, "Managed: caller is not the manager");
        _;
    }

    modifier managerOrApprovedOnInactive {
        require(msg.sender == manager || authorizedOnInactiveManager(msg.sender),
            "Managed: caller is not the manager or an approved party.");
        _;
    }

    modifier whenNotClosed {
        require(!isClosed, "Pool is closed.");
        _;
    }

    modifier whenClosed {
        require(isClosed, "Pool is closed.");
        _;
    }

    modifier whenLendingNotPaused {
        require(!isLendingPaused, "Lending is paused.");
        _;
    }

    modifier whenLendingPaused {
        require(isLendingPaused, "Lending is not paused.");
        _;
    }

    /**
     * @notice Create a managed lending pool.
     * @dev msg.sender will be assigned as the manager of the created pool.
     * @param _token ERC20 token contract address to be used as main pool liquid currency.
     * @param _governance Address of the protocol governance.
     * @param _protocol Address of a wallet to accumulate protocol earnings.
     */
    constructor(address _token, address _governance, address _protocol) Governed(_governance) {
        require(_token != address(0), "SaplingPool: pool token address is not set");
        require(_governance != address(0), "SaplingPool: governance address is not set");
        require(_protocol != address(0), "SaplingPool: protocol wallet address is not set");
        
        manager = msg.sender;
        protocol = _protocol;

        token = _token;
        tokenBalance = 0; 
        totalPoolShares = 0;
        stakedShares = 0;

        poolFundsLimit = 0;
        poolFunds = 0;

        targetStakePercent = 100; //10%
        targetLiquidityPercent = 0; //0%

        managerExcessLeverageComponent = uint256(managerEarnFactor).sub(ONE_HUNDRED_PERCENT);
        try IERC20Metadata(token).decimals() returns(uint8 decimals) {
            tokenDecimals = decimals;
        } catch {
            tokenDecimals = 18;
        }

        ONE_TOKEN = 10 ** tokenDecimals;
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
     * @notice Close the pool and stop borrowing, lender deposits, and staking. 
     * @dev Caller must be the manager. 
     *      Pool must be open.
     *      No loans or approvals must be outstanding (borrowedFunds must equal to 0).
     *      Emits 'PoolClosed' event.
     */
    function close() external onlyManager whenNotClosed {
        require(borrowedFunds == 0, "Cannot close pool with outstanding loans.");
        isClosed = true;
        emit PoolClosed();
    }

    /**
     * @notice Open the pool for normal operations. 
     * @dev Caller must be the manager. 
     *      Pool must be closed.
     *      Opening the pool will not unpause any pauses in effect.
     *      Emits 'PoolOpened' event.
     */
    function open() external onlyManager whenClosed {
        isClosed = false;
        emit PoolOpened();
    }

    /**
     * @notice Pause new loan requests, approvals, and unstaking.
     * @dev Caller must be the manager.
     *      Lending must not be paused.
     *      Lending can be paused regardless of the pool open/close and governance pause states, 
     *      but some of the states may have a higher priority making pausing irrelevant.
     *      Emits 'LendingPaused' event.
     */
    function pauseLending() external onlyManager whenLendingNotPaused {
        isLendingPaused = true;
        emit LendingPaused();
    }

    /**
     * @notice Resume new loan requests, approvals, and unstaking.
     * @dev Caller must be the manager.
     *      Lending must be paused.
     *      Lending can be resumed regardless of the pool open/close and governance pause states, 
     *      but some of the states may have a higher priority making resuming irrelevant.
     *      Emits 'LendingPaused' event.
     */
    function resumeLending() external onlyManager whenLendingPaused {
        isLendingPaused = false;
        emit LendingResumed();
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
        }
    }

    /**
     * @notice Set the manager's earn factor percent.
     * @dev _managerEarnFactorMax must be inclusively between ONE_HUNDRED_PERCENT and managerEarnFactorMax.
     *      Caller must be the manager.
     * @param _managerEarnFactor new manager's earn factor.
     */
    function setManagerEarnFactor(uint16 _managerEarnFactor) external onlyManager notPaused {
        require(ONE_HUNDRED_PERCENT <= _managerEarnFactor && _managerEarnFactor <= managerEarnFactorMax, "Manager's earn factor is out of bounds.");
        managerEarnFactor = _managerEarnFactor;
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
     * @notice Withdraws protocol earnings belonging to the caller.
     * @dev protocolEarningsOf(msg.sender) must be greater than 0.
     *      Caller's all accumulated earnings will be withdrawn.
     */
    function withdrawProtocolEarnings() external notPaused {
        require(protocolEarnings[msg.sender] > 0, "SaplingPool: protocol earnings is zero on this account");
        uint256 amount = protocolEarnings[msg.sender];
        protocolEarnings[msg.sender] = 0; 

        // give tokens
        tokenBalance = tokenBalance.sub(amount);
        bool success = IERC20(token).transfer(msg.sender, amount);
        if(!success) {
            revert();
        }
    }

    /**
     * @notice Check if the pool can lend based on the current stake levels.
     * @return True if the staked funds provide at least a minimum ratio to the pool funds, False otherwise.
     */
    function poolCanLend() public view returns (bool) {
        return !(isLendingPaused || isPaused() || isClosed) && stakedShares >= multiplyByFraction(totalPoolShares, targetStakePercent, ONE_HUNDRED_PERCENT);
    }

    //TODO consider security implications of having the following internal function
    /**
     * @dev Internal method to charge tokens from a wallet.
     *      An appropriate approval must be present.
     * @param wallet Address to charge tokens from.
     * @param amount Token amount to charge.
     */
    function chargeTokensFrom(address wallet, uint256 amount) internal {
        bool success = IERC20(token).transferFrom(wallet, address(this), amount);
        if (!success) {
            revert();
        }
        tokenBalance = tokenBalance.add(amount);
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

        chargeTokensFrom(msg.sender, amount);
        poolLiquidity = poolLiquidity.add(amount);
        poolFunds = poolFunds.add(amount);

        uint256 balance = sharesToTokens(poolShares[msg.sender]);
        (, uint256 outstandingCooldown) = earlyExitDeadlines[msg.sender].trySub(block.timestamp);
        earlyExitDeadlines[msg.sender] = block.timestamp.add(
            balance.mul(outstandingCooldown)
                .add(amount.mul(EARLY_EXIT_COOLDOWN))
                .div(balance.add(amount))
        );

        // mint shares
        poolShares[msg.sender] = poolShares[msg.sender].add(shares);
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
        //TODO handle failed pool case when any amount equates to 0 shares

        require(poolShares[msg.sender] >= lockedShares[msg.sender] && shares <= poolShares[msg.sender] - lockedShares[msg.sender],
            "SaplingPool: Insufficient balance for this operation.");

        // burn shares
        poolShares[msg.sender] = poolShares[msg.sender].sub(shares);
        totalPoolShares = totalPoolShares.sub(shares);

        uint256 transferAmount;
        if (block.timestamp < earlyExitDeadlines[msg.sender]) {
            transferAmount = amount.sub(multiplyByFraction(amount, earlyExitFeePercent, ONE_HUNDRED_PERCENT));
        } else {
            transferAmount = amount;
        }

        poolFunds = poolFunds.sub(transferAmount);
        poolLiquidity = poolLiquidity.sub(transferAmount);

        if (requestedLiquidity[msg.sender] > 0) {
            if (requestedLiquidity[msg.sender] >= transferAmount) {
                totalRequestedLiquidity = totalRequestedLiquidity.sub(transferAmount);
                requestedLiquidity[msg.sender] = requestedLiquidity[msg.sender].sub(transferAmount); 
            } else {
                totalRequestedLiquidity = totalRequestedLiquidity.sub(requestedLiquidity[msg.sender]);
                requestedLiquidity[msg.sender] = 0;
            }
        }

        tokenBalance = tokenBalance.sub(transferAmount);
        bool success = IERC20(token).transfer(msg.sender, transferAmount);
        if(!success) {
            revert();
        }

        return shares;
    }

    /**
     * @dev Internal method to update pool limit based on staked funds. 
     */
    function updatePoolLimit() internal {
        poolFundsLimit = sharesToTokens(multiplyByFraction(stakedShares, ONE_HUNDRED_PERCENT, targetStakePercent));
    }

    function authorizedOnInactiveManager(address caller) internal view returns (bool) {
        return caller == governance || caller == protocol
            || earlyExitDeadlines[caller] < block.timestamp && sharesToTokens(poolShares[caller]) >= ONE_TOKEN;
    }
    
    /**
     * @notice Get a token value of shares.
     * @param shares Amount of shares
     */
    function sharesToTokens(uint256 shares) internal view returns (uint256) {
        if (shares == 0 || poolFunds == 0) {
             return 0;
        }

        return multiplyByFraction(shares, poolFunds, totalPoolShares);
    }

    /**
     * @notice Get a share value of tokens.
     * @param tokens Amount of tokens
     */
    function tokensToShares(uint256 tokens) internal view returns (uint256) {
        if (tokens == 0) {
            return 0;
        } else if (totalPoolShares == 0) {
            return tokens;
        }

        return multiplyByFraction(tokens, totalPoolShares, poolFunds);
    }

    /**
     * @notice Do a multiplication of a value by a fraction.
     * @param a value to be multiplied
     * @param b numerator of the fraction
     * @param c denominator of the fraction
     * @return Integer value of (a*b)/c if (a*b) does not overflow, else a*(b/c)
     */
    function multiplyByFraction(uint256 a, uint256 b, uint256 c) internal pure returns (uint256) {
        require(c != 0); // no need proceed if denominator is 0
        
        (bool notOverflow, uint256 multiplied) = a.tryMul(b);

        if(notOverflow) {
            return multiplied.div(c);
        }
        
        return a.div(c).mul(b);
    }
}
