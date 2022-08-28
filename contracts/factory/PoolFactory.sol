// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IPoolFactory.sol";
import "../SaplingLendingPool.sol";

/**
 * @title Pool Factory
 * @notice Facilitates on-chain deployment of new SaplingLendingPool contracts.
 */
contract PoolFactory is IPoolFactory, Ownable {

    /// Event for when a new LoanDesk is deployed
    event PoolCreated(address pool);

    /**
     * @notice Deploys a new instance of SaplingLendingPool.
     * @dev Pool token must implement IPoolToken. 
     *      Caller must be the owner.
     * @param poolToken LendingPool address
     * @param liquidityToken Liquidity token address
     * @param governance Governance address
     * @param protocol Protocol wallet address
     * @param manager Manager address
     * @return Address of the deployed contract
     */
    function create(
        address poolToken, 
        address liquidityToken, 
        address governance, 
        address protocol, 
        address manager
    )
        external 
        onlyOwner 
        returns (address)
    {
        SaplingLendingPool pool = new SaplingLendingPool(poolToken, liquidityToken, governance, protocol, manager);
        emit PoolCreated(address(pool));
        return address(pool);
    }
}
