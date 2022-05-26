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

    let PAUSE_TIMEOUT;
    let PAUSE_MAX_COOLDOWN;

    beforeEach(async function () {
        [manager, protocol, governance1, governance2, ...addrs] = await ethers.getSigners();

        let TestToken = await ethers.getContractFactory("TestToken");
        let SaplingPool = await ethers.getContractFactory("SaplingPool");

        let tokenContract = await TestToken.deploy(addrs[0].address, addrs[1].address, addrs[2].address, addrs[3].address);
        let TOKEN_DECIMALS = await tokenContract.decimals();
        let TOKEN_MULTIPLIER = BigNumber.from(10).pow(TOKEN_DECIMALS);

        currentGovernance = governance1;

        poolContract = await SaplingPool.deploy(tokenContract.address, currentGovernance.address, protocol.address, BigNumber.from(100).mul(TOKEN_MULTIPLIER));

        PAUSE_TIMEOUT = await poolContract.PAUSE_TIMEOUT();
        PAUSE_MAX_COOLDOWN = await poolContract.PAUSE_MAX_COOLDOWN();
    });

    describe("Initial state", function () {

        it("Protocol governance address is correct", async function () {
            expect(await poolContract.governance()).to.equal(currentGovernance.address);
        });

        it("Pool is not paused", async function () {
            expect(await poolContract.isPaused()).to.equal(false);
            expect(await poolContract.lastPausedTime()).to.equal(1);
            expect(await poolContract.pauseCooldownTime()).to.equal(1);
        });

        it("Pause timeout is correct", async function () {
            expect(PAUSE_TIMEOUT).to.equal(72 *60*60);
        });

        it("Pause max cooldown is correct", async function () {
            expect(PAUSE_MAX_COOLDOWN).to.equal(24 *60*60);
        });
    });

    describe("Transfer Governance", function () {
        it("Can transfer", async function () {
            await poolContract.connect(currentGovernance).transferGovernance(governance2.address);
            expect(await poolContract.governance()).to.equal(governance2.address);
            currentGovernance = governance2;
        });

        describe("Rejection scenarios", function () {
            it("Transfer as non governance should fail", async function () {
                await expect(poolContract.connect(addrs[0]).transferGovernance(governance2.address)).to.be.reverted;
            });
        });
    });

    describe("Pause", function () {

        let PAUSE_TIMEOUT;
        let PAUSE_MAX_COOLDOWN;

        beforeEach(async function () {
            PAUSE_TIMEOUT = await poolContract.PAUSE_TIMEOUT();
            PAUSE_MAX_COOLDOWN = await poolContract.PAUSE_MAX_COOLDOWN();
        });

        it("Governance can pause", async function () {
            await poolContract.connect(currentGovernance).pause();

            let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

            expect(await poolContract.isPaused()).to.equal(true);
            expect(await poolContract.lastPausedTime()).to.equal(blockTimestamp);
        });

        it("Pause timeout is enforced", async function () {
         
            await poolContract.connect(currentGovernance).pause();
            expect(await poolContract.isPaused()).to.equal(true);

            await ethers.provider.send('evm_increaseTime', [PAUSE_TIMEOUT.toNumber()]);
            await ethers.provider.send('evm_mine');

            expect(await poolContract.isPaused()).to.equal(false);
        });

        it("Pause cooldown is enforced", async function () {
            await poolContract.connect(currentGovernance).pause();

            let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

            expect(await poolContract.pauseCooldownTime()).to.equal(PAUSE_TIMEOUT.add(PAUSE_MAX_COOLDOWN).add(blockTimestamp));
            expect(await poolContract.isPaused()).to.equal(true);

            await ethers.provider.send('evm_increaseTime', [PAUSE_TIMEOUT.toNumber()]);
            await ethers.provider.send('evm_mine');

            expect(await poolContract.isPaused()).to.equal(false);

            await expect(poolContract.connect(currentGovernance).pause()).to.be.reverted;

            await ethers.provider.send('evm_increaseTime', [PAUSE_MAX_COOLDOWN.toNumber()]);
            await ethers.provider.send('evm_mine');

            await expect(poolContract.connect(currentGovernance).pause()).to.be.ok;
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
            await poolContract.connect(currentGovernance).resume();

            expect(await poolContract.isPaused()).to.equal(false);
            expect(await poolContract.lastPausedTime()).to.equal(1);
        });

        it("Resuming early should reduce pause cooldown", async function () {
            let PAUSE_TIMEOUT = await poolContract.PAUSE_TIMEOUT();
            let PAUSE_MAX_COOLDOWN = await poolContract.PAUSE_MAX_COOLDOWN();
            let prevPauseCooldownTime = await poolContract.pauseCooldownTime();

            await ethers.provider.send('evm_increaseTime', [PAUSE_TIMEOUT.div(2).sub(1).toNumber()]);
            await ethers.provider.send('evm_mine');

            await poolContract.connect(currentGovernance).resume();

            let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;
            
            let pauseCooldownTime = await poolContract.pauseCooldownTime();
            expect(pauseCooldownTime).to.lt(prevPauseCooldownTime);
            expect(pauseCooldownTime.sub(BigNumber.from(blockTimestamp).add(PAUSE_MAX_COOLDOWN.div(2)))).to.lte(1);
        });

        describe("Rejection scenarios", function () {

            it("Resuming when not paused should fail", async function () {
                await poolContract.connect(currentGovernance).resume();
                await expect(poolContract.connect(currentGovernance).resume()).to.be.reverted;
            });

            it("Resuming as a non governance should fail", async function () {
                await expect(poolContract.connect(addrs[0]).resume()).to.be.reverted;
            });
        });
    });
  });
