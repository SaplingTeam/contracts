const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const { NULL_ADDRESS, TOKEN_DECIMALS } = require('./utils/constants');
const { GOVERNANCE_ROLE } = require('./utils/roles');
const { snapshot, rollback } = require('./utils/evmControl');
const { deployEnv, deployProtocol } = require('./utils/deployer');

let evmSnapshotIds = [];

describe('Sapling Context (via SaplingLendingPool)', function () {
    let e; // initialized environment metadata
    let p; // deployed protocol metadata

    beforeEach(async function () {
        await snapshot(evmSnapshotIds);
    });

    afterEach(async function () {
        await rollback(evmSnapshotIds);
    });

    before(async function () {
        e = await deployEnv();
        p = await deployProtocol(e);
    });

    describe('Deployment', function () {
        it('Can deploy', async function () {
            let poolToken2 = await (
                await ethers.getContractFactory('PoolToken')
            ).deploy('Sapling Test Lending Pool Token', 'SLPT', TOKEN_DECIMALS);

            await expect(
                upgrades.deployProxy(await ethers.getContractFactory('SaplingLendingPool'), [
                    poolToken2.address,
                    e.assetToken.address,
                    p.accessControl.address,
                    e.treasury.address,
                    e.staker.address,
                ]),
            ).to.be.not.reverted;
        });

        describe('Rejection Scenarios', function () {
            it('Deploying with null access control address should fail', async function () {
                await expect(
                    upgrades.deployProxy(await ethers.getContractFactory('SaplingLendingPool'), [
                        p.poolToken.address,
                        e.assetToken.address,
                        NULL_ADDRESS,
                        e.treasury.address,
                        e.staker.address,
                    ]),
                ).to.be.reverted;
            });
        });
    });

    describe('Use Cases', function () {
        describe('Initial State', function () {
            it('Governance address is correct', async function () {
                expect(await p.accessControl.getRoleMember(GOVERNANCE_ROLE, 0)).to.equal(e.governance.address);
            });

            it('Protocol wallet address is correct', async function () {
                expect(await p.pool.treasury()).to.equal(e.treasury.address);
            });

            it('Context is not paused', async function () {
                expect(await p.pool.paused()).to.equal(false);
            });
        });

        describe('Pause', function () {
            it('Governance can pause', async function () {
                await p.pool.connect(e.governance).pause();
                expect(await p.pool.paused()).to.equal(true);
            });

            describe('Rejection scenarios', function () {
                it('Pausing when paused should fail', async function () {
                    await p.pool.connect(e.governance).pause();
                    await expect(p.pool.connect(e.governance).pause()).to.be.reverted;
                });

                it('Pausing as a non governance should fail', async function () {
                    await expect(p.pool.connect(e.users[0]).pause()).to.be.reverted;
                });
            });
        });

        describe('Resume', function () {
            beforeEach(async function () {
                await p.pool.connect(e.governance).pause();
            });

            it('Governance can resume', async function () {
                await p.pool.connect(e.governance).unpause();
                expect(await p.pool.paused()).to.equal(false);
            });

            describe('Rejection scenarios', function () {
                it('Resuming when not paused should fail', async function () {
                    await p.pool.connect(e.governance).unpause();
                    await expect(p.pool.connect(e.governance).unpause()).to.be.reverted;
                });

                it('Resuming as a non governance should fail', async function () {
                    await expect(p.pool.connect(e.users[0]).unpause()).to.be.reverted;
                });
            });
        });
    });
});
