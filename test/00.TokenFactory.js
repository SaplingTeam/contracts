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

describe('Token Factory', function () {
    const TOKEN_DECIMALS = 6;

    let TokenFactoryCF;
    let tokenFactory;

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
        TokenFactoryCF = await ethers.getContractFactory('TokenFactory');
        tokenFactory = await TokenFactoryCF.deploy();
    });

    describe('Deployment', function () {
        it('Can deploy', async function () {
            await expect(TokenFactoryCF.deploy()).to.be.not.reverted;
        });
    });

    describe('Use Cases', function () {
        describe('Create Token', function () {
            let name;
            let symbol;

            after(async function () {
                await rollback();
            });

            before(async function () {
                await snapshot();

                name = 'Sapling Test Lending Pool Token';
                symbol = 'SLPT';
            });

            it('Can create PoolToken', async function () {
                await expect(tokenFactory.create(name, symbol, TOKEN_DECIMALS)).to.be.not.reverted;
            });
        });

        describe('Shutdown', function () {
            it('Can shutdown', async function () {
                await expect(tokenFactory.shutdown()).to.be.not.reverted;
            });
        });
    });
});
