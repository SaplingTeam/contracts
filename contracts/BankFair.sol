pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./Lender.sol";

contract BankFair is Lender {

    using SafeMath for uint256;
    
    constructor(address tokenAddress, address protocol, uint256 minLoanAmount) Lender(tokenAddress, protocol, minLoanAmount) {
        
    }

    function deposit(uint256 amount) external onlyLender {
        enterPool(amount);
    }

    function withdraw(uint256 amount) external onlyLender {
        exitPool(amount);
    }

    function balanceOf(address wallet) public view returns (uint256) {
        return sharesToTokens(poolShares[wallet]);
    }

    function amountDepositable() external view returns (uint256) {
        if (poolFundsLimit <= poolFunds) {
            return 0;
        }

        return poolFundsLimit.sub(poolFunds);
    }

    function amountWithdrawable() external view returns (uint256) {
        return Math.min(poolLiqudity, balanceOf(msg.sender));
    }

    function borrow(uint256 loanId) external loanInStatus(loanId, LoanStatus.APPROVED) {
        Loan storage loan = loans[loanId];
        require(loan.borrower == msg.sender, "BankFair: ");

        loan.status = LoanStatus.FUNDS_WITHDRAWN;
        decreaseLoanFunds(msg.sender, loan.amount);

        tokenBalance = tokenBalance.sub(loan.amount);
        bool success = IERC20(token).transfer(msg.sender, loan.amount);
        if(!success) {
            revert();
        }
    }

    function stake(uint256 amount) external onlyManager {
        require(amount > 0, "BankFair: stake amount is 0");

        uint256 shares = enterPool(amount);
        sharesStaked = sharesStaked.add(shares);
        updatePoolLimit();
    }
    
    function unstake(uint256 amount) external onlyManager {
        require(amount > 0, "BankFair: unstake amount is 0");
        require(amount <= amountUnstakeable(), "BankFair: requested amount is not available to be unstaked");

        uint256 shares = tokensToShares(amount);
        sharesStaked = sharesStaked.sub(shares);
        updatePoolLimit();
        exitPool(amount);
    }

    function balanceStaked() public view returns (uint256) {
        return balanceOf(manager);
    }

    function amountUnstakeable() public view returns (uint256) {
        (,uint256 unlocked) = sharesStaked.trySub(multiplyByFraction(totalPoolShares, targetStakePercent, ONE_HUNDRED_PERCENT)); 
        return Math.min(poolLiqudity, sharesToTokens(unlocked));
    }
}
