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

describe('Sapling Math Context (via SaplingLendingPool)', function () {
    const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
    const TOKEN_DECIMALS = 6;

    let SaplingMathContextCF;
    let saplingMathContext;
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

        SaplingMathContextCF = await ethers.getContractFactory('SaplingLendingPool');

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

        saplingMathContext = lendingPool;
    });

    describe('Deployment', function () {
        it('Can deploy', async function () {
            await expect(
                SaplingMathContextCF.deploy(
                    poolToken.address,
                    liquidityToken.address,
                    governance.address,
                    protocol.address,
                    manager.address,
                ),
            ).to.be.not.reverted;
        });
    });

    describe('Use Cases', function () {
        let PERCENT_DECIMALS;

        before(async function () {
            PERCENT_DECIMALS = await saplingMathContext.percentDecimals();
        });

        describe('Initial State', function () {
            it('Percent Decimals is correct', async function () {
                expect(PERCENT_DECIMALS).to.equal(1);
            });

            it('"100%" value constant is correct', async function () {
                expect(await saplingMathContext.oneHundredPercent()).to.equal(100 * 10 ** PERCENT_DECIMALS);
            });
        });
    });
});
