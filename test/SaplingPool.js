const { expect } = require("chai");

describe("SaplingPool Pool", function() {

    let TestToken;
    let tokenContract;

    let SaplingPool;
    let poolContract;

    let manager;
    let protocol;
    let lender1;
    let borrower1;

    beforeEach(async function () {
        [manager, protocol, governance, lender1, lender2, borrower1, borrower2, ...addrs] = await ethers.getSigners();

        TestToken = await ethers.getContractFactory("TestToken");
        SaplingPool = await ethers.getContractFactory("SaplingPool");

        tokenContract = await TestToken.deploy(lender1.address, lender2.address, borrower1.address, borrower2.address);
        poolContract = await SaplingPool.deploy(tokenContract.address, governance.address, protocol.address, BigInt(100e18))
    });

    describe("Deployment", function () {

        it("Set the manager", async function () {
            expect(await poolContract.manager()).to.equal(manager.address);
        });

        it("Set the protocol governance address", async function () {
            expect(await poolContract.governance()).to.equal(governance.address);
        });

        it("Set the protocol wallet address", async function () {
            expect(await poolContract.protocol()).to.equal(protocol.address);
        });

        it("Set the token contract", async function () {
            expect(await poolContract.token()).to.equal(tokenContract.address);
        });
    });

    describe("APY", function () {
        it("Empty pool lenderAPY", async function () {
            expect(await poolContract.currentLenderAPY()).to.equal(0);
        });
    });
  });