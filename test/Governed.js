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

    beforeEach(async function () {
        [manager, protocol, governance1, governance2, ...addrs] = await ethers.getSigners();

        let TestToken = await ethers.getContractFactory("TestToken");
        let SaplingPool = await ethers.getContractFactory("SaplingPool");

        let tokenContract = await TestToken.deploy(addrs[0].address, addrs[1].address, addrs[2].address, addrs[3].address);
        let TOKEN_DECIMALS = await tokenContract.decimals();
        let TOKEN_MULTIPLIER = BigNumber.from(10).pow(TOKEN_DECIMALS);

        currentGovernance = governance1;

        poolContract = await SaplingPool.deploy(tokenContract.address, currentGovernance.address, protocol.address, BigNumber.from(100).mul(TOKEN_MULTIPLIER));
    });

    describe("Deployment", function () {

        it("Protocol governance address", async function () {
            expect(await poolContract.governance()).to.equal(currentGovernance.address);
        });

        it("Pool is not paused", async function () {
            expect(await poolContract.isPaused()).to.equal(false);
            expect(await poolContract.lastPausedTime()).to.equal(1);
            expect(await poolContract.pauseCooldownTime()).to.equal(1);
        });

        it("Pause parameters", async function () {
            expect(await poolContract.PAUSE_TIMEOUT()).to.equal(72 *60*60);
            expect(await poolContract.PAUSE_MAX_COOLDOWN()).to.equal(24 *60*60);
        });
    });

    describe("Transfer Governance", function () {
        it("Transfer as non governance should fail", async function () {
            await expect(poolContract.connect(addrs[0]).transferGovernance(governance2.address)).to.be.reverted;
        });
        it("Transfer", async function () {
            await poolContract.connect(currentGovernance).transferGovernance(governance2.address);
            expect(await poolContract.governance()).to.equal(governance2.address);
            currentGovernance = governance2;
        });
    });

    describe("Pause", function () {
        it("Pause as non governance should fail", async function () {
            await expect(poolContract.connect(addrs[0]).pause()).to.be.reverted;
        });

        it("Pause", async function () {
            await poolContract.connect(currentGovernance).pause();

            let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

            expect(await poolContract.isPaused()).to.equal(true);
            expect(await poolContract.lastPausedTime()).to.equal(blockTimestamp);
        });

        it("Pause Timeout", async function () {
            let PAUSE_TIMEOUT = parseInt(await poolContract.PAUSE_TIMEOUT());
         
            await poolContract.connect(currentGovernance).pause();
            expect(await poolContract.isPaused()).to.equal(true);

            await ethers.provider.send('evm_increaseTime', [PAUSE_TIMEOUT]);
            await ethers.provider.send('evm_mine');

            expect(await poolContract.isPaused()).to.equal(false);
        });

        it("Pause Cooldown", async function () {
            let PAUSE_TIMEOUT = parseInt(await poolContract.PAUSE_TIMEOUT());
            let PAUSE_MAX_COOLDOWN = parseInt(await poolContract.PAUSE_MAX_COOLDOWN());
            await poolContract.connect(currentGovernance).pause();

            let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

            expect(await poolContract.pauseCooldownTime()).to.equal(blockTimestamp + PAUSE_TIMEOUT + PAUSE_MAX_COOLDOWN);
            expect(await poolContract.isPaused()).to.equal(true);

            await ethers.provider.send('evm_increaseTime', [PAUSE_TIMEOUT]);
            await ethers.provider.send('evm_mine');

            expect(await poolContract.isPaused()).to.equal(false);

            await expect(poolContract.connect(currentGovernance).pause()).to.be.reverted;

            await ethers.provider.send('evm_increaseTime', [PAUSE_MAX_COOLDOWN]);
            await ethers.provider.send('evm_mine');

            await expect(poolContract.connect(currentGovernance).pause()).to.be.ok;
        });

        it("Pause when Paused should fail", async function () {
            await poolContract.connect(currentGovernance).pause();
            await expect(poolContract.connect(currentGovernance).pause()).to.be.reverted;
        });
    });

    describe("Resume", function () {
        beforeEach(async function () {
            await poolContract.connect(currentGovernance).pause();
        });

        it("Resume as non governance should fail", async function () {
            await expect(poolContract.connect(addrs[0]).resume()).to.be.reverted;
        });

        it("Resume", async function () {
            await poolContract.connect(currentGovernance).resume();

            expect(await poolContract.isPaused()).to.equal(false);
            expect(await poolContract.lastPausedTime()).to.equal(1);
        });

        it("Resuming early should reduce pause cooldown", async function () {
            let PAUSE_TIMEOUT = parseInt(await poolContract.PAUSE_TIMEOUT());
            let PAUSE_MAX_COOLDOWN = parseInt(await poolContract.PAUSE_MAX_COOLDOWN());
            let prevPauseCooldownTime = await poolContract.pauseCooldownTime();

            await ethers.provider.send('evm_increaseTime', [PAUSE_TIMEOUT/2 - 1]);
            await ethers.provider.send('evm_mine');

            await poolContract.connect(currentGovernance).resume();

            let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

            expect(await poolContract.pauseCooldownTime()).to.lt(prevPauseCooldownTime)
                .and.equal(BigNumber.from(blockTimestamp).add(PAUSE_MAX_COOLDOWN/2));
        });

        it("Resume when not paused should fail", async function () {
            await poolContract.connect(currentGovernance).resume();
            await expect(poolContract.connect(currentGovernance).resume()).to.be.reverted;
        });
    });
  });