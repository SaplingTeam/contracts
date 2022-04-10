pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

abstract contract ManagedLendingPool {

    using SafeMath for uint256;

    address public manager;
    address public protocolWallet;

    address public token;
    uint256 public tokenBalance;

    uint256 public poolFunds; //poolLiqudity + borrowedFunds

    uint256 public totalPoolShares;
    uint256 public sharesStaked;

    mapping(address => uint256) internal poolShares;
    mapping(address => uint256) internal poolSharesLocked;
    mapping(address => uint256) internal protocolEarnings; 

    // to represent a percentage value as int, mutiply by (10 ^ percentDecimals)
    uint16 public constant PERCENT_DECIMALS = 1;
    uint16 public constant ONE_HUNDRED_PERCENT = 1000;
    uint16 public protocolSharePercent = 100; //10% by default; safe min 0%, max 10%
    uint16 public managerLeveragedEarningPercent = 1500; // 150% or 1.5x leverage by default (safe min 100% or 1x)

    event ManagementTransferred(address toManager);

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
        giveTokensTo(msg.sender, amount);
    }

    function chargeTokensFrom(address wallet, uint256 amount) internal {
        bool success = IERC20(token).transferFrom(wallet, address(this), amount);
        if (!success) {
            revert();
        }
        tokenBalance = tokenBalance.add(amount);
    }

    function giveTokensTo(address wallet, uint256 amount) internal {
        require(amount <= tokenBalance, "BankFair: token balance is insufficient for this withdrawal.");
        
        tokenBalance = tokenBalance.sub(amount);
        bool success = IERC20(token).transfer(wallet, amount);
        if(!success) {
            revert();
        }
    }
}
