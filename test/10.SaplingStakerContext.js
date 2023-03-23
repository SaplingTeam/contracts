const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const { TOKEN_DECIMALS } = require('./utils/constants');
const { mintAndApprove } = require('./utils/helpers');
const { snapshot, rollback } = require('./utils/evmControl');
const { deployEnv, deployProtocol } = require('./utils/deployer');

let evmSnapshotIds = [];

describe('Sapling Staker Context (via SaplingLendingPool)', function () {
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

        await p.loanDesk.connect(e.staker).open();
    });

    describe('Deployment', function () {
        it('Can deploy', async function () {
            await expect(
                upgrades.deployProxy(await ethers.getContractFactory('SaplingLendingPool'), [
                    p.poolToken.address,
                    e.assetToken.address,
                    p.accessControl.address,
                    e.treasury.address,
                    e.staker.address,
                ]),
            ).to.be.not.reverted;
        });
    });

    describe('Initial State', function () {
        it('Staker address is correct', async function () {
            expect(await p.pool.staker()).to.equal(e.staker.address);
        });

        it('Pool is closed', async function () {
            expect(await p.pool.closed()).to.equal(true);
        });
    });

    describe('Use Cases', function () {
        describe('Close', function () {
            beforeEach(async function () {
                let initialMintAmount = 10 ** TOKEN_DECIMALS;
                await mintAndApprove(e.assetToken, e.deployer, e.staker, p.pool.address, initialMintAmount);
                await p.pool.connect(e.staker).initialMint();

                await p.pool.connect(e.staker).open();
            });

            it('Staker can close', async function () {
                await p.pool.connect(e.staker).close();
                expect(await p.pool.closed()).to.equal(true);
            });

            describe('Rejection scenarios', function () {
                it('Closing the pool when closed should fail', async function () {
                    await p.pool.connect(e.staker).close();
                    await expect(p.pool.connect(e.staker).close()).to.be.revertedWith('SaplingStakerContext: closed');
                });

                it('Closing the pool as a non staker should fail', async function () {
                    await expect(p.pool.connect(e.users[0]).close()).to.be.revertedWith(
                        'SaplingStakerContext: unauthorized',
                    );
                });
            });
        });

        describe('Open', function () {
            it('Staker can open', async function () {
                let initialMintAmount = 10 ** TOKEN_DECIMALS;
                await mintAndApprove(e.assetToken, e.deployer, e.staker, p.pool.address, initialMintAmount);
                await p.pool.connect(e.staker).initialMint();

                await p.pool.connect(e.staker).open();
                expect(await p.pool.closed()).to.equal(false);
            });

            describe('Rejection scenarios', function () {
                it('Opening without initial mint should fail', async function () {
                    await expect(p.pool.connect(e.staker).open()).to.be.revertedWith(
                        'SaplingStakerContext: cannot open the pool under current conditions',
                    );
                });

                it('Opening when not closed should fail', async function () {
                    let initialMintAmount = 10 ** TOKEN_DECIMALS;
                    await mintAndApprove(e.assetToken, e.deployer, e.staker, p.pool.address, initialMintAmount);
                    await p.pool.connect(e.staker).initialMint();

                    await p.pool.connect(e.staker).open();
                    await expect(p.pool.connect(e.staker).open()).to.be.revertedWith(
                        'SaplingStakerContext: not closed',
                    );
                });

                it('Opening as a non staker should fail', async function () {
                    let initialMintAmount = 10 ** TOKEN_DECIMALS;
                    await mintAndApprove(e.assetToken, e.deployer, e.staker, p.pool.address, initialMintAmount);
                    await p.pool.connect(e.staker).initialMint();

                    await expect(p.pool.connect(e.users[0]).open()).to.be.revertedWith(
                        'SaplingStakerContext: unauthorized',
                    );
                });
            });
        });

        describe('Set staker', function () {
            it('Governance can set a new staker', async function () {
                await p.pool.connect(e.governance).setStaker(e.users[0].address);
                expect(await p.pool.staker()).to.equal(e.users[0].address);
            });

            describe('Rejection scenarios', function () {
                it('Staker cannot set a new staker', async function () {
                    await expect(p.pool.connect(e.staker).setStaker(e.users[0].address)).to.be.revertedWith(
                        'SaplingContext: unauthorized',
                    );
                });

                it('Treasury cannot set a new staker', async function () {
                    await expect(p.pool.connect(e.treasury).setStaker(e.users[0].address)).to.be.revertedWith(
                        'SaplingContext: unauthorized',
                    );
                });

                it('pauser cannot set a new staker', async function () {
                    await expect(p.pool.connect(e.pauser).setStaker(e.users[0].address)).to.be.revertedWith(
                        'SaplingContext: unauthorized',
                    );
                });

                it('Deployer cannot set a new staker', async function () {
                    await expect(p.pool.connect(e.deployer).setStaker(e.users[0].address)).to.be.revertedWith(
                        'SaplingContext: unauthorized',
                    );
                });

                it('User cannot set a new staker', async function () {
                    await expect(p.pool.connect(e.users[1]).setStaker(e.users[0].address)).to.be.revertedWith(
                        'SaplingContext: unauthorized',
                    );
                });
            });
        });
    });
});
