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

describe('Sapling Factory', function () {
    const TOKEN_DECIMALS = 6;

    let SaplingFactoryCF;
    let saplingFactory;
    let tokenFactory;
    let loanDeskFactory;
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
        SaplingFactoryCF = await ethers.getContractFactory('SaplingFactory');

        tokenFactory = await (await ethers.getContractFactory('TokenFactory')).deploy();
        loanDeskFactory = await (await ethers.getContractFactory('LoanDeskFactory')).deploy();

        let PoolLogicFactoryCF = await ethers.getContractFactory('PoolLogicFactory');
        let poolLogicFactory = await PoolLogicFactoryCF.deploy();

        poolFactory = await (await ethers.getContractFactory('PoolFactory')).deploy(poolLogicFactory.address);
        await poolLogicFactory.transferOwnership(poolFactory.address);

        saplingFactory = await SaplingFactoryCF.deploy(
            tokenFactory.address,
            loanDeskFactory.address,
            poolFactory.address,
        );

        await tokenFactory.transferOwnership(saplingFactory.address);
        await loanDeskFactory.transferOwnership(saplingFactory.address);
        await poolFactory.transferOwnership(saplingFactory.address);
    });

    describe('Deployment', function () {
        it('Can deploy', async function () {
            await expect(SaplingFactoryCF.deploy(tokenFactory.address, loanDeskFactory.address, poolFactory.address)).to
                .be.not.reverted;
        });
    });

    describe('Use Cases', function () {
        describe('Create', function () {
            let name;
            let symbol;
            let liquidityToken;

            after(async function () {
                await rollback();
            });

            before(async function () {
                await snapshot();

                name = 'Sapling Test Lending Pool';
                symbol = 'SLPT';

                liquidityToken = await (
                    await ethers.getContractFactory('PoolToken')
                ).deploy('Test USDC', 'TestUSDC', TOKEN_DECIMALS);
            });

            it('Can create lending pool', async function () {
                await expect(
                    saplingFactory.createLendingPool(
                        name,
                        symbol,
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
                await expect(saplingFactory.shutdown()).to.be.not.reverted;
            });
        });
    });
});
