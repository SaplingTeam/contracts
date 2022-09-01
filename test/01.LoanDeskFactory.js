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

describe('LoanDesk Factory', function () {
    const TOKEN_DECIMALS = 6;

    let LoanDeskFactoryCF;
    let loanDeskFactory;

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
        LoanDeskFactoryCF = await ethers.getContractFactory('LoanDeskFactory');
        loanDeskFactory = await LoanDeskFactoryCF.deploy();
    });

    describe('Deployment', function () {
        it('Can deploy', async function () {
            await expect(LoanDeskFactoryCF.deploy()).to.be.not.reverted;
        });
    });

    describe('Use Cases', function () {
        describe('Create LoanDesk', function () {
            let lendingPool;

            after(async function () {
                await rollback();
            });

            before(async function () {
                await snapshot();

                let liquidityToken = await (
                    await ethers.getContractFactory('PoolToken')
                ).deploy('Test USDC', 'TestUSDC', TOKEN_DECIMALS);

                let poolToken = await (
                    await ethers.getContractFactory('PoolToken')
                ).deploy('Sapling Test Lending Pool Token', 'SLPT', TOKEN_DECIMALS);

                lendingPool = await (
                    await ethers.getContractFactory('SaplingLendingPool')
                ).deploy(poolToken.address, liquidityToken.address, governance.address, protocol.address, manager.address);
            });

            it('Can create LoanDesk', async function () {
                await expect(
                    loanDeskFactory.create(
                        lendingPool.address,
                        governance.address,
                        protocol.address,
                        manager.address,
                        TOKEN_DECIMALS,
                    ),
                ).to.be.not.reverted;
            });
        });

        describe('Shutdown', function () {
            it('Can shutdown', async function () {
                await expect(loanDeskFactory.shutdown()).to.be.not.reverted;
            });
        });
    });
});
