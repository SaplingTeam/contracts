const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { ethers } = require('hardhat');
const { TOKEN_DECIMALS, TOKEN_MULTIPLIER } = require('./utils/constants');
const { snapshot, rollback } = require('./utils/evmControl');

let evmSnapshotIds = [];

describe('Pool Token', function () {
    const NAME = 'Sapling Test Lending Pool Token';
    const SYMBOL = 'SLPT';

    let PoolTokenCF;

    let deployer;
    let addresses;

    beforeEach(async function () {
        await snapshot(evmSnapshotIds);
    });

    afterEach(async function () {
        await rollback(evmSnapshotIds);
    });

    before(async function () {
        [deployer, ...addresses] = await ethers.getSigners();
        PoolTokenCF = await ethers.getContractFactory('PoolToken');
    });

    describe('Deployment', function () {
        it('Can deploy', async function () {
            await expect(PoolTokenCF.deploy(NAME, SYMBOL, TOKEN_DECIMALS)).to.be.not.rejected;
        });

        describe('Rejection Scenarios', function () {});
    });

    describe('Use Cases', function () {
        let poolToken;

        let mintAmount;

        before(async function () {
            poolToken = await PoolTokenCF.deploy(NAME, SYMBOL, TOKEN_DECIMALS);

            mintAmount = BigNumber.from(500 + Math.floor(Math.random() * 500)).mul(TOKEN_MULTIPLIER);
        });

        describe('Initial State', function () {
            it('Correct name', async function () {
                expect(await poolToken.name()).to.equal(NAME);
            });

            it('Correct symbol', async function () {
                expect(await poolToken.symbol()).to.equal(SYMBOL);
            });

            it('Correct decimals', async function () {
                expect(await poolToken.decimals()).to.equal(TOKEN_DECIMALS);
            });
        });

        describe('Mint', function () {
            it('Owner can mint', async function () {
                await expect(poolToken.connect(deployer).mint(addresses[0].address, mintAmount)).to.changeTokenBalance(
                    poolToken,
                    addresses[0].address,
                    mintAmount,
                );
            });

            describe('Rejection Scenarios', function () {
                it('Non-owners cannot mint', async function () {
                    await expect(
                        poolToken.connect(addresses[0]).mint(addresses[0].address, mintAmount),
                    ).to.be.revertedWith('Ownable: caller is not the owner');
                });
            });
        });

        describe('Burn', function () {
            let burnAmount;

            after(async function () {
                await rollback(evmSnapshotIds);
            });

            before(async function () {
                await snapshot(evmSnapshotIds);

                await poolToken.connect(deployer).mint(addresses[0].address, mintAmount);
                burnAmount = mintAmount.div(2);
            });

            it('Owner can burn', async function () {
                await expect(poolToken.connect(deployer).burn(addresses[0].address, burnAmount)).to.changeTokenBalance(
                    poolToken,
                    addresses[0].address,
                    -burnAmount,
                );
            });

            describe('Rejection Scenarios', function () {
                it('Non-owners cannot burn', async function () {
                    await expect(
                        poolToken.connect(addresses[0]).burn(addresses[0].address, burnAmount),
                    ).to.be.revertedWith('Ownable: caller is not the owner');
                });
            });
        });
    });
});
