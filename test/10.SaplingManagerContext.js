const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { ethers } = require('hardhat');
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

describe('Sapling Manager Context (via SaplingLendingPool)', function () {
    const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
    const TOKEN_DECIMALS = 6;

    let SaplingManagerContextCF;
    let saplingManagerContext;
    let liquidityToken;
    let poolToken;
    let loanDesk;

    let deployer;
    let governance;
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
        [deployer, governance, protocol, manager, ...addresses] = await ethers.getSigners();

        SaplingManagerContextCF = await ethers.getContractFactory('SaplingLendingPool');

        liquidityToken = await (
            await ethers.getContractFactory('PoolToken')
        ).deploy('Test USDC', 'TestUSDC', TOKEN_DECIMALS);

        poolToken = await (
            await ethers.getContractFactory('PoolToken')
        ).deploy('Sapling Test Lending Pool Token', 'SLPT', TOKEN_DECIMALS);

        lendingPool = await (
            await ethers.getContractFactory('SaplingLendingPool')
        ).deploy(poolToken.address, liquidityToken.address, deployer.address, protocol.address, manager.address);

        loanDesk = await (
            await ethers.getContractFactory('LoanDesk')
        ).deploy(lendingPool.address, governance.address, protocol.address, manager.address, TOKEN_DECIMALS);

        await poolToken.connect(deployer).transferOwnership(lendingPool.address);
        await lendingPool.connect(deployer).setLoanDesk(loanDesk.address);
        await lendingPool.connect(deployer).transferGovernance(governance.address);

        saplingManagerContext = lendingPool;
    });

    describe('Deployment', function () {
        it('Can deploy', async function () {
            await expect(
                SaplingManagerContextCF.deploy(
                    poolToken.address,
                    liquidityToken.address,
                    governance.address,
                    protocol.address,
                    manager.address,
                ),
            ).to.be.not.reverted;
        });

        describe('Rejection Scenarios', function () {
            it('Deploying with null manager address should fail', async function () {
                await expect(
                    SaplingManagerContextCF.deploy(
                        poolToken.address,
                        liquidityToken.address,
                        governance.address,
                        protocol.address,
                        NULL_ADDRESS,
                    ),
                ).to.be.reverted;
            });
        });
    });

    describe('Use Cases', function () {
        describe('Initial State', function () {
            it('Pool manager address is correct', async function () {
                expect(await saplingManagerContext.manager()).to.equal(manager.address);
            });

            it('Pool is not closed', async function () {
                expect(await saplingManagerContext.closed()).to.equal(false);
            });

            it('Manager inactivity grace period is correct', async function () {
                expect(await saplingManagerContext.MANAGER_INACTIVITY_GRACE_PERIOD()).to.equal(90 * 24 * 60 * 60);
            });
        });

        describe('Transfer manager', function () {
            let manager2;

            after(async function () {
                await rollback();
            });

            before(async function () {
                await snapshot();

                manager2 = addresses[0];
                assertHardhatInvariant(manager.address != manager2.address);
            });

            it('Can transfer', async function () {
                await saplingManagerContext.connect(governance).transferManager(manager2.address);
                expect(await saplingManagerContext.manager())
                    .to.equal(manager2.address)
                    .and.not.equal(manager);
            });

            describe('Rejection scenarios', function () {
                it('Transferring to NULL address should fail', async function () {
                    await expect(
                        saplingManagerContext.connect(governance).transferManager(NULL_ADDRESS),
                    ).to.be.revertedWith('SaplingManagerContext: invalid manager address');
                });

                it('Transferring to same address should fail', async function () {
                    await expect(
                        saplingManagerContext.connect(governance).transferManager(manager.address),
                    ).to.be.revertedWith('SaplingManagerContext: invalid manager address');
                });

                it('Transferring to treasury address should fail', async function () {
                    await expect(
                        saplingManagerContext.connect(governance).transferManager(protocol.address),
                    ).to.be.revertedWith('SaplingManagerContext: invalid manager address');
                });

                it('Transferring to governance address should fail', async function () {
                    await expect(
                        saplingManagerContext.connect(governance).transferManager(governance.address),
                    ).to.be.revertedWith('SaplingManagerContext: invalid manager address');
                });

                it('Transfer as non governance should fail', async function () {
                    await expect(
                        saplingManagerContext.connect(addresses[1]).transferManager(manager2.address),
                    ).to.be.revertedWith('SaplingContext: caller is not the governance');
                });
            });
        });

        describe('Close', function () {
            it('Manager can close', async function () {
                await saplingManagerContext.connect(manager).close();
                expect(await saplingManagerContext.closed()).to.equal(true);
            });

            describe('Rejection scenarios', function () {
                it('Closing the pool when closed should fail', async function () {
                    await saplingManagerContext.connect(manager).close();
                    await expect(saplingManagerContext.connect(manager).close()).to.be.reverted;
                });

                it('Closing the pool as a non manager should fail', async function () {
                    await expect(saplingManagerContext.connect(addresses[0]).close()).to.be.reverted;
                });
            });
        });

        describe('Open', function () {
            beforeEach(async function () {
                await saplingManagerContext.connect(manager).close();
            });

            it('Manager can open', async function () {
                await saplingManagerContext.connect(manager).open();
                expect(await saplingManagerContext.closed()).to.equal(false);
            });

            describe('Rejection scenarios', function () {
                it('Opening when not closed should fail', async function () {
                    await saplingManagerContext.connect(manager).open();
                    await expect(saplingManagerContext.connect(manager).open()).to.be.reverted;
                });

                it('Opening as a non manager should fail', async function () {
                    await expect(saplingManagerContext.connect(addresses[0]).open()).to.be.reverted;
                });
            });
        });
    });
});
