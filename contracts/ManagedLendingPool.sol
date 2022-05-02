pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title BankFair Managed Lending Pool
 * @notice Provides the basics of a managed lending pool.
 * @dev This contract is abstract. Extend the contract to implement an intended pool functionality.
 */
abstract contract ManagedLendingPool {

    using SafeMath for uint256;

    /// Pool manager address
    address public manager;

    /// Protocol wallet address
    address public protocolWallet;

    /// Address of an ERC20 token used by the pool
    address public token;

    /// Total tokens currently held by this contract
    uint256 public tokenBalance;

    /// MAX amount of tokens allowed in the pool based on staked assets
    uint256 public poolFundsLimit;

    /// Current amount of tokens in the pool, including both liquid and borrowed funds
    uint256 public poolFunds; //poolLiquidity + borrowedFunds

    /// Current amount of liquid tokens, available to lend/withdraw/borrow
    uint256 public poolLiquidity;

    /// Total pool shares present
    uint256 public totalPoolShares;

    /// Manager's staked shares
    uint256 public sharesStaked;

    /// Target percentage ratio of staked shares to total shares
    uint16 public targetStakePercent;

    //TODO remove and use targetStakePercent
    /// minimum stake percentage level to allow loan approvals
    uint16 public loanApprovalStakePercent; 

    /// Pool shares of wallets
    mapping(address => uint256) internal poolShares;

    /// Protocol earnings of wallets
    mapping(address => uint256) internal protocolEarnings; 
    
    /// Number of decimal digits in integer percent values used across the contract
    uint16 public constant PERCENT_DECIMALS = 1;

    /// A constant representing 100%
    uint16 public constant ONE_HUNDRED_PERCENT = 1000;

    /// Percentage of paid interest to be allocated as protocol earnings
    uint16 public protocolEarningPercent = 100; //10% by default; safe min 0%, max 10%

    /// Manager's leveraged earn factor represented as a percentage
    uint16 public managerLeveragedEarningPercent = 1500; // 150% or 1.5x leverage by default (safe min 100% or 1x)

    /// Part of the managers leverage factor, earnings of witch will be allocated for the manager as protocol earnings.
    /// This value is always equal to (managerLeveragedEarningPercent - ONE_HUNDRED_PERCENT)
    uint256 internal managerExcessLeverageComponent;

    event UnstakedLoss(uint256 amount);
    event StakedAssetsDepleted();

    modifier onlyManager {
        require(msg.sender == manager, "Managed: caller is not the manager");
        _;
    }

    /**
     * @notice Create a managed lending pool.
     * @dev msg.sender will be assigned as the manager of the created pool.
     * @param tokenAddress ERC20 token contract address to be used as main pool liquid currency.
     * @param protocol Address of a wallet to accumulate protocol earnings.
     */
    constructor(address tokenAddress, address protocol) {
        require(tokenAddress != address(0), "BankFair: pool token address is not set");
        require(protocol != address(0), "BankFair: protocol wallet address is not set");
        
        manager = msg.sender;
        protocolWallet = protocol;

        token = tokenAddress;
        tokenBalance = 0; 
        totalPoolShares = 0;
        sharesStaked = 0;

        poolFundsLimit = 0;
        poolFunds = 0;

        targetStakePercent = 100; //10%
        loanApprovalStakePercent = 100; //10%

        managerExcessLeverageComponent = uint256(managerLeveragedEarningPercent).sub(ONE_HUNDRED_PERCENT);
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
    function withdrawProtocolEarnings() external {
        require(protocolEarnings[msg.sender] > 0, "BankFair: protocol earnings is zero on this account");
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
        return sharesStaked >= multiplyByFraction(totalPoolShares, loanApprovalStakePercent, ONE_HUNDRED_PERCENT);
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
        require(amount > 0, "BankFair: pool deposit amount is 0");

        // allow the manager to add funds beyond the current pool limit as all funds of the manager in the pool are staked,
        // and staking additional funds will in turn increase pool limit
        require(msg.sender == manager || (poolFundsLimit > poolFunds && amount <= poolFundsLimit.sub(poolFunds)),
         "BankFair: Deposit amount goes over the current pool limit.");

        uint256 shares = tokensToShares(amount);

        chargeTokensFrom(msg.sender, amount);
        poolLiquidity = poolLiquidity.add(amount);
        poolFunds = poolFunds.add(amount);

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
        require(amount > 0, "BankFair: pool withdrawal amount is 0");
        require(poolLiquidity >= amount, "BankFair: pool liquidity is too low");

        uint256 shares = tokensToShares(amount); 
        //TODO handle failed pool case when any amount equates to 0 shares

        burnShares(msg.sender, shares);

        poolFunds = poolFunds.sub(amount);
        poolLiquidity = poolLiquidity.sub(amount);

        tokenBalance = tokenBalance.sub(amount);
        bool success = IERC20(token).transfer(msg.sender, amount);
        if(!success) {
            revert();
        }

        return shares;
    }

    //TODO consider security implications of having the following internal function
    /**
     * @dev Internal method to burn shares of a wallet.
     * @param wallet Address to burn shares of.
     * @param shares Share amount to burn.
     */
    function burnShares(address wallet, uint256 shares) internal {
        require(poolShares[wallet] >= shares, "BankFair: Insufficient balance for this operation.");
        poolShares[wallet] = poolShares[wallet].sub(shares);
        totalPoolShares = totalPoolShares.sub(shares);
    }

    /**
     * @dev Internal method to update pool limit based on staked funds. 
     */
    function updatePoolLimit() internal {
        poolFundsLimit = sharesToTokens(multiplyByFraction(sharesStaked, ONE_HUNDRED_PERCENT, targetStakePercent));
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

    //TODO move to a library
    /**
     * @notice Do a multiplication of a value by a fraction.
     * @param a value to be multiplied
     * @param b numerator of the fraction
     * @param c denominator of the fraction
     * @return Integer value of (a*b)/c if (a*b) does not overflow, else a*(b/c)
     */
    function multiplyByFraction(uint256 a, uint256 b, uint256 c) internal pure returns (uint256) {
        //FIXME handle c == 0
        //FIXME implement a better multiplication by fraction      

        (bool notOverflow, uint256 multiplied) = a.tryMul(b);

        if(notOverflow) {
            return multiplied.div(c);
        }
        
        return a.div(c).mul(b);
    }
}
