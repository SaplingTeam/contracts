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

    let PoolProxyFactoryCF;
    let poolFactory;
    let poolLogicFactory;

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

        let PoolFactoryCF = await ethers.getContractFactory('PoolFactory');
        poolFactory = await PoolFactoryCF.deploy();

        PoolProxyFactoryCF = await ethers.getContractFactory('PoolProxyFactory');
        poolProxyFactory = await PoolProxyFactoryCF.deploy(poolFactory.address);
        await poolFactory.transferOwnership(poolProxyFactory.address);
    });

    describe('Deployment', function () {
        it('Can deploy', async function () {
            await expect(PoolProxyFactoryCF.deploy(poolFactory.address)).to.be.not.reverted;
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
                await expect(
                    poolProxyFactory.create(
                        poolToken.address,
                        liquidityToken.address,
                        governance.address,
                        protocol.address,
                        manager.address,
                    ),
                ).to.be.not.reverted;
            });
        });

        describe('Shutdown', function () {
            it('Can shutdown', async function () {
                await expect(poolProxyFactory.shutdown()).to.be.not.reverted;
            });
        });
    });
});
