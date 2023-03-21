const { ethers } = require("hardhat");


const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
const GOVERNANCE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("GOVERNANCE_ROLE"));
const PAUSER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("PAUSER_ROLE"));
const POOL_1_LENDER_GOVERNANCE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("POOL_1_LENDER_GOVERNANCE_ROLE"));


async function initAccessControl(coreAccessControl, deployer, governance, lenderGovernanceAddress) {
    await coreAccessControl.connect(deployer).grantRole(DEFAULT_ADMIN_ROLE, governance.address);
    await coreAccessControl.connect(deployer).renounceRole(DEFAULT_ADMIN_ROLE, deployer.address);
    await coreAccessControl.connect(governance).grantRole(GOVERNANCE_ROLE, governance.address);
    await coreAccessControl.connect(governance).grantRole(PAUSER_ROLE, governance.address);
    await coreAccessControl.connect(governance).grantRole(POOL_1_LENDER_GOVERNANCE_ROLE, lenderGovernanceAddress);
}


module.exports = {
    DEFAULT_ADMIN_ROLE,
    GOVERNANCE_ROLE,
    PAUSER_ROLE,
    POOL_1_LENDER_GOVERNANCE_ROLE,
    initAccessControl,
};
