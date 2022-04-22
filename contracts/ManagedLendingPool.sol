pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

abstract contract ManagedLendingPool {

    using SafeMath for uint256;

    address public manager;
    address public protocolWallet;

    address public token;
    uint256 public tokenBalance;

    uint256 public poolFundsLimit;
    uint256 public poolFunds; //poolLiqudity + borrowedFunds
    uint256 public poolLiqudity;

    uint256 public totalPoolShares;
    uint256 public sharesStaked;
    uint16 public targetStakePercent; //target percentage ratio of staked shares to total shares
    uint16 public loanApprovalStakePercent; //minimum stake percentage level to allow loan approvals

    mapping(address => uint256) internal poolShares;
    mapping(address => uint256) internal protocolEarnings; 

    // to represent a percentage value as int, mutiply by (10 ^ percentDecimals)
    uint16 public constant PERCENT_DECIMALS = 1;
    uint16 public constant ONE_HUNDRED_PERCENT = 1000;
    uint16 public protocolSharePercent = 100; //10% by default; safe min 0%, max 10%
    uint16 public managerLeveragedEarningPercent = 1500; // 150% or 1.5x leverage by default (safe min 100% or 1x)

    event ManagementTransferred(address toManager);
    event UnstakedLoss(uint256 amount);
    event StakedAssetsDepleted();

    modifier onlyManager {
        require(msg.sender == manager, "Managed: caller is not the manager");
        _;
    }

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
        loanApprovalStakePercent = 80; //8%
    }

    function transferManagement(address newManager) external onlyManager {
        require(newManager != address(0), "Managed: new manager address is not set");
        manager = newManager;

        emit ManagementTransferred(newManager);
    }

    function protocolEarningsOf(address wallet) external view returns (uint256) {
        return protocolEarnings[wallet];
    }
 
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

    function chargeTokensFrom(address wallet, uint256 amount) internal {
        bool success = IERC20(token).transferFrom(wallet, address(this), amount);
        if (!success) {
            revert();
        }
        tokenBalance = tokenBalance.add(amount);
    }

    function enterPool(uint256 amount) internal returns (uint256) {
        require(amount > 0, "BankFair: pool deposit amount is 0");

        // allow the manager to add funds beyond the current pool limit as all funds of the manager in the pool are staked,
        // and staking additional funds will in turn increase pool limit
        require(msg.sender == manager || (poolFundsLimit > poolFunds && amount <= poolFundsLimit.sub(poolFunds)),
         "BankFair: Deposit amount goes over the current pool limit.");

        uint256 shares = tokensToShares(amount);

        chargeTokensFrom(msg.sender, amount);
        poolLiqudity = poolLiqudity.add(amount);
        poolFunds = poolFunds.add(amount);

        // mint shares
        poolShares[msg.sender] = poolShares[msg.sender].add(shares);
        totalPoolShares = totalPoolShares.add(shares);

        return shares;
    }

    function exitPool(uint256 amount) internal returns (uint256) {
        require(amount > 0, "BankFair: pool withdrawal amount is 0");
        require(poolLiqudity >= amount, "BankFair: pool liquidity is too low");

        uint256 shares = tokensToShares(amount); 
        //TODO handle failed pool case when any amount equates to 0 shares

        burnShares(msg.sender, shares);

        poolFunds = poolFunds.sub(amount);
        poolLiqudity = poolLiqudity.sub(amount);

        tokenBalance = tokenBalance.sub(amount);
        bool success = IERC20(token).transfer(msg.sender, amount);
        if(!success) {
            revert();
        }

        return shares;
    }

    function burnShares(address wallet, uint256 shares) internal {
        poolShares[wallet] = poolShares[wallet].sub(shares);
        totalPoolShares = totalPoolShares.sub(shares);
    }

    function updatePoolLimit() internal {
        poolFundsLimit = sharesToTokens(multiplyByFraction(sharesStaked, ONE_HUNDRED_PERCENT, targetStakePercent));
    }
    
    function sharesToTokens(uint256 shares) internal view returns (uint256) {
        if (shares == 0 || poolFunds == 0) {
             return 0;
        }

        return multiplyByFraction(shares, poolFunds, totalPoolShares);
    }

    function tokensToShares(uint256 tokens) internal view returns (uint256) {
        if (tokens == 0) {
            return 0;
        } else if (totalPoolShares == 0) {
            return tokens;
        }

        return multiplyByFraction(tokens, totalPoolShares, poolFunds);
    }

    //TODO move to a library
    //calculate a x (b/c)
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
