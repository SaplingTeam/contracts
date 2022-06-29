const { expect } = require("chai");
const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");

describe("Contract Deployment", function() {

    let SaplingPool;
    let poolContract;
    let tokenContract;
    let TOKEN_MULTIPLIER;

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
        tokenContract = await TestUSDC.deploy();

        let TOKEN_DECIMALS = await tokenContract.decimals();
        TOKEN_MULTIPLIER = BigNumber.from(10).pow(TOKEN_DECIMALS);

        SaplingPool = await ethers.getContractFactory("SaplingPool");

        currentGovernance = governance1;
    });

    describe("Deploy Lending Pool", function () {

        it("Can deploy lending pool", async function () {
            await expect(SaplingPool.deploy(tokenContract.address, currentGovernance.address, protocol.address, manager.address))
                .to.be.ok;
        });

        describe("Rejection scenarios", function () {

            it("Deploying with null token address should fail", async function () {
                await expect(SaplingPool.deploy(NULL_ADDRESS, currentGovernance.address, protocol.address, manager.address))
                    .to.be.reverted;
            });

            it("Deploying with null governance address should fail", async function () {
                await expect(SaplingPool.deploy(tokenContract.address, NULL_ADDRESS, protocol.address, manager.address))
                    .to.be.reverted;
            });

            it("Deploying with null protocol wallet address should fail", async function () {
                await expect(SaplingPool.deploy(tokenContract.address, currentGovernance.address, NULL_ADDRESS, manager.address))
                    .to.be.reverted;
            });

            it("Deploying with null manager address should fail", async function () {
                await expect(SaplingPool.deploy(tokenContract.address, currentGovernance.address, protocol.address, NULL_ADDRESS))
                    .to.be.reverted;
            });
        });
    });
  });
