// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

/**
 * @title Pool Factory Interface
 * @dev Interface defining the inter-contract methods of a lending pool factory.
 */
interface IPoolFactory {

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
        returns (address);
}
