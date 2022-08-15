const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");

describe("Governed (SaplingPool)", function() {

    let poolContract;

    let manager;
    let protocol;
    let governance1;
    let governance2;
    let addrs;

    let currentGovernance;

    const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';

    beforeEach(async function () {
        [manager, protocol, governance1, governance2, ...addrs] = await ethers.getSigners();

        let TestUSDC = await ethers.getContractFactory("TestUSDC");
        let SaplingPool = await ethers.getContractFactory("SaplingLendingPool");

        let tokenContract = await TestUSDC.deploy();
        let TOKEN_DECIMALS = await tokenContract.decimals();
        let TOKEN_MULTIPLIER = BigNumber.from(10).pow(TOKEN_DECIMALS);

        currentGovernance = governance1;

        let PoolFactory = await ethers.getContractFactory("PoolFactory");
        let poolFactory = await PoolFactory.deploy(currentGovernance.address, protocol.address);

        let poolContractTx = await (await poolFactory.connect(currentGovernance).create("Test Pool", "TPT", manager.address, tokenContract.address)).wait();
        let poolAddress = poolContractTx.events.filter(e => e.event === 'PoolCreated')[0].args['pool'];
        poolContract = await SaplingPool.attach(poolAddress);
    });

    describe("Initial state", function () {

        it("Protocol governance address is correct", async function () {
            expect(await poolContract.governance()).to.equal(currentGovernance.address);
        });

        it("Pool is not paused", async function () {
            expect(await poolContract.paused()).to.equal(false);
        });
    });

    describe("Transfer Governance", function () {
        it("Can transfer", async function () {
            await poolContract.connect(currentGovernance).transferGovernance(governance2.address);
            expect(await poolContract.governance()).to.equal(governance2.address);
            currentGovernance = governance2;
        });

        describe("Rejection scenarios", function () {
            it("Transferring to NULL address should fail", async function () {
                await expect(poolContract.connect(currentGovernance).transferGovernance(NULL_ADDRESS)).to.be.reverted;
            });

            it("Transferring governance to same address should fail", async function () {
                await expect(poolContract.connect(currentGovernance).transferGovernance(currentGovernance.address)).to.be.reverted;
            });

            it("Transfer as non governance should fail", async function () {
                await expect(poolContract.connect(addrs[0]).transferGovernance(governance2.address)).to.be.reverted;
            });
        });
    });

    describe("Transfer Protocol Wallet", function () {
        it("Can transfer", async function () {
            await poolContract.connect(currentGovernance).transferProtocolWallet(addrs[1].address);
            expect(await poolContract.protocol()).to.equal(addrs[1].address);
        });

        describe("Rejection scenarios", function () {
            it("Transfer as non governance should fail", async function () {
                await expect(poolContract.connect(addrs[0]).transferProtocolWallet(addrs[1].address)).to.be.reverted;
            });

            it("Transferring to a NULL address should fail", async function () {
                await expect(poolContract.connect(currentGovernance).transferProtocolWallet(NULL_ADDRESS)).to.be.reverted;
            });
        });
    });

    describe("Pause", function () {
        it("Governance can pause", async function () {
            await poolContract.connect(currentGovernance).pause();
            expect(await poolContract.paused()).to.equal(true);
        });

        describe("Rejection scenarios", function () {
            it("Pausing when paused should fail", async function () {
                await poolContract.connect(currentGovernance).pause();
                await expect(poolContract.connect(currentGovernance).pause()).to.be.reverted;
            });

            it("Pausing as a non governance should fail", async function () {
                await expect(poolContract.connect(addrs[0]).pause()).to.be.reverted;
            });
        });
    });

    describe("Resume", function () {
        beforeEach(async function () {
            await poolContract.connect(currentGovernance).pause();
        });

        it("Governance can resume", async function () {
            await poolContract.connect(currentGovernance).unpause();
            expect(await poolContract.paused()).to.equal(false);
        });

        describe("Rejection scenarios", function () {

            it("Resuming when not paused should fail", async function () {
                await poolContract.connect(currentGovernance).unpause();
                await expect(poolContract.connect(currentGovernance).unpause()).to.be.reverted;
            });

            it("Resuming as a non governance should fail", async function () {
                await expect(poolContract.connect(addrs[0]).unpause()).to.be.reverted;
            });
        });
    });
  });
