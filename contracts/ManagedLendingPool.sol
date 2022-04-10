pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

abstract contract ManagedLendingPool {

    using SafeMath for uint256;

    address public manager;
    address public protocolWallet;

    address public token;
    uint256 public tokenBalance;

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
    }

    function transferManagement(address newManager) external onlyManager {
        require(newManager != address(0), "Managed: new manager address is not set");
        manager = newManager;

        emit ManagementTransferred(newManager);
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
