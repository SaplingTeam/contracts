const { ethers, upgrades } = require('hardhat');
const { POOL_1_LENDER_GOVERNANCE_ROLE, DEFAULT_ADMIN_ROLE, GOVERNANCE_ROLE, PAUSER_ROLE } = require('./roles');
const { TOKEN_DECIMALS } = require('./constants');

async function deployEnv() {
    [deployer, governance, treasury, pauser, lenderGovernance, staker, ...addresses] = await ethers.getSigners();

    const assetToken = await (await ethers.getContractFactory('PoolToken'))
        .connect(deployer)
        .deploy('Test USDC', 'TestUSDC', TOKEN_DECIMALS);

    return {
        deployer: deployer,
        governance: governance,
        treasury: treasury,
        pauser: pauser,
        lenderGovernance: lenderGovernance,
        staker: staker,
        users: addresses,
        assetToken: assetToken,
    };
}

async function deployProtocol(environment) {
    const accessControl = await deployAccessControl(environment);
    await initAccessControl(accessControl, environment);

    const poolToken = await deployPoolToken(environment);
    const pool = await deployLendingPool(environment, poolToken, accessControl);
    const loanDesk = await deployLoanDesk(environment, pool, accessControl);

    await poolToken.connect(environment.deployer).transferOwnership(pool.address);
    await pool.connect(environment.governance).setLoanDesk(loanDesk.address);

    return {
        environment: environment,
        accessControl: accessControl,
        pool: pool,
        poolToken: poolToken,
        loanDesk: loanDesk,
    };
}

async function deployAccessControl(environment) {
    return await (await ethers.getContractFactory('CoreAccessControl')).connect(environment.deployer).deploy();
}

async function initAccessControl(coreAccessControl, environment) {
    await coreAccessControl.connect(environment.deployer).grantRole(DEFAULT_ADMIN_ROLE, environment.governance.address);
    await coreAccessControl
        .connect(environment.deployer)
        .renounceRole(DEFAULT_ADMIN_ROLE, environment.deployer.address);
    await coreAccessControl.connect(environment.governance).grantRole(GOVERNANCE_ROLE, environment.governance.address);
    await coreAccessControl.connect(environment.governance).grantRole(PAUSER_ROLE, environment.governance.address);
    await coreAccessControl.connect(environment.governance).grantRole(PAUSER_ROLE, environment.pauser.address);
    await coreAccessControl
        .connect(environment.governance)
        .grantRole(POOL_1_LENDER_GOVERNANCE_ROLE, environment.lenderGovernance.address);
}

async function deployPoolToken(environment) {
    return await (await ethers.getContractFactory('PoolToken'))
        .connect(environment.deployer)
        .deploy('Sapling Test Lending Pool Token', 'SLPT', TOKEN_DECIMALS);
}

async function deployLendingPool(environment, poolTokenContract, accessControlContract) {
    const lendingPool = await upgrades.deployProxy(await ethers.getContractFactory('SaplingLendingPool'), [
        poolTokenContract.address,
        environment.assetToken.address,
        accessControlContract.address,
        environment.treasury.address,
        environment.staker.address,
    ]);

    await lendingPool.deployed();

    return lendingPool;
}

async function deployLoanDesk(environment, poolContract, accessControlContract) {
    const loanDesk = await upgrades.deployProxy(await ethers.getContractFactory('LoanDesk'), [
        poolContract.address,
        environment.assetToken.address,
        accessControlContract.address,
        environment.staker.address,
        POOL_1_LENDER_GOVERNANCE_ROLE,
    ]);
    await loanDesk.deployed();

    return loanDesk;
}

module.exports = {
    deployEnv,
    deployAccessControl,
    deployPoolToken,
    deployLendingPool,
    deployLoanDesk,
    deployProtocol,
};
