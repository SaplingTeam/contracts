const { expect } = require("chai");
const { BigNumber } = require("ethers");

describe("Lender (SaplingPool)", function() {

    let TestToken;
    let tokenContract;

    let SaplingPool;
    let poolContract;

    let manager;
    let protocol;
    let lender1;
    let borrower1;
    let borrower2;
    let borrower3;

    let PERCENT_DECIMALS;
    let TOKEN_DECIMALS;
    let TOKEN_MULTIPLIER;

    const LoanStatus = {
        "APPLIED": 0,
        "DENIED": 1,
        "APPROVED": 2,
        "CANCELLED": 3,
        "OUTSTANDING": 4,
        "REPAID": 5,
        "DEFAULTED": 6,
      };

    beforeEach(async function () {
        [manager, protocol, governance, lender1, borrower1, borrower2, borrower3, ...addrs] = await ethers.getSigners();

        TestToken = await ethers.getContractFactory("TestToken");
        SaplingPool = await ethers.getContractFactory("SaplingPool");

        tokenContract = await TestToken.deploy(lender1.address, borrower1.address, borrower2.address, borrower3.address);
        poolContract = await SaplingPool.deploy(tokenContract.address, governance.address, protocol.address, BigInt(100e18));

        PERCENT_DECIMALS = await poolContract.PERCENT_DECIMALS();
        TOKEN_DECIMALS = await tokenContract.decimals();
        TOKEN_MULTIPLIER = BigNumber.from(10).pow(TOKEN_DECIMALS);

        let stakeAmount = BigNumber.from(2000).mul(TOKEN_MULTIPLIER);
        let depositAmount = BigNumber.from(10000).mul(TOKEN_MULTIPLIER);

        await tokenContract.connect(manager).approve(poolContract.address, stakeAmount);
        await poolContract.connect(manager).stake(stakeAmount);

        await tokenContract.connect(lender1).approve(poolContract.address, depositAmount);
        await poolContract.connect(lender1).deposit(depositAmount);
    });

    describe("Deployment", function () {
        it("Loan count", async function () {
            expect(await poolContract.loansCount()).to.equal(0);
        });
    });

    describe("Request", function () {
        it("Request", async function () {
            let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
            let loanDuration = BigNumber.from(365).mul(24*60*60);

            let nextLoanId = (await poolContract.loansCount()).add(1);

            let requestLoanTx = await poolContract.connect(borrower1).requestLoan(loanAmount, loanDuration);
            let loanId = BigNumber.from((await requestLoanTx.wait()).events[0].data);

            let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;
            
            expect(loanId).to.equal(nextLoanId);

            let loan = await poolContract.loans(loanId);
            
            expect(loan.id).to.equal(loanId);
            expect(loan.borrower).to.equal(borrower1.address);
            expect(loan.amount).to.equal(loanAmount);
            expect(loan.duration).to.equal(loanDuration);
            expect(loan.requestedTime).to.equal(blockTimestamp);
            expect(loan.status).to.equal(LoanStatus.APPLIED);
        });
    });

    describe("Approve/Deny", function () {
        beforeEach(async function () {
            let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
            let loanDuration = BigNumber.from(365).mul(24*60*60);
            await poolContract.connect(borrower1).requestLoan(loanAmount, loanDuration);
        });

        it("Approve", async function () {
            let loanId = (await poolContract.borrowerStats(borrower1.address)).recentLoanId;
            await poolContract.connect(manager).approveLoan(loanId);
            let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

            expect((await poolContract.loans(loanId)).status).to.equal(LoanStatus.APPROVED);
            expect((await poolContract.loanDetails(loanId)).approvedTime).to.equal(blockTimestamp);
        });

        it("Deny", async function () {
            let loanId = (await poolContract.borrowerStats(borrower1.address)).recentLoanId;
            await poolContract.connect(manager).denyLoan(loanId);

            expect((await poolContract.loans(loanId)).status).to.equal(LoanStatus.DENIED);
        });
    });

    describe("Borrow/Cancel", function () {
        beforeEach(async function () {
            let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
            let loanDuration = BigNumber.from(365).mul(24*60*60);
            let requestLoanTx = await poolContract.connect(borrower1).requestLoan(loanAmount, loanDuration);
            let loanId = BigNumber.from((await requestLoanTx.wait()).events[0].data);
            await poolContract.connect(manager).approveLoan(loanId);
        });

        it("Borrow", async function () {
            let balanceBefore = await tokenContract.balanceOf(borrower1.address);

            let loanId = (await poolContract.borrowerStats(borrower1.address)).recentLoanId;
            await poolContract.connect(borrower1).borrow(loanId);

            let loan = await poolContract.loans(loanId);
            expect(loan.status).to.equal(LoanStatus.OUTSTANDING);

            expect(await tokenContract.balanceOf(borrower1.address)).to.equal(balanceBefore.add(loan.amount));
        });

        it("Amount Borrowed increases on borrow", async function () {
            let prevAmountBorrowed = (await poolContract.borrowerStats(borrower1.address)).amountBorrowed;

            let loanId = (await poolContract.borrowerStats(borrower1.address)).recentLoanId;
            await poolContract.connect(borrower1).borrow(loanId);

            let loan = await poolContract.loans(loanId);
            let stat = await poolContract.borrowerStats(borrower1.address);
            expect(stat.amountBorrowed).to.equal(prevAmountBorrowed.add(loan.amount));
        });

        it("Cancel", async function () {
            let loanId = (await poolContract.borrowerStats(borrower1.address)).recentLoanId;
            await poolContract.connect(manager).cancelLoan(loanId);

            expect((await poolContract.loans(loanId)).status).to.equal(LoanStatus.CANCELLED);
        });
    });

    describe("Repay/Default", function () {
        beforeEach(async function () {
            let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
            let loanDuration = BigNumber.from(365).mul(24*60*60);
            let requestLoanTx = await poolContract.connect(borrower1).requestLoan(loanAmount, loanDuration);
            let loanId = BigNumber.from((await requestLoanTx.wait()).events[0].data);
            await poolContract.connect(manager).approveLoan(loanId);
            await poolContract.connect(borrower1).borrow(loanId);
        });

        it("Repay (Partial)", async function () {
            let balanceBefore = await tokenContract.balanceOf(borrower1.address);

            let loanId = (await poolContract.borrowerStats(borrower1.address)).recentLoanId;
            let loan = await poolContract.loans(loanId);

            await ethers.provider.send('evm_increaseTime', [loan.duration.toNumber()]);
            await ethers.provider.send('evm_mine');

            let paymentAmount = (await poolContract.loanBalanceDue(loanId)).div(2);

            await tokenContract.connect(borrower1).approve(poolContract.address, paymentAmount);
            await poolContract.connect(borrower1).repay(loanId, paymentAmount);
            let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

            loan = await poolContract.loans(loanId);
            let loanDetail = await poolContract.loanDetails(loanId);
            expect(loanDetail.totalAmountRepaid).to.equal(paymentAmount);
            expect(loanDetail.lastPaymentTime).to.equal(blockTimestamp);
            expect(loan.status).to.equal(LoanStatus.OUTSTANDING);

            expect(await tokenContract.balanceOf(borrower1.address)).to.equal(balanceBefore.sub(paymentAmount));
        });

        it("Repay (Full)", async function () {
            let balanceBefore = await tokenContract.balanceOf(borrower1.address);

            let loanId = (await poolContract.borrowerStats(borrower1.address)).recentLoanId;
            let loan = await poolContract.loans(loanId);

            await ethers.provider.send('evm_increaseTime', [loan.duration.toNumber()]);
            await ethers.provider.send('evm_mine');

            let paymentAmount = (await poolContract.loanBalanceDue(loanId));

            await tokenContract.connect(borrower1).approve(poolContract.address, paymentAmount);
            await poolContract.connect(borrower1).repay(loanId, paymentAmount);
            let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

            let loanDetail = await poolContract.loanDetails(loanId);
            expect(loanDetail.totalAmountRepaid).to.equal(paymentAmount);
            expect(loanDetail.lastPaymentTime).to.equal(blockTimestamp);
            expect((await poolContract.loans(loanId)).status).to.equal(LoanStatus.REPAID);

            expect(await tokenContract.balanceOf(borrower1.address)).to.equal(balanceBefore.sub(paymentAmount));
        });

        it("Default (Partial)", async function () {
            let poolFundsBefore = await poolContract.poolFunds();
            let stakedBalanceBefore = await poolContract.balanceStaked();

            let loanId = (await poolContract.borrowerStats(borrower1.address)).recentLoanId;
            let paymentAmount = (await poolContract.loanBalanceDue(loanId)).div(2);
            await tokenContract.connect(borrower1).approve(poolContract.address, paymentAmount);
            await poolContract.connect(borrower1).repay(loanId, paymentAmount);

            let loan = await poolContract.loans(loanId);
            await ethers.provider.send('evm_increaseTime', [loan.duration.add(loan.gracePeriod).toNumber()]);
            await ethers.provider.send('evm_mine');
            
            expect(await poolContract.canDefault(loanId, manager.address)).to.equal(true);
            await poolContract.connect(manager).defaultLoan(loanId);

            loan = await poolContract.loans(loanId);
            let loanDetail = await poolContract.loanDetails(loanId);
            let lossAmount = loan.amount.sub(loanDetail.totalAmountRepaid);

            expect(loan.status).to.equal(LoanStatus.DEFAULTED);
            expect(await poolContract.poolFunds()).to.equal(poolFundsBefore.sub(lossAmount));
            expect(await poolContract.balanceStaked()).to.equal(stakedBalanceBefore.sub(lossAmount));
        });

        it("Default (Full)", async function () {
            let poolFundsBefore = await poolContract.poolFunds();
            let stakedBalanceBefore = await poolContract.balanceStaked();

            let loanId = (await poolContract.borrowerStats(borrower1.address)).recentLoanId;
            let loan = await poolContract.loans(loanId);
            await ethers.provider.send('evm_increaseTime', [loan.duration.add(loan.gracePeriod).toNumber()]);
            await ethers.provider.send('evm_mine');
            
            expect(await poolContract.canDefault(loanId, manager.address)).to.equal(true);
            await poolContract.connect(manager).defaultLoan(loanId);

            loan = await poolContract.loans(loanId);
            let loanDetail = await poolContract.loanDetails(loanId);
            let lossAmount = loan.amount.sub(loanDetail.totalAmountRepaid);
            expect(loan.status).to.equal(LoanStatus.DEFAULTED);
            expect(await poolContract.poolFunds()).to.equal(poolFundsBefore.sub(lossAmount));
            expect(await poolContract.balanceStaked()).to.equal(stakedBalanceBefore.sub(lossAmount));
        });
    });
  });