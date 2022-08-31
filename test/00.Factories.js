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

describe('Factories', function () {
    let TestUSDC;
    let tokenContract;

    let SaplingPool;
    let poolContract;
    let loanDesk;
    let tokenFactory;
    let loanDeskFactory;
    let poolFactory;
    let verificationHub;

    let manager;
    let protocol;
    let lender1;
    let borrower1;
    let addrs;

    beforeEach(async function () {
        await snapshot();
    });

    afterEach(async function () {
        await rollback();
    });

    before(async function () {
        [manager, protocol, governance, lender1, lender2, borrower1, borrower2, ...addrs] = await ethers.getSigners();

        TestUSDC = await ethers.getContractFactory('PoolToken');
        SaplingPool = await ethers.getContractFactory('SaplingLendingPool');
        LoanDesk = await ethers.getContractFactory('LoanDesk');

        tokenContract = await TestUSDC.deploy('Test USDC', 'TestUSDC', 6);

        verificationHub = await (
            await ethers.getContractFactory('VerificationHub')
        ).deploy(manager.address, protocol.address);

        tokenFactory = await (await ethers.getContractFactory('TokenFactory')).deploy();
        loanDeskFactory = await (await ethers.getContractFactory('LoanDeskFactory')).deploy();
        poolFactory = await (await ethers.getContractFactory('PoolFactory')).deploy();

        let saplingFactory = await (
            await ethers.getContractFactory('SaplingFactory')
        ).deploy(
            tokenFactory.address,
            loanDeskFactory.address,
            poolFactory.address,
            verificationHub.address,
            governance.address,
            protocol.address,
        );

        await tokenFactory.transferOwnership(saplingFactory.address);
        await loanDeskFactory.transferOwnership(saplingFactory.address);
        await poolFactory.transferOwnership(saplingFactory.address);
        await verificationHub.setSaplingFactory(saplingFactory.address);
        await verificationHub.transferGovernance(governance.address);

        let poolContractTx = await (
            await saplingFactory
                .connect(governance)
                .createLendingPool('Test Pool', 'TPT', manager.address, tokenContract.address)
        ).wait();
        let poolAddress = poolContractTx.events.filter((e) => e.event === 'LendingPoolReady')[0].args['pool'];
        poolContract = await SaplingPool.attach(poolAddress);
        let loanDeskAddress = await poolContract.loanDesk();
        loanDesk = await LoanDesk.attach(loanDeskAddress);
    });

    describe('Deployment', function () {
        it('Can deploy', async function () {
            await (
                await ethers.getContractFactory('SaplingFactory')
            ).deploy(
                tokenFactory.address,
                loanDeskFactory.address,
                poolFactory.address,
                verificationHub.address,
                governance.address,
                protocol.address,
            );
        });

        describe('Rejection Scenarios', function () {});
    });

    describe('Use Cases', function () {
        before(async function () {});

        describe('Initial State', function () {});
    });
});
