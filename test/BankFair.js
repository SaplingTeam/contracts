const { expect } = require("chai");

describe("BankFair Pool", function() {

    let TestToken;
    let tokenContract;

    let BankFair;
    let bankFairContract;

    let manager;
    let protocol;
    let lender1;
    let borrower1;

    beforeEach(async function () {
        [manager, protocol, governance, lender1, lender2, borrower1, borrower2, ...addrs] = await ethers.getSigners();

        TestToken = await ethers.getContractFactory("TestToken");
        BankFair = await ethers.getContractFactory("BankFair");

        tokenContract = await TestToken.deploy(lender1.address, lender2.address, borrower1.address, borrower2.address);
        bankFairContract = await BankFair.deploy(tokenContract.address, governance.address, protocol.address, BigInt(100e18))
    });

    describe("Deployment", function () {

        it("Set the manager", async function () {
            expect(await bankFairContract.manager()).to.equal(manager.address);
        });

        it("Set the protocol governance address", async function () {
            expect(await bankFairContract.governance()).to.equal(governance.address);
        });

        it("Set the protocol wallet address", async function () {
            expect(await bankFairContract.protocol()).to.equal(protocol.address);
        });

        it("Set the token contract", async function () {
            expect(await bankFairContract.token()).to.equal(tokenContract.address);
        });
    });
  });