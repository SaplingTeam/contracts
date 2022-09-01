// SPDX-License-Identifier: MIT
pragma solidity ^0.8.15;

import "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import "./FactoryBase.sol";
import "./ILoanDeskFactory.sol";
import "../LoanDesk.sol";

// import "hardhat/console.sol";


/**
 * @title LoanDesk Factory
 * @notice Facilitates on-chain deployment of new LoanDesk contracts.
 */
contract LoanDeskFactory is ILoanDeskFactory, FactoryBase {

    /// Event for when a new LoanDesk is deployed
    event LoanDeskCreated(address pool);

    /**
     * @notice Deploys a new instance of LoanDesk.
     * @dev Lending pool contract must implement ILoanDeskOwner.
     *      Caller must be the owner.
     * @param pool LendingPool address
     * @param governance Governance address
     * @param treasury Treasury wallet address
     * @param manager Manager address
     * @param decimals Decimals of the tokens used in the pool
     * @return Addresses of the proxy, proxy admin, and the logic contract
     */
    function create(
        address pool,
        address governance,
        address treasury,
        address manager,
        uint8 decimals
    )
        external
        onlyOwner
        returns (address, address, address)
    {
        LoanDesk logic = new LoanDesk();
        ProxyAdmin admin = new ProxyAdmin();
        bytes memory data = abi.encodeWithSelector(
            bytes4(keccak256("initialize(address,address,address,address,uint8)")),
            pool,
            governance,
            treasury,
            manager,
            decimals
        );

        TransparentUpgradeableProxy proxy = new TransparentUpgradeableProxy(address(logic), address(admin), data);

        //TODO remove
        // console.log("LoanDeskFactory address", address(this));
        // console.log("ProxyAdmin owner: ", admin.owner());
        // console.log("ProxyAdmin address: ", address(admin));
        // console.log("ProxyAdmin getProxyAdmin: ", admin.getProxyAdmin(proxy));
        // console.log("TransparentUpgradeableProxy admin: ", proxy.admin());

        admin.transferOwnership(msg.sender);

        emit LoanDeskCreated(address(proxy));
        return (address(proxy), address(admin), address(logic));
    }
}
