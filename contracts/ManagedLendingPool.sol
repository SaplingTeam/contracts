pragma solidity ^0.8.12;

abstract contract ManagedLendingPool {

    address public manager;

    event ManagementTransferred(address toManager);

    modifier onlyManager {
        require(msg.sender == manager, "Managed: caller is not the manager");
        _;
    }

    constructor() {
        manager = msg.sender;
    }

    function transferManagement(address newManager) external onlyManager {
        require(newManager != address(0), "Managed: new manager address is not set");
        manager = newManager;

        emit ManagementTransferred(newManager);
    }
}
