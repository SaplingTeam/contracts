pragma solidity ^0.8.12;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./Lender.sol";

contract BankFair is Lender {

    using SafeMath for uint256;

    uint256 public poolFunds; //poolLiqudity + borrowedFunds
    uint256 public totalPoolShares;
    uint256 public sharesStaked;

    mapping(address => uint256) private poolShares;
    mapping(address => uint256) private poolSharesLocked;

    event UnstakedLoss(uint256 amount);
    event StakedAssetsDepleted();
    
    constructor(address tokenAddress, address protocol, uint256 minLoanAmount) Lender(tokenAddress, protocol, minLoanAmount) {
        poolFunds = 0;
        totalPoolShares = 0;
        sharesStaked = 0;
    }

    function enterPool(uint256 amount) external returns (uint256) {
        require(amount > 0, "BankFair: pool deposit amount is 0");

        uint256 shares = tokensToShares(amount);

        chargeTokensFrom(msg.sender, amount);
        poolLiqudity = poolLiqudity.add(amount);
        poolFunds = poolFunds.add(amount);

        mintShares(msg.sender, shares);

        return shares;
    }

    function exitPool(uint256 shares) external returns (uint256) {
        require(shares > 0, "BankFair: pool withdrawal amount is 0");

        require(poolShares[msg.sender] - poolSharesLocked[msg.sender] >= shares, "BankFair: unlocked shares are not sufficient");

        uint256 tokenAmount = sharesToTokens(shares);
        require(poolLiqudity >= tokenAmount, "BankFair: pool liquidity is too low");
        
        burnShares(msg.sender, shares);

        poolFunds = poolFunds.sub(tokenAmount);
        poolLiqudity = poolLiqudity.sub(tokenAmount);
        giveTokensTo(msg.sender, tokenAmount);

        return tokenAmount;
    }

    function withdrawLoanFunds(uint256 loanId) external loanInStatus(loanId, LoanStatus.APPROVED) {
        Loan storage loan = loans[loanId];
        loan.status = LoanStatus.FUNDS_WITHDRAWN;
        
        decreaseLoanFunds(msg.sender, loan.amount);
        tokenBalance = tokenBalance.sub(loan.amount);
        giveTokensTo(msg.sender, loan.amount);
    }

    function sharesOf(address wallet) external view returns (uint256) {
        return poolShares[wallet];
    }

    function unlockedSharesOf(address wallet) external view returns (uint256) {
        return poolShares[wallet].sub(poolSharesLocked[wallet]);
    }

    function stake(uint256 shares) external onlyManager {
        require(shares > 0, "BankFair: stake amount is 0");

        poolSharesLocked[msg.sender] = poolSharesLocked[msg.sender].add(shares);
        sharesStaked = sharesStaked.add(shares);
    }
    
    function unstake(uint256 shares) external onlyManager {
        require(shares > 0, "BankFair: unstake amount is 0");
        require(shares <= sharesStakedUnlocked(), "BankFair: requested amount is not available to be unstaked");

        poolSharesLocked[msg.sender] = poolSharesLocked[msg.sender].sub(shares);
        sharesStaked = sharesStaked.sub(shares);
    }

    function sharesStakedUnlocked() public view returns (uint256) {
        //staked funds locked up to 1/10 of the currently borrowed amount
        (,uint256 unlocked) = sharesStaked.trySub(tokensToShares(borrowedFunds.div(10))); 
        return unlocked;
    }

    function deductLosses(uint256 lossAmount) internal override {

        poolFunds = poolFunds.sub(lossAmount);

        uint256 lostShares = tokensToShares(lossAmount);
        uint256 remainingLostShares = lostShares;

        if (sharesStaked > 0) {
            uint256 stakedShareLoss = Math.min(lostShares, sharesStaked);
            remainingLostShares = lostShares.sub(stakedShareLoss);
            sharesStaked = sharesStaked.sub(stakedShareLoss);
            poolSharesLocked[manager] = poolSharesLocked[manager].sub(stakedShareLoss);

            burnShares(manager, stakedShareLoss);

            if (sharesStaked == 0) {
                emit StakedAssetsDepleted();
            }
        }

        if (remainingLostShares > 0) {
            emit UnstakedLoss(lossAmount.sub(sharesToTokens(remainingLostShares)));
        }
    }

    function mintShares(address wallet, uint256 shares) private {
        poolShares[wallet] = poolShares[wallet].add(shares);
        totalPoolShares = totalPoolShares.add(shares);
    }

    function burnShares(address wallet, uint256 shares) private {
        poolShares[wallet] = poolShares[wallet].sub(shares);
        totalPoolShares = totalPoolShares.sub(shares);
    }
    
    function sharesToTokens(uint256 shares) public view returns (uint256) {
        if (shares == 0 || poolFunds == 0) {
             return 0;
        }

        return multiplyByFraction(shares, poolFunds, totalPoolShares);
    }

    function tokensToShares(uint256 tokens) public view returns (uint256) {
        if (tokens == 0) {
            return 0;
        } else if (totalPoolShares == 0) {
            return tokens;
        }

        return multiplyByFraction(tokens, totalPoolShares, poolFunds);
    }
}
