pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ManagedLender.sol";

contract BankFairPool is ManagedLender {

    using SafeMath for uint256;

    address public token;

    uint256 public tokenBalance;
    uint256 public fundingBalance;

    uint256 public poolFunds; //poolLiqudity + borrowedFunds
    uint256 public totalPoolShares;
    uint256 public managerStakedShares;

    mapping(address => uint256) public fundingBalances; 
    mapping(address => uint256) public poolShares;
    mapping(address => uint256) public poolSharesLocked;

    event UnstakedLoss(uint256 amount);
    event StakedAssetsDepleted();
    
    constructor(address tokenAddress, uint256 minLoanAmount) ManagedLender(minLoanAmount) {
        require(tokenAddress != address(0), "BankFair: pool token address is not set");

        token = tokenAddress;

        tokenBalance = 0;
        fundingBalance = 0;

        poolFunds = 0;
        totalPoolShares = 0;
        managerStakedShares = 0;
    }

    function deposit(uint256 amount) external {
        require(amount > 0, "BankFair: deposit amount is 0");

        bool success = IERC20(token).transferFrom(msg.sender, address(this), amount);
        if (!success) {
            revert();
        }

        increaseFunds(msg.sender, amount);
        tokenBalance = tokenBalance.add(amount);
    }

    function withdraw(uint256 amount) external {
        require(amount > 0, "BankFair: withdrawal amount is 0");

        decreaseFunds(msg.sender, amount);
        tokenBalance = tokenBalance.sub(amount);

        bool success = IERC20(token).transfer(msg.sender, amount);
        if(!success) {
            revert();
        }
    }

    function balanceOf(address wallet) external view returns (uint256) {
        return fundingBalances[wallet];
    }

    function enterPool(uint256 amount) external {
        require(amount > 0, "BankFair: pool deposit amount is 0");

        decreaseFunds(msg.sender, amount);
        increasePoolFunds(msg.sender, amount);
    }

    function exitPool(uint256 amount) external {
        require(amount > 0, "BankFair: pool withdrawal amount is 0");

        decreasePoolFunds(msg.sender, amount);
        increaseFunds(msg.sender, amount);
    }

    function poolBalanceOf(address wallet) external view returns (uint256) {
        return sharesToTokens(poolShares[wallet]);
    }

    function stake(uint256 amount) external onlyManager {
        require(amount > 0, "BankFair: stake amount is 0");

        uint256 shares = tokensToShares(amount);
        poolSharesLocked[msg.sender] = poolSharesLocked[msg.sender].add(shares);
        managerStakedShares = managerStakedShares.add(shares);
    }
    
    function unstake(uint256 amount) external onlyManager {
        require(amount > 0, "BankFair: unstake amount is 0");
        require(amount <= balanceStakadUnlocked(), "BankFair: requested amount is not available to be unstaked");

        uint256 shares = tokensToShares(amount);
        poolSharesLocked[msg.sender] = poolSharesLocked[msg.sender].sub(shares);
        managerStakedShares = managerStakedShares.sub(shares);
    }
    
    function balanceStaked() external view returns (uint256) {
        return sharesToTokens(managerStakedShares);
    }

    function balanceStakadUnlocked() public view returns (uint256) {
        //staked funds locked up to 1/10 of the currently borrowed amount
        (,uint256 amountWithdrawable) = sharesToTokens(managerStakedShares).trySub(borrowedFunds.div(10)); 
        return amountWithdrawable;
    }

    function deductLosses(address borrower, uint256 lossAmount) internal override {

        uint256 remainingLoss = lossAmount;

        //attempt to deduct losses from funding account of the borrower
        if (fundingBalances[borrower] > 0) {
            uint256 balance = fundingBalances[borrower];
            uint256 deductableAmount = Math.min(balance, lossAmount);
            decreaseFunds(borrower, deductableAmount);
            remainingLoss = remainingLoss.sub(deductableAmount);
        }

        if (remainingLoss == 0) {
            return;
        }

        poolFunds = poolFunds.sub(remainingLoss);

        uint256 lostShares = tokensToShares(remainingLoss);
        if (lostShares <= managerStakedShares) {
            managerStakedShares = managerStakedShares.sub(lostShares);
        } else if (managerStakedShares > 0) {
            lostShares = lostShares.sub(managerStakedShares);
            managerStakedShares = 0;
        }

        if (lostShares > 0) {
            emit UnstakedLoss(sharesToTokens(lostShares));
        }

        if (managerStakedShares == 0) {
            emit StakedAssetsDepleted();
        }
    }

    function increaseFunds(address wallet, uint256 amount) internal override{
        fundingBalances[wallet] = fundingBalances[wallet].add(amount);
        fundingBalance = fundingBalance.add(amount);
    }

    function decreaseFunds(address wallet, uint256 amount) internal override {
        require(fundingBalances[wallet] >= amount, "BankFair: requested amount is not available in the funding account");
        fundingBalances[wallet] = fundingBalances[wallet].sub(amount);
        fundingBalance = fundingBalance.sub(amount);
    }

    function increasePoolFunds(address wallet, uint256 amount) private returns (uint256) {
        uint256 shares = tokensToShares(amount);
        poolShares[wallet] = poolShares[wallet].add(shares);
        poolLiqudity = poolLiqudity.add(amount);
        poolFunds = poolFunds.add(amount);
        totalPoolShares = totalPoolShares.add(shares);
        return shares;
    }

    function decreasePoolFunds(address wallet, uint256 amount) private {
        require(poolLiqudity >= amount, "BankFair: pool does not have sufficient liqudity for this operation");

        uint256 shares = tokensToShares(amount);
        require(poolShares[wallet] - poolSharesLocked[wallet] >= shares, "BankFair: unlocked balance is not sufficient in the pool account");

        poolShares[wallet] = poolShares[wallet].sub(shares);
        poolLiqudity = poolLiqudity.sub(amount);
        poolFunds = poolFunds.sub(amount);
        totalPoolShares = totalPoolShares.sub(shares);
    }
    
    function sharesToTokens(uint256 shares) private view returns (uint256) {
        if (shares == 0 || poolFunds == 0) {
             return 0;
        }

        return multiplyByFraction(shares, poolFunds, totalPoolShares);
    }

    function tokensToShares(uint256 tokens) private view returns (uint256) {
        if (tokens == 0) {
            return 0;
        } else if (totalPoolShares == 0) {
            return tokens;
        }

        return multiplyByFraction(tokens, totalPoolShares, poolFunds);
    }
}
