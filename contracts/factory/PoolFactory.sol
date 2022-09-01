// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "./FactoryBase.sol";
import "./IPoolFactory.sol";
import "./IPoolLogicFactory.sol";
import "../SaplingLendingPool.sol";


/**
 * @title Pool Factory
 * @notice Facilitates on-chain deployment of new SaplingLendingPool contracts.
 */
contract PoolFactory is IPoolFactory, FactoryBase {

    address logicFactory;

    /// Event for when a new LoanDesk is deployed
    event PoolCreated(address pool);

    constructor(address _logicFactory) {
        require(_logicFactory != address(0), "PoolFactory: invalid pool logic factory address");
        logicFactory = _logicFactory;
    }

    /**
     * @notice Deploys a new instance of SaplingLendingPool.
     * @dev Pool token must implement IPoolToken.
     *      Caller must be the owner.
     * @param poolToken LendingPool address
     * @param liquidityToken Liquidity token address
     * @param governance Governance address
     * @param treasury Treasury wallet address
     * @param manager Manager address
     * @return Addresses of the proxy, proxy admin, and the logic contract
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
        returns (address, address, address)
    {
        address logic = IPoolLogicFactory(logicFactory).create();
        ProxyAdmin admin = new ProxyAdmin();
        bytes memory data = abi.encodeWithSelector(
            bytes4(keccak256("initialize(address,address,address,address,address)")),
            poolToken,
            liquidityToken,
            governance,
            treasury,
            manager
        );

        TransparentUpgradeableProxy proxy = new TransparentUpgradeableProxy(logic, address(admin), data);

        admin.transferOwnership(msg.sender);

        emit PoolCreated(address(proxy));
        return (address(proxy), address(admin), logic);
    }
}
