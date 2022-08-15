// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.15;

import "./context/SaplingPoolContext.sol";
import "./interfaces/IVerificationHub.sol";
import "./interfaces/ILender.sol";

/**
 * @title Sapling Protocol Pool
 */
contract SaplingProtocolPool is SaplingPoolContext {

    using SafeMath for uint256;

    struct Investment {
        address pool;
        uint256 totalAmount;
        uint256 outstandingAmount;
        uint256 baseAmountRecovered;
        uint256 yieldRecovered;
        uint256 createdTime;
        uint256 lastInvestedTime;
        uint256 lastCollectedTime;
    }

    address private verificationHub;

    mapping (address => Investment) public investments;

    event NewInvestment(address toPool, uint256 liquidityTokenAmount);

    event YieldCollected(address fromPool, uint256 liquidityTokenAmount);

    /**
     * @notice Creates a Sapling pool.
     * @param _poolToken ERC20 token contract address to be used as the pool issued token.
     * @param _liquidityToken ERC20 token contract address to be used as main pool liquid currency.
     * @param _governance Address of the protocol governance.
     * @param _protocol Address of a wallet to accumulate protocol earnings.
     * @param _manager Address of the pool manager.
     */
    constructor(address _verificationHub, address _poolToken, address _liquidityToken, address _governance, address _protocol, address _manager) 
        SaplingPoolContext(_poolToken, _liquidityToken, _governance, _protocol, _manager) {
        verificationHub = _verificationHub;
    }

    function invest(address lendingPool, uint256 liquidityTokenAmount) external onlyManager whenNotPaused {
         require(isPoolFunctional());
         require(strategyLiquidity() >= liquidityTokenAmount);
         require(IVerificationHub(verificationHub).isSaplingPool(lendingPool));

        Investment storage investment = investments[lendingPool];
        if(investment.pool == address(0)) {
            investments[lendingPool] = Investment({
            pool: lendingPool,
            totalAmount: liquidityTokenAmount,
            outstandingAmount: liquidityTokenAmount,
            baseAmountRecovered: 0,
            yieldRecovered: 0,
            createdTime: block.timestamp,
            lastInvestedTime: block.timestamp,
            lastCollectedTime: block.timestamp
         });
        } else {
            investment.totalAmount = investment.totalAmount.add(liquidityTokenAmount);
            investment.outstandingAmount = investment.outstandingAmount.add(liquidityTokenAmount);
            investment.lastInvestedTime = block.timestamp;
        }

        poolLiquidity = poolLiquidity.sub(liquidityTokenAmount);
        ILender(lendingPool).deposit(liquidityTokenAmount);
        strategizedFunds = strategizedFunds.add(liquidityTokenAmount);

        emit NewInvestment(lendingPool, liquidityTokenAmount);
    }

    function collectYield(address pool, uint256 amount) external onlyManager whenNotPaused {
        require(poolYieldBalanceOn(pool) >= amount);

        Investment storage investment = investments[pool];
    
        /* 
         External pool liquidity check is not necessary here as withdraw() call will fail on insufficient liquidity,
         and the pool liquidity can be verified independently.
        */

        ILender(pool).withdraw(amount);
        poolLiquidity = poolLiquidity.add(amount);
        strategizedFunds = strategizedFunds.sub(amount);

        investment.outstandingAmount = investment.outstandingAmount.sub(amount);
        investment.yieldRecovered = investment.yieldRecovered.add(amount);
        investment.lastCollectedTime = block.timestamp;

        emit YieldCollected(pool, amount);
    }

    function collectInvestment(address pool, uint256 amount) external onlyManager whenNotPaused {
        Investment storage investment = investments[pool];
        require(investment.pool != address(0));
        require(0 < amount && amount <= investment.outstandingAmount.add(poolYieldBalanceOn(pool)));
    
        /* 
         External pool liquidity and balance checks are not necessary here as withdraw() call will fail on insufficient liquidity or balance,
         and the pool liquidity and balance can be verified independently.
        */

        ILender(pool).withdraw(amount);
        poolLiquidity = poolLiquidity.add(amount);
        strategizedFunds = strategizedFunds.sub(amount);

        if (amount > investment.outstandingAmount) {
            investment.yieldRecovered = investment.yieldRecovered.add(amount.sub(investment.outstandingAmount));
            investment.baseAmountRecovered = investment.baseAmountRecovered.add(investment.outstandingAmount);
            investment.outstandingAmount = 0;
        } else {
            investment.baseAmountRecovered = investment.baseAmountRecovered.add(amount);
            investment.outstandingAmount = investment.outstandingAmount.sub(amount);
        }

        investment.lastCollectedTime = block.timestamp;

        emit YieldCollected(pool, amount);
    }

    function poolYieldBalanceOn(address pool) public view returns (uint256) {
        Investment storage investment = investments[pool];
        if(investment.pool == address(0)) {
            return 0;
        }

        uint256 balance = ILender(pool).balanceOf(address(this));
        
        if (balance <= investment.outstandingAmount) {
            return 0;
        }

        return balance.sub(investment.outstandingAmount);
    }
}
