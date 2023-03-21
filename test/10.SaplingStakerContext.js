const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const { TOKEN_DECIMALS } = require('./utils/constants');
const { mintAndApprove } = require('./utils/helpers');
const { snapshot, rollback } = require('./utils/evmControl');
const { deployEnv, deployProtocol } = require("./utils/deployer");

let evmSnapshotIds = [];

describe('Sapling Staker Context (via SaplingLendingPool)', function () {
    let coreAccessControl;

    let SaplingStakerContextCF;
    let saplingStakerContext;
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

        saplingStakerContext = lendingPool;

        await loanDesk.connect(staker).open();
    });

    describe('Deployment', function () {
        it('Can deploy', async function () {
            await expect(
                upgrades.deployProxy(await ethers.getContractFactory('SaplingLendingPool'), [
                    poolToken.address,
                    liquidityToken.address,
                    coreAccessControl.address,
                    protocol.address,
                    staker.address,
                ]),
            ).to.be.not.reverted;
        });
    });

    describe('Initial State', function () {
        it('Staker address is correct', async function () {
            expect(await saplingStakerContext.staker()).to.equal(staker.address);
        });

        it('Pool is closed', async function () {
            expect(await saplingStakerContext.closed()).to.equal(true);
        });
    });

    describe('Use Cases', function () {
        describe('Close', function () {
            beforeEach(async function () {
                let initialMintAmount = 10 ** TOKEN_DECIMALS;
                await mintAndApprove(liquidityToken, deployer, staker, lendingPool.address, initialMintAmount);
                await lendingPool.connect(staker).initialMint();

                await saplingStakerContext.connect(staker).open();
            });

            it('Staker can close', async function () {
                await saplingStakerContext.connect(staker).close();
                expect(await saplingStakerContext.closed()).to.equal(true);
            });

            describe('Rejection scenarios', function () {
                it('Closing the pool when closed should fail', async function () {
                    await saplingStakerContext.connect(staker).close();
                    await expect(saplingStakerContext.connect(staker).close()).to.be.reverted;
                });

                it('Closing the pool as a non staker should fail', async function () {
                    await expect(saplingStakerContext.connect(addresses[0]).close()).to.be.reverted;
                });
            });
        });

        describe('Open', function () {
            it('Staker can open', async function () {
                let initialMintAmount = 10 ** TOKEN_DECIMALS;
                await mintAndApprove(liquidityToken, deployer, staker, lendingPool.address, initialMintAmount);
                await lendingPool.connect(staker).initialMint();

                await saplingStakerContext.connect(staker).open();
                expect(await saplingStakerContext.closed()).to.equal(false);
            });

            describe('Rejection scenarios', function () {
                it('Opening without initial mint should fail', async function () {
                    await expect(saplingStakerContext.connect(staker).open()).to.be.reverted;
                });

                it('Opening when not closed should fail', async function () {
                    let initialMintAmount = 10 ** TOKEN_DECIMALS;
                    await mintAndApprove(liquidityToken, deployer, staker, lendingPool.address, initialMintAmount);
                    await lendingPool.connect(staker).initialMint();

                    await saplingStakerContext.connect(staker).open();
                    await expect(saplingStakerContext.connect(staker).open()).to.be.reverted;
                });

                it('Opening as a non staker should fail', async function () {
                    let initialMintAmount = 10 ** TOKEN_DECIMALS;
                    await mintAndApprove(liquidityToken, deployer, staker, lendingPool.address, initialMintAmount);
                    await lendingPool.connect(staker).initialMint();

                    await expect(saplingStakerContext.connect(addresses[0]).open()).to.be.reverted;
                });
            });
        });
    });
});
