// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../context/SaplingContext.sol";
import "../interfaces/ILoanDeskOwner.sol";
import "../interfaces/IVerificationHub.sol";
import "./ITokenFactory.sol";
import "./ILoanDeskFactory.sol";
import "./IPoolFactory.sol";
import "./IOwnable.sol";


/**
 * @title Sapling Factory
 * @notice Facilitates on-chain deployment and setup of protocol components.
 */
contract SaplingFactory is SaplingContext { //Make Ownable

    /// Verification hub contract address
    address public verificationHub; //FIXME remove

    /// Token factory contract address
    address public tokenFactory;

    /// LoanDesk factory contract address
    address public loanDeskFactory;

    /// Lending pool factory contract address
    address public poolFactory;

    /// Event for when a Lending pool and it's components are deployed, linked and ready for use.
    event LendingPoolReady(address pool);

    /**
     * @notice Create a new SaplingFactory.
     * @dev Addresses must not be 0.
     * @param _tokenFactory Toke factory address
     * @param _loanDeskFactory LoanDesk factory address
     * @param _poolFactory Lending Pool factory address address
     * @param _verificationHub Verification hub address
     * @param _governance Governance address
     * @param _treasury Treasury wallet address
     */
    constructor(
        address _tokenFactory,
        address _loanDeskFactory,
        address _poolFactory,
        address _verificationHub,
        address _governance,
        address _treasury)
    SaplingContext(_governance, _treasury)
    {
        require(_tokenFactory != address(0), "SaplingFactory: invalid token factory address");
        require(_loanDeskFactory != address(0), "SaplingFactory: invalid LoanDesk factory address");
        require(_poolFactory != address(0), "SaplingFactory: invalid pool factory address");
        require(_verificationHub != address(0), "SaplingFactory: invalid verification hub address");

        tokenFactory = _tokenFactory;
        loanDeskFactory = _loanDeskFactory;
        poolFactory = _poolFactory;
        verificationHub = _verificationHub;
    }

    /**
     * @notice Deploys a lending pool and it's components
     * @dev Caller must be the governance.
     * @param name Token name
     * @param symbol Token symbol
     * @param manager Manager address
     * @param liquidityToken Liquidity token address
     */
    function createLendingPool(
        string memory name,
        string memory symbol,
        address manager,
        address liquidityToken
    )
        external
        onlyGovernance
        whenNotPaused
    {
        uint8 decimals = IERC20Metadata(liquidityToken).decimals();
        address poolToken = ITokenFactory(tokenFactory).create(string.concat(name, " Token"), symbol, decimals);
        address pool = IPoolFactory(poolFactory)
            .create(poolToken, liquidityToken, address(this), treasury, manager);

        address loanDesk = ILoanDeskFactory(loanDeskFactory)
            .create(pool, governance, treasury, manager, decimals);

        IOwnable(poolToken).transferOwnership(pool);
        ILoanDeskOwner(pool).setLoanDesk(loanDesk);
        SaplingContext(pool).transferGovernance(governance);

        IVerificationHub(verificationHub).registerSaplingPool(pool);

        emit LendingPoolReady(pool);
    }

    //FIXME add self destruct
}
