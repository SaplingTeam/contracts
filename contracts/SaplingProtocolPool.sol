// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.15;

import "./context/SaplingPoolContext.sol";
import "./interfaces/IVerificationHub.sol";

/**
 * @title Sapling Protocol Pool
 */
contract SaplingProtocolPool is SaplingPoolContext {

    using SafeMath for uint256;

    /// Investment profile object template
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

    ///  Address of the verification hub
    address private verificationHub;

    /// Investment profile by lending pool address
    mapping (address => Investment) public investments;


    /// Event for when funds are invested into a lending pool
    event NewInvestment(address toPool, uint256 liquidityTokenAmount);

    /// Event for when an investment yield is collected from a lending pool
    event YieldCollected(address fromPool, uint256 liquidityTokenAmount);

    /**
     * @notice Creates a Sapling pool.
     * @param _verificationHub verification hub address
     * @param _poolToken ERC20 token contract address to be used as the pool issued token.
     * @param _liquidityToken ERC20 token contract address to be used as pool liquidity currency.
     * @param _governance Governance address
     * @param _protocol Protocol wallet address
     * @param _manager Manager address
     */
    constructor(address _verificationHub, address _poolToken, address _liquidityToken, address _governance, address _protocol, address _manager) 
        SaplingPoolContext(_poolToken, _liquidityToken, _governance, _protocol, _manager) {
        verificationHub = _verificationHub;
    }

    /**
     * @notice Create new investment or add to an existing investment on a lending pool.
     * @dev Caller must be the manager. Stake to pool ratio must be good, protocol pool must have sufficient liquidity, 
     *      and the lending pool must be registered on the Verification Hub.
     * @param lendingPool Address of a lending pool the investment is being made to
     * @param liquidityTokenAmount Amount of investment in liquidity tokens
     */
    function invest(address lendingPool, uint256 liquidityTokenAmount) external onlyManager whenNotPaused {
         require(isPoolFunctional(), 
            "SaplingProtocolPool: invalid pool state for the operation due to insufficient stake, pause, or closure");
         require(strategyLiquidity() >= liquidityTokenAmount, "SaplingProtocolPool: insufficient liquidity");
         require(IVerificationHub(verificationHub).isSaplingPool(lendingPool), "SaplingProtocolPool: unregistered lending pool");

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

        uint256 prevStrategizedFunds = strategizedFunds;

        poolLiquidity = poolLiquidity.sub(liquidityTokenAmount);
        ILender(lendingPool).deposit(liquidityTokenAmount);
        strategizedFunds = strategizedFunds.add(liquidityTokenAmount);

        uint16 poolPercentDecimals = IMath(lendingPool).PERCENT_DECIMALS();
        uint16 poolLenderAPY = ILender(lendingPool).projectedLenderAPY(uint16(90 * 10**poolPercentDecimals), 30 * 10**poolPercentDecimals);
        uint256 investmentAPR = Math.mulDiv(poolLenderAPY, 10**PERCENT_DECIMALS, 10**poolPercentDecimals);

        weightedAvgStrategyAPR = prevStrategizedFunds.mul(weightedAvgStrategyAPR).add(liquidityTokenAmount.mul(investmentAPR)).div(strategizedFunds);

        emit NewInvestment(lendingPool, liquidityTokenAmount);
    }

    /**
     * @notice Collect investment yield from a lending pool. 
     * @dev Caller must be the manager. Yield balance on the lending pool must be sufficient.
     * @param pool Address of the lending pool to collect from
     * @param amount Amount to collect in liquidity tokens
     */
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

    /**
     * @notice Collect/Withdraw investment principal from a lending pool.
     * @dev Caller must be the manager. Lending pool must have sufficient withdrawable liquidity, which can be checked 
     *      independently.
     * @param pool Address of the lending pool to collect from
     * @param amount Amount to collect in liquidity tokens
     */
    function collectInvestment(address pool, uint256 amount) external onlyManager whenNotPaused {
        Investment storage investment = investments[pool];
        require(investment.pool != address(0), "SaplingProtocolPool: investment profile is not fount");
        require(0 < amount && amount <= investment.outstandingAmount.add(poolYieldBalanceOn(pool)), 
            "SaplingProtocolPool: invalid amount");
    
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

    /**
     * @notice Helper function to check the accumulated yield balance of the protocol pool on a specific lending pool.
     * @return Yield balance of the protocol pool on a lending pool.
     */
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
