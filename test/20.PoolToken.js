const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { ethers } = require('hardhat');

let evmSnapshotIds = [];

async function snapshot() {
    let id = await hre.network.provider.send('evm_snapshot');
    evmSnapshotIds.push(id);
}

async function rollback() {
    await hre.network.provider.send('evm_revert', [evmSnapshotIds.pop()]);
}

describe('Pool Token', function () {
    const NAME = 'Sapling Test Lending Pool Token';
    const SYMBOL = 'SLPT';
    const TOKEN_DECIMALS = 6;

    let PoolTokenCF;

    let deployer;
    let addresses;

    beforeEach(async function () {
        await snapshot();
    });

    afterEach(async function () {
        await rollback();
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

        let TOKEN_MULTIPLIER;
        let mintAmount;

        before(async function () {
            poolToken = await PoolTokenCF.deploy(NAME, SYMBOL, TOKEN_DECIMALS);

            TOKEN_MULTIPLIER = BigNumber.from(10).pow(TOKEN_DECIMALS);
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
                await rollback();
            });

            before(async function () {
                await snapshot();

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
