// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "../context/SaplingContext.sol";
import "../interfaces/ILoanDeskOwner.sol";
import "../interfaces/IVerificationHub.sol";
import "./ITokenFactory.sol";
import "./ILoanDeskFactory.sol";
import "./IPoolFactory.sol";
import "./IOwnable.sol";

contract SaplingFactory is SaplingContext {

    address public verificationHub;
    address public tokenFactory;
    address public loanDeskFactory;
    address public poolFactory;

    event PoolCreated(address pool);

    constructor(
        address _tokenFactory, 
        address _loanDeskFactory, 
        address _poolFactory,
        address _verificationHub, 
        address _governance, 
        address _protocol) 
    SaplingContext(_governance, _protocol) 
    {
        tokenFactory = _tokenFactory;
        loanDeskFactory = _loanDeskFactory;
        poolFactory = _poolFactory;
        verificationHub = _verificationHub;
    }

    function createLendingPool(string memory name, string memory symbol, address manager, address liquidityToken) external onlyGovernance whenNotPaused {
        uint8 decimals = IERC20Metadata(liquidityToken).decimals();
        address poolToken = ITokenFactory(tokenFactory).create(string.concat(name, " Token"), symbol, decimals);
        address pool = IPoolFactory(poolFactory).create(poolToken, liquidityToken, address(this), protocol, manager);

        address loanDesk = ILoanDeskFactory(loanDeskFactory).create(pool, governance, protocol, manager, decimals);

        IOwnable(poolToken).transferOwnership(pool);
        ILoanDeskOwner(pool).setLoanDesk(loanDesk);
        SaplingContext(pool).transferGovernance(governance);
        
        IVerificationHub(verificationHub).registerSaplingPool(pool);

        emit PoolCreated(pool);
    }
}
