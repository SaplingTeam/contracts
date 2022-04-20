pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./Lender.sol";

contract BankFair is Lender {

    using SafeMath for uint256;

    modifier validLender(address wallet) {
        require(wallet != address(0), "BankFair: Address is not prsent.");
        require(wallet != manager && wallet != protocolWallet, "BankFair: Wallet is a manager or protocol.");
        //FIXME: currently borrower is a wallet that has any past or present loans/application,
        //TODO wallet is a borrower if: has open loan or loan application. Implement basic loan history first.
        require(recentLoanIdOf[wallet] == 0, "BankFair: Wallet is a borrower."); 
        _;
    }
    
    constructor(address tokenAddress, address protocol, uint256 minLoanAmount) Lender(tokenAddress, protocol, minLoanAmount) {
        poolFunds = 0;
    }

    function deposit(uint256 amount) external validLender(msg.sender) {
        enterPool(amount);
    }

    function withdraw(uint256 amount) external validLender(msg.sender) {
        exitPool(amount);
    }

    function balanceOf(address wallet) external view returns (uint256) {
        return sharesToTokens(poolShares[wallet]);
    }

    function withdrawLoanFunds(uint256 loanId) external loanInStatus(loanId, LoanStatus.APPROVED) {
        Loan storage loan = loans[loanId];
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
    }
    
    function unstake(uint256 amount) external onlyManager {
        require(amount > 0, "BankFair: unstake amount is 0");
        require(amount <= balanceStakedUnlocked(), "BankFair: requested amount is not available to be unstaked");

        uint256 shares = tokensToShares(amount);
        sharesStaked = sharesStaked.sub(shares);
        exitPool(amount);
    }

    function balanceStakedUnlocked() public view returns (uint256) {
        //staked funds locked up to 1/10 of the currently borrowed amount
        (,uint256 unlocked) = sharesStaked.trySub(tokensToShares(multiplyByFraction(totalPoolShares, targetStakePercent, ONE_HUNDRED_PERCENT))); 
        return sharesToTokens(unlocked);
    }
}
