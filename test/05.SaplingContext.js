const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const { NULL_ADDRESS, TOKEN_DECIMALS } = require('./utils/constants');
const { GOVERNANCE_ROLE } = require('./utils/roles');
const { snapshot, rollback } = require('./utils/evmControl');
const { deployEnv, deployProtocol } = require("./utils/deployer");

let evmSnapshotIds = [];

describe('Sapling Context (via SaplingLendingPool)', function () {
    let coreAccessControl;

    let saplingContext;
    let liquidityToken;
    let poolToken;
    let loanDesk;

    let deployer;
    let governance;
    let lenderGovernance;
    let protocol;
    let staker;
    let addresses;

    beforeEach(async function () {
        await snapshot(evmSnapshotIds);
    });

    afterEach(async function () {
        await rollback(evmSnapshotIds);
    });

    before(async function () {
        const e = await deployEnv();
        const p = await deployProtocol(e);

        deployer = e.deployer;
        governance = e.governance;
        protocol = e.treasury;
        lenderGovernance = e.lenderGovernance;
        staker = e.staker;
        addresses = e.users;

        liquidityToken = e.assetToken;

        coreAccessControl = p.coreAccessControl;
        poolToken = p.poolToken;
        lendingPool = p.pool;
        loanDesk = p.loanDesk;

        saplingContext = lendingPool;
    });

    describe('Deployment', function () {
        it('Can deploy', async function () {
            let poolToken2 = await (
                await ethers.getContractFactory('PoolToken')
            ).deploy('Sapling Test Lending Pool Token', 'SLPT', TOKEN_DECIMALS);

            await expect(
                upgrades.deployProxy(await ethers.getContractFactory('SaplingLendingPool'), [
                    poolToken2.address,
                    liquidityToken.address,
                    coreAccessControl.address,
                    protocol.address,
                    staker.address,
                ]),
            ).to.be.not.reverted;
        });

        describe('Rejection Scenarios', function () {
            it('Deploying with null access control address should fail', async function () {
                await expect(
                    upgrades.deployProxy(await ethers.getContractFactory('SaplingLendingPool'), [
                        poolToken.address,
                        liquidityToken.address,
                        NULL_ADDRESS,
                        protocol.address,
                        staker.address,
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
                expect(await saplingContext.treasury()).to.equal(protocol.address);
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
