const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { ethers, upgrades } = require('hardhat');
const { assertHardhatInvariant } = require('hardhat/internal/core/errors');

let evmSnapshotIds = [];

async function snapshot() {
    let id = await hre.network.provider.send('evm_snapshot');
    evmSnapshotIds.push(id);
}

async function rollback() {
    let id = evmSnapshotIds.pop();
    await hre.network.provider.send('evm_revert', [id]);
}

describe('Sapling Context (via SaplingLendingPool)', function () {
    const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
    const TOKEN_DECIMALS = 6;

    const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
    const GOVERNANCE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("GOVERNANCE_ROLE"));
    const TREASURY_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("TREASURY_ROLE"));
    const PAUSER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("PAUSER_ROLE"));
    const POOL_1_MANAGER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("POOL_1_MANAGER_ROLE"));
    const POOL_1_LENDER_GOVERNANCE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("POOL_1_LENDER_GOVERNANCE_ROLE"));

    let coreAccessControl;

    let SaplingContextCF;
    let saplingContext;
    let liquidityToken;
    let poolToken;
    let loanDesk;

    let deployer;
    let governance;
    let lenderGovernance;
    let protocol;
    let manager;
    let addresses;

    beforeEach(async function () {
        await snapshot();
    });

    afterEach(async function () {
        await rollback();
    });

    before(async function () {
        [deployer, governance, lenderGovernance, protocol, manager, ...addresses] = await ethers.getSigners();

        let CoreAccessControlCF = await ethers.getContractFactory('CoreAccessControl');
        coreAccessControl = await CoreAccessControlCF.deploy();

        await coreAccessControl.connect(deployer).grantRole(DEFAULT_ADMIN_ROLE, governance.address);
        await coreAccessControl.connect(deployer).renounceRole(DEFAULT_ADMIN_ROLE, deployer.address);

        await coreAccessControl.connect(governance).grantRole(GOVERNANCE_ROLE, governance.address);
        await coreAccessControl.connect(governance).grantRole(TREASURY_ROLE, protocol.address);
        await coreAccessControl.connect(governance).grantRole(PAUSER_ROLE, governance.address);

        await coreAccessControl.connect(governance).grantRole(POOL_1_MANAGER_ROLE, manager.address);
        await coreAccessControl.connect(governance).grantRole(POOL_1_LENDER_GOVERNANCE_ROLE, lenderGovernance.address);

        let SaplingLendingPoolCF = await ethers.getContractFactory('SaplingLendingPool');
        let PoolTokenCF = await ethers.getContractFactory('PoolToken');
        let LoanDeskCF = await ethers.getContractFactory('LoanDesk');

        liquidityToken = await PoolTokenCF.deploy('Test USDC', 'TestUSDC', TOKEN_DECIMALS);

        poolToken = await PoolTokenCF.deploy('Sapling Test Lending Pool Token', 'SLPT', TOKEN_DECIMALS);

        lendingPool = await upgrades.deployProxy(SaplingLendingPoolCF, [
            poolToken.address,
            liquidityToken.address,
            coreAccessControl.address,
            POOL_1_MANAGER_ROLE
        ]);
        await lendingPool.deployed();

        loanDesk = await upgrades.deployProxy(LoanDeskCF, [
            lendingPool.address,
            coreAccessControl.address,
            POOL_1_MANAGER_ROLE,
            POOL_1_LENDER_GOVERNANCE_ROLE,
            TOKEN_DECIMALS,
        ]);
        await loanDesk.deployed();

        await poolToken.connect(deployer).transferOwnership(lendingPool.address);
        await lendingPool.connect(governance).setLoanDesk(loanDesk.address);

        SaplingContextCF = SaplingLendingPoolCF;
        saplingContext = lendingPool;
    });

    describe('Deployment', function () {
        it('Can deploy', async function () {

            await expect(
                upgrades.deployProxy(SaplingContextCF, [
                    poolToken.address,
                    liquidityToken.address,
                    coreAccessControl.address,
                    POOL_1_MANAGER_ROLE
                ]),
            ).to.be.not.reverted;
        });

        describe('Rejection Scenarios', function () {
            it('Deploying with null access control address should fail', async function () {
                await expect(
                    upgrades.deployProxy(SaplingContextCF, [
                        poolToken.address,
                        liquidityToken.address,
                        NULL_ADDRESS,
                        POOL_1_MANAGER_ROLE
                    ]),
                ).to.be.reverted;
            });
        });
    });

    describe('Use Cases', function () {
        describe('Initial State', function () {
            it('Governance address is correct', async function () {
                expect(await coreAccessControl.getRoleMember(GOVERNANCE_ROLE, 0)).to.equal(governance.address);
            });

            it('Protocol wallet address is correct', async function () {
                expect(await coreAccessControl.getRoleMember(TREASURY_ROLE, 0)).to.equal(protocol.address);
            });

            it('Context is not paused', async function () {
                expect(await saplingContext.paused()).to.equal(false);
            });
        });

        describe('Pause', function () {
            it('Governance can pause', async function () {
                await saplingContext.connect(governance).pause();
                expect(await saplingContext.paused()).to.equal(true);
            });

            describe('Rejection scenarios', function () {
                it('Pausing when paused should fail', async function () {
                    await saplingContext.connect(governance).pause();
                    await expect(saplingContext.connect(governance).pause()).to.be.reverted;
                });

                it('Pausing as a non governance should fail', async function () {
                    await expect(saplingContext.connect(addresses[0]).pause()).to.be.reverted;
                });
            });
        });

        describe('Resume', function () {
            beforeEach(async function () {
                await saplingContext.connect(governance).pause();
            });

            it('Governance can resume', async function () {
                await saplingContext.connect(governance).unpause();
                expect(await saplingContext.paused()).to.equal(false);
            });

            describe('Rejection scenarios', function () {
                it('Resuming when not paused should fail', async function () {
                    await saplingContext.connect(governance).unpause();
                    await expect(saplingContext.connect(governance).unpause()).to.be.reverted;
                });

                it('Resuming as a non governance should fail', async function () {
                    await expect(saplingContext.connect(addresses[0]).unpause()).to.be.reverted;
                });
            });
        });
    });
});
