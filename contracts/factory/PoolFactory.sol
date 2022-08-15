// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import "../context/SaplingContext.sol";
import "../PoolToken.sol";
import "../SaplingLendingPool.sol";
import "../LoanDesk.sol";
import "../interfaces/IVerificationHub.sol";

contract PoolFactory is SaplingContext {

    address private verificationHub;

    event PoolCreated(address pool);

    constructor(address _verificationHub, address _governance, address _protocol) SaplingContext(_governance, _protocol) {
        verificationHub = _verificationHub;
    }

    function create(string memory name, string memory symbol, address manager, address liquidityToken) external onlyGovernance {
        PoolToken poolToken = new PoolToken(string.concat(name, " Token"), symbol, IERC20Metadata(liquidityToken).decimals());
        SaplingLendingPool pool = new SaplingLendingPool(address(poolToken), liquidityToken, address(this), protocol, manager);

        address poolAddress = address(pool);
        poolToken.transferOwnership(poolAddress);

        LoanDesk loanDesk = new LoanDesk(poolAddress, governance, protocol, manager, pool.ONE_TOKEN());
        pool.setLoanDesk(address(loanDesk));

        pool.transferGovernance(governance);

        IVerificationHub(verificationHub).registerSaplingPool(poolAddress);
        emit PoolCreated(poolAddress);
    }
}
