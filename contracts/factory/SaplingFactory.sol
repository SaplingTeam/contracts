// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../interfaces/ILoanDeskOwner.sol";
import "../interfaces/IVerificationHub.sol";
import "../interfaces/ISaplingContext.sol";
import "../interfaces/ISecurity.sol";
import "./FactoryBase.sol";
import "./IProxyFactory.sol";
import "./ITokenFactory.sol";
import "./ILogicFactory.sol";

/**
 * @title Sapling Factory
 * @notice Facilitates on-chain deployment and setup of protocol components.
 */
contract SaplingFactory is FactoryBase {

    /// Proxy factory contract address
    address public proxyFactory;

    /// Token factory contract address
    address public tokenFactory;

    /// LoanDesk factory contract address
    address public loanDeskFactory;

    /// Lending pool factory contract address
    address public poolFactory;

    /// Event for when a Lending pool and its components are deployed, linked and ready for use.
    event LendingPoolReady(address pool);

    /**
     * @notice Create a new SaplingFactory.
     * @dev Addresses must not be 0.
     * @param _proxyFactory Proxy factory address
     * @param _tokenFactory Token factory address
     * @param _loanDeskFactory LoanDesk factory address
     * @param _poolFactory Lending Pool factory address address
     */
    constructor(
        address _proxyFactory,
        address _tokenFactory,
        address _loanDeskFactory,
        address _poolFactory
    ) {
        require(_proxyFactory != address(0), "SaplingFactory: invalid proxy factory address");
        require(_tokenFactory != address(0), "SaplingFactory: invalid token factory address");
        require(_loanDeskFactory != address(0), "SaplingFactory: invalid LoanDesk factory address");
        require(_poolFactory != address(0), "SaplingFactory: invalid pool factory address");

        proxyFactory = _proxyFactory;
        tokenFactory = _tokenFactory;
        loanDeskFactory = _loanDeskFactory;
        poolFactory = _poolFactory;
    }

    /**
     * @notice Deploys a lending pool and its components
     * @dev Caller must be the governance.
     * @param name Token name
     * @param symbol Token symbol
     * @param liquidityToken Liquidity token address
     * @param governance Governance address
     * @param treasury Treasury wallet address
     * @param manager Manager address
     */
    function createLendingPool(
        string memory name,
        string memory symbol,
        address liquidityToken,
        address governance,
        address treasury,
        address manager
    ) external onlyOwner {
        uint8 decimals = IERC20Metadata(liquidityToken).decimals();

        //deploy pool token
        address poolToken = ITokenFactory(tokenFactory).create(string.concat(name, " Token"), symbol, decimals);

        // deploy lending pool
        address lendingPoolLogic = ILogicFactory(poolFactory).create();
        bytes memory poolInitData = abi.encodeWithSelector(
            bytes4(keccak256("initialize(address,address,address,address,address)")),
            poolToken,
            liquidityToken,
            address(this),
            treasury,
            manager
        );

        (address poolProxy, address poolAdmin) = IProxyFactory(proxyFactory).create(lendingPoolLogic, poolInitData);

        //deploy loan desk
        address loanDeskLogic = ILogicFactory(loanDeskFactory).create();
        bytes memory loanDeskInitData = abi.encodeWithSelector(
            bytes4(keccak256("initialize(address,address,address,address,uint8)")),
            poolProxy,
            address(this),
            treasury,
            manager,
            decimals
        );

        (address loanDeskProxy, address loanDeskAdmin) = IProxyFactory(proxyFactory)
            .create(loanDeskLogic, loanDeskInitData);

        // configure access control
        Ownable(poolToken).transferOwnership(poolProxy);

        ProxyAdmin(loanDeskAdmin).transferOwnership(owner());
        ProxyAdmin(poolAdmin).transferOwnership(owner());

        ISecurity(loanDeskProxy).disableIntitializers();
        ISaplingContext(loanDeskProxy).transferGovernance(governance);

        ISecurity(poolProxy).disableIntitializers();
        ILoanDeskOwner(poolProxy).setLoanDesk(loanDeskProxy);
        ISaplingContext(poolProxy).transferGovernance(governance);

        emit LendingPoolReady(poolProxy);
    }

    /**
     * @dev Overrides a pre-shutdown hoot in Factory Base
     */
    function preShutdown() internal override onlyOwner {
        FactoryBase(proxyFactory).shutdown();
        FactoryBase(tokenFactory).shutdown();
        FactoryBase(loanDeskFactory).shutdown();
        FactoryBase(poolFactory).shutdown();
    }
}
