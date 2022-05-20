const { expect } = require("chai");
const { BigNumber } = require("ethers");

describe("SaplingPool Pool", function() {

    let TestToken;
    let tokenContract;

    let SaplingPool;
    let poolContract;

    let manager;
    let protocol;
    let lender1;
    let borrower1;

    let PERCENT_DECIMALS;
    let TOKEN_DECIMALS;
    let TOKEN_MULTIPLIER;

    beforeEach(async function () {
        [manager, protocol, governance, lender1, lender2, borrower1, borrower2, ...addrs] = await ethers.getSigners();

        TestToken = await ethers.getContractFactory("TestToken");
        SaplingPool = await ethers.getContractFactory("SaplingPool");

        tokenContract = await TestToken.deploy(lender1.address, lender2.address, borrower1.address, borrower2.address);
        poolContract = await SaplingPool.deploy(tokenContract.address, governance.address, protocol.address, BigInt(100e18));

        PERCENT_DECIMALS = await poolContract.PERCENT_DECIMALS();
        TOKEN_DECIMALS = await tokenContract.decimals();
        TOKEN_MULTIPLIER = BigNumber.from(10).pow(TOKEN_DECIMALS);
    });

    describe("Deployment", function () {

        it("Pool manager address", async function () {
            expect(await poolContract.manager()).to.equal(manager.address);
        });

        it("Protocol governance address", async function () {
            expect(await poolContract.governance()).to.equal(governance.address);
        });

        it("Protocol wallet address", async function () {
            expect(await poolContract.protocol()).to.equal(protocol.address);
        });

        it("Token contract address", async function () {
            expect(await poolContract.token()).to.equal(tokenContract.address);
        });

        it("Pool is not closed", async function () {
            expect(await poolContract.isClosed()).to.equal(false);
        });

        it("Pool is not paused", async function () {
            expect(await poolContract.isPaused()).to.equal(false);
        });

        it("Lending is not paused", async function () {
            expect(await poolContract.isLendingPaused()).to.equal(false);
        });

        it("Target stake percent", async function () {
            let minValue = 0 * 10**PERCENT_DECIMALS;
            let maxValue = 100 * 10**PERCENT_DECIMALS;
            let defaultValue = 10 * 10**PERCENT_DECIMALS;

            expect(await poolContract.ONE_HUNDRED_PERCENT()).to.equal(maxValue);
            expect(await poolContract.targetStakePercent()).to.equal(defaultValue)
                .and.gte(minValue)
                .and.lte(maxValue);
        });

        it("Target liquidity percent", async function () {
            let minValue = 0 * 10**PERCENT_DECIMALS;
            let maxValue = 100 * 10**PERCENT_DECIMALS;
            let defaultValue = 0 * 10**PERCENT_DECIMALS;

            expect(await poolContract.ONE_HUNDRED_PERCENT()).to.equal(maxValue);
            expect(await poolContract.targetLiquidityPercent()).to.equal(defaultValue)
                .and.gte(minValue)
                .and.lte(maxValue);
        });

        it("Protocol fee percent", async function () {
            let minValue = 0 * 10**PERCENT_DECIMALS;
            let maxValue = 10 * 10**PERCENT_DECIMALS;
            let defaultValue = 10 * 10**PERCENT_DECIMALS;

            expect(await poolContract.MAX_PROTOCOL_EARNING_PERCENT()).to.equal(maxValue);
            expect(await poolContract.protocolEarningPercent()).to.equal(defaultValue)
                .and.gte(minValue)
                .and.lte(maxValue);
        });

        it("Manager's earn factor", async function () {
            let minValue = 100 * 10**PERCENT_DECIMALS;
            let maxValue = 150 * 10**PERCENT_DECIMALS;
            let defaultValue = 150 * 10**PERCENT_DECIMALS;

            expect(await poolContract.managerEarnFactorMax()).to.equal(maxValue);
            expect(await poolContract.managerEarnFactor()).to.equal(defaultValue)
                .and.gte(minValue)
                .and.lte(maxValue);
        });

        it("Early exit period", async function () {
            expect(await poolContract.EARLY_EXIT_COOLDOWN()).to.equal(90*24*60*60);
        });

        it("Early exit fee", async function () {
            expect(await poolContract.earlyExitFeePercent()).to.equal(0.5*10**PERCENT_DECIMALS);
        });

        it("Loan APR", async function () {
            let minValue = 0 * 10**PERCENT_DECIMALS;
            let maxValue = 100 * 10**PERCENT_DECIMALS;
            let defaultValue = 30 * 10**PERCENT_DECIMALS;

            expect(await poolContract.SAFE_MIN_APR()).to.equal(minValue);
            expect(await poolContract.SAFE_MAX_APR()).to.equal(maxValue);
            expect(await poolContract.defaultAPR()).to.equal(defaultValue)
                .and.gte(minValue)
                .and.lte(maxValue);
        });

        it("Loan late APR delta", async function () {
            let minValue = 0 * 10**PERCENT_DECIMALS;
            let maxValue = 100 * 10**PERCENT_DECIMALS;
            let defaultValue = 5 * 10**PERCENT_DECIMALS;

            expect(await poolContract.SAFE_MIN_APR()).to.equal(minValue);
            expect(await poolContract.SAFE_MAX_APR()).to.equal(maxValue);
            expect(await poolContract.defaultLateAPRDelta()).to.equal(defaultValue)
                .and.gte(minValue)
                .and.lte(maxValue);
        });

        it("Empty pool lenderAPY", async function () {
            expect(await poolContract.currentLenderAPY()).to.equal(0);
        });

        it("Loan grace period", async function () {
            let minValue = BigNumber.from(3*24*60*60);
            let maxValue = BigNumber.from(365*24*60*60);
            let defaultValue = BigNumber.from(60*24*60*60);
            
            expect(await poolContract.MIN_LOAN_GRACE_PERIOD()).to.equal(minValue);
            expect(await poolContract.MAX_LOAN_GRACE_PERIOD()).to.equal(maxValue);
            expect(await poolContract.loanGracePeriod()).to.equal(defaultValue)
                .and.gte(minValue)
                .and.lte(maxValue);
            
        });

        it("Manager inactivity grace period", async function () {
            expect(await poolContract.MANAGER_INACTIVITY_GRACE_PERIOD()).to.equal(90*24*60*60);
        });

        it("Token decimals", async function () {
            expect(await poolContract.tokenDecimals()).to.equal(TOKEN_DECIMALS);
            expect(await poolContract.ONE_TOKEN()).to.equal(TOKEN_MULTIPLIER.mul(1));
        });

        it("Initial balances", async function () {
            expect(await poolContract.tokenBalance()).to.equal(0);
            expect(await poolContract.totalPoolShares()).to.equal(0);
            expect(await poolContract.stakedShares()).to.equal(0);
            expect(await poolContract.poolFundsLimit()).to.equal(0);
            expect(await poolContract.poolFunds()).to.equal(0);
            expect(await poolContract.poolLiquidity()).to.equal(0);
            expect(await poolContract.borrowedFunds()).to.equal(0);
            expect(await poolContract.loanFundsPendingWithdrawal()).to.equal(0);
        });
    });
  });