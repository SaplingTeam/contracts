// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.15;

import "./SaplingContext.sol";
import "./PoolToken.sol";
import "./SaplingPool.sol";
import "./LoanDesk.sol";

contract PoolFactory is SaplingContext {

    event PoolCreated(address pool);

    constructor(address _governance, address _protocol) SaplingContext(_governance, _protocol) {
    }

    function create(string memory name, string memory symbol, address manager, address liquidityToken) external onlyGovernance {
        PoolToken poolToken = new PoolToken(string.concat(name, " Token"), symbol, IERC20Metadata(liquidityToken).decimals());
        SaplingPool pool = new SaplingPool(address(poolToken), liquidityToken, address(this), protocol, manager);

        address poolAddress = address(pool);
        poolToken.transferOwnership(poolAddress);

        LoanDesk loanDesk = new LoanDesk(poolAddress, governance, protocol, manager, pool.ONE_TOKEN());
        pool.setLoanDesk(address(loanDesk));

        pool.transferGovernance(governance);

        emit PoolCreated(poolAddress);
    }
}
