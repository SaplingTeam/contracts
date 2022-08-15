// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.8.15;

import "./context/SaplingPoolContext.sol";

/**
 * @title Sapling Protocol Pool
 */
contract SaplingProtocolPool is SaplingPoolContext {

    using SafeMath for uint256;

    /**
     * @notice Creates a Sapling pool.
     * @param _poolToken ERC20 token contract address to be used as the pool issued token.
     * @param _liquidityToken ERC20 token contract address to be used as main pool liquid currency.
     * @param _governance Address of the protocol governance.
     * @param _protocol Address of a wallet to accumulate protocol earnings.
     * @param _manager Address of the pool manager.
     */
    constructor(address _poolToken, address _liquidityToken, address _governance, address _protocol, address _manager) 
        SaplingPoolContext(_poolToken, _liquidityToken, _governance, _protocol, _manager) {
    }

    function invest(address lendingPool, uint256 liquidityTokenAmount) external onlyManager whenNotPaused {
        /*
         * TODO 
          1. Verify pool liquidity 
          2. Verify that the lending pool is on the supported list (on contract or via verification hub)
          3. Call deposit() on the lending pool.
          4. Update state variables
         */
    }

    /**
     * @notice Check if the pool can lend based on the current stake levels.
     * @return True if the staked funds provide at least a minimum ratio to the pool funds, False otherwise.
     */
    function poolCanLend() public view returns (bool) {
        return !(paused() || closed()) && stakedShares >= Math.mulDiv(totalPoolShares, targetStakePercent, ONE_HUNDRED_PERCENT);
    }
}
