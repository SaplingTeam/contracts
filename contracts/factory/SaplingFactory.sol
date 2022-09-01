// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../interfaces/ILoanDeskOwner.sol";
import "../interfaces/IVerificationHub.sol";
import "../interfaces/ISaplingContext.sol";
import "./FactoryBase.sol";
import "./ITokenFactory.sol";
import "./ILoanDeskFactory.sol";
import "./IPoolFactory.sol";

/**
 * @title Sapling Factory
 * @notice Facilitates on-chain deployment and setup of protocol components.
 */
contract SaplingFactory is FactoryBase {
    /// Token factory contract address
    address public tokenFactory;

    /// LoanDesk factory contract address
    address public loanDeskFactory;

    /// Lending pool factory contract address
    address public poolFactory;

    /// Event for when a Lending pool and it"s components are deployed, linked and ready for use.
    event LendingPoolReady(address pool);

    /**
     * @notice Create a new SaplingFactory.
     * @dev Addresses must not be 0.
     * @param _tokenFactory Toke factory address
     * @param _loanDeskFactory LoanDesk factory address
     * @param _poolFactory Lending Pool factory address address
     */
    constructor(
        address _tokenFactory,
        address _loanDeskFactory,
        address _poolFactory
    ) {
        require(_tokenFactory != address(0), "SaplingFactory: invalid token factory address");
        require(_loanDeskFactory != address(0), "SaplingFactory: invalid LoanDesk factory address");
        require(_poolFactory != address(0), "SaplingFactory: invalid pool factory address");

        tokenFactory = _tokenFactory;
        loanDeskFactory = _loanDeskFactory;
        poolFactory = _poolFactory;
    }

    /**
     * @notice Deploys a lending pool and it"s components
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
        address poolToken = ITokenFactory(tokenFactory).create(string.concat(name, " Token"), symbol, decimals);
        address pool = IPoolFactory(poolFactory).create(poolToken, liquidityToken, address(this), treasury, manager);

        address loanDesk = ILoanDeskFactory(loanDeskFactory).create(pool, governance, treasury, manager, decimals);

        Ownable(poolToken).transferOwnership(pool);
        ILoanDeskOwner(pool).setLoanDesk(loanDesk);
        ISaplingContext(pool).transferGovernance(governance);

        emit LendingPoolReady(pool);
    }

    /**
     * @dev Overrides a pre-shutdown hoot in Factory Base
     */
    function preShutdown() internal override onlyOwner {
        FactoryBase(tokenFactory).shutdown();
        FactoryBase(loanDeskFactory).shutdown();
        FactoryBase(poolFactory).shutdown();
    }
}
