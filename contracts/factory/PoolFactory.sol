// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "./FactoryBase.sol";
import "./IPoolFactory.sol";
import "../SaplingLendingPool.sol";


/**
 * @title Pool Factory
 * @notice Facilitates on-chain deployment of new SaplingLendingPool contracts.
 */
contract PoolFactory is IPoolFactory, FactoryBase {

    /// Event for when a new LoanDesk is deployed
    event PoolCreated(address pool);

    /**
     * @notice Deploys a new instance of SaplingLendingPool.
     * @dev Pool token must implement IPoolToken.
     *      Caller must be the owner.
     * @param poolToken LendingPool address
     * @param liquidityToken Liquidity token address
     * @param governance Governance address
     * @param treasury Treasury wallet address
     * @param manager Manager address
     * @return Address of the deployed contract
     */
    function create(
        address poolToken,
        address liquidityToken,
        address governance,
        address treasury,
        address manager
    )
        external
        onlyOwner
        returns (address)
    {
        //FIXME deploy upgradable contract, give upgrader role to governance
        // SaplingLendingPool pool = new SaplingLendingPool(poolToken, liquidityToken, governance, treasury, manager);
        // emit PoolCreated(address(pool));
        // return address(pool);
        return address(0);
    }
}
