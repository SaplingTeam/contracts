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

describe('Pool Factory', function () {
    const TOKEN_DECIMALS = 6;

    let PoolFactoryCF;
    let poolFactory;

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

        PoolFactoryCF = await ethers.getContractFactory('PoolFactory');
        poolFactory = await PoolFactoryCF.deploy();
    });

    describe('Deployment', function () {
        it('Can deploy', async function () {
            await expect(PoolFactoryCF.deploy()).to.be.not.reverted;
        });
    });

    describe('Use Cases', function () {
        describe('Create Pool', function () {
            let liquidityToken;
            let poolToken;

            after(async function () {
                await rollback();
            });

            before(async function () {
                await snapshot();

                liquidityToken = await (
                    await ethers.getContractFactory('PoolToken')
                ).deploy('Test USDC', 'TestUSDC', TOKEN_DECIMALS);

                poolToken = await (
                    await ethers.getContractFactory('PoolToken')
                ).deploy('Sapling Test Lending Pool Token', 'SLPT', TOKEN_DECIMALS);
            });

            it('Can create Pool', async function () {
                await expect(poolFactory.create()).to.be.not.reverted;
            });
        });

        describe('Shutdown', function () {
            it('Can shutdown', async function () {
                await expect(poolFactory.shutdown()).to.be.not.reverted;
            });
        });
    });
});
