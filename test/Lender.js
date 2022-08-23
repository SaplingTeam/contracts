const { expect, assert } = require("chai");
const { BigNumber } = require("ethers");
const { ethers } = require("hardhat");

describe("Lender (SaplingPool)", function() {

    let TestUSDC;
    let tokenContract;

    let SaplingPool;
    let poolContract;
    let loanDesk;

    let manager;
    let protocol;
    let governance;
    let lender1;
    let lender2;
    let lender3;
    let borrower1;
    let borrower2;
    let addrs;

    let PERCENT_DECIMALS;
    let TOKEN_DECIMALS;
    let TOKEN_MULTIPLIER;

    const LoanApplicationStatus = {
        "NULL": 0,
        "APPLIED": 1,
        "DENIED": 2,
        "OFFER_MADE": 3,
        "OFFER_ACCEPTED": 4,
        "OFFER_CANCELLED": 5
      };

    const LoanStatus = {
        "NULL": 0,
        "OUTSTANDING": 1,
        "REPAID": 2,
        "DEFAULTED": 3,
      };

    beforeEach(async function () {
        [manager, protocol, governance, lender1, lender2, lender3, borrower1, borrower2, ...addrs] = await ethers.getSigners();

        TestUSDC = await ethers.getContractFactory("TestUSDC");
        SaplingPool = await ethers.getContractFactory("SaplingLendingPool");
        LoanDesk = await ethers.getContractFactory("LoanDesk");

        tokenContract = await TestUSDC.deploy();
        TOKEN_DECIMALS = await tokenContract.decimals();
        TOKEN_MULTIPLIER = BigNumber.from(10).pow(TOKEN_DECIMALS);

        let mintAmount = TOKEN_MULTIPLIER.mul(100000);

        await tokenContract.connect(manager).mint(manager.address, mintAmount);
        await tokenContract.connect(manager).mint(lender1.address, mintAmount);
        await tokenContract.connect(manager).mint(lender2.address, mintAmount);
        await tokenContract.connect(manager).mint(lender3.address, mintAmount);
        await tokenContract.connect(manager).mint(borrower1.address, mintAmount);

        let verificationHub = await (await ethers.getContractFactory("VerificationHub")).deploy(manager.address, protocol.address);

        let tokenFactory = await (await ethers.getContractFactory("TokenFactory")).deploy();
        let loanDeskFactory = await (await ethers.getContractFactory("LoanDeskFactory")).deploy();
        let poolFactory = await (await ethers.getContractFactory("PoolFactory")).deploy();

        let saplingFactory = await (await ethers.getContractFactory("SaplingFactory"))
            .deploy(tokenFactory.address, loanDeskFactory.address, poolFactory.address, verificationHub.address, governance.address, protocol.address);

        await tokenFactory.transferOwnership(saplingFactory.address);
        await loanDeskFactory.transferOwnership(saplingFactory.address);
        await poolFactory.transferOwnership(saplingFactory.address);
        await verificationHub.setSaplingFactory(saplingFactory.address);
        await verificationHub.transferGovernance(governance.address);

        let poolContractTx = await (await saplingFactory.connect(governance).createLendingPool("Test Pool", "TPT", manager.address, tokenContract.address)).wait();
        let poolAddress = poolContractTx.events.filter(e => e.event === 'PoolCreated')[0].args['pool'];
        poolContract = await SaplingPool.attach(poolAddress);
        let loanDeskAddress = await poolContract.loanDesk();
        loanDesk = await LoanDesk.attach(loanDeskAddress);

        PERCENT_DECIMALS = await poolContract.PERCENT_DECIMALS();

        let stakeAmount = BigNumber.from(2000).mul(TOKEN_MULTIPLIER);
        let depositAmount = BigNumber.from(10000).mul(TOKEN_MULTIPLIER);

        await tokenContract.connect(manager).approve(poolContract.address, stakeAmount);
        await poolContract.connect(manager).stake(stakeAmount);

        await tokenContract.connect(lender1).approve(poolContract.address, depositAmount);
        await poolContract.connect(lender1).deposit(depositAmount);
    });

    describe("Initial state", function () {
        it("Loan count is correct", async function () {
            expect(await poolContract.loansCount()).to.equal(0);
        });
    });

    describe("Loan Request", function () {

        let loanAmount;
        let loanDuration;

        beforeEach(async function () {
            loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
            loanDuration = BigNumber.from(365).mul(24*60*60);
        });

        it("Borrower can request a loan", async function () {
            // let nextApplicationId = (await poolContract.loansCount()).add(1);

            let requestLoanTx = await loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29");
            let applicationId = (await requestLoanTx.wait()).events.filter(e => e.event === 'LoanRequested')[0].args.applicationId;

            let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

            let loanApplication = await loanDesk.loanApplications(applicationId);
            
            expect(loanApplication.id).to.equal(applicationId);
            expect(loanApplication.borrower).to.equal(borrower1.address);
            expect(loanApplication.amount).to.equal(loanAmount);
            expect(loanApplication.duration).to.equal(loanDuration);
            expect(loanApplication.requestedTime).to.equal(blockTimestamp);
            expect(loanApplication.status).to.equal(LoanApplicationStatus.APPLIED);
        });

        it("Can view most recent applicationId by address", async function () {
            let requestLoanTx = await loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29");
            let applicationId = (await requestLoanTx.wait()).events.filter(e => e.event === 'LoanRequested')[0].args.applicationId;
            expect((await loanDesk.borrowerStats(borrower1.address)).recentApplicationId).to.equal(applicationId);
        });

        describe("Rejection scenarios", function () {

            it ("Requesting a loan with an amount less than the minimum should fail", async function () {            
                let minAmount = await loanDesk.minLoanAmount();
                await expect(
                    loanDesk.connect(borrower1).requestLoan(minAmount.sub(1), loanDuration, "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29")
                    ).to.be.reverted;
            });

            it ("Requesting a loan with a duration less than the minimum should fail", async function () {            
                let minDuration = await loanDesk.minLoanDuration();
                await expect(
                    loanDesk.connect(borrower1).requestLoan(loanAmount, minDuration.sub(1), "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29")
                    ).to.be.reverted;
            });

            it ("Requesting a loan with a duration greater than the maximum should fail", async function () {            
                let maxDuration = await loanDesk.maxLoanDuration();
                await expect(
                    loanDesk.connect(borrower1).requestLoan(loanAmount, maxDuration.add(1), "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29")
                ).to.be.reverted;
            });

            it("Requesting a loan should fail while another application from the same borrower is pending approval", async function () {
                await loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29");
                await expect(
                    loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29")
                ).to.be.reverted;
            });

            it ("Requesting a loan when the loan desk is paused should fail", async function () {            
                await loanDesk.connect(governance).pause();
                await expect(
                    loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29")
                ).to.be.reverted;
            });

            it ("Requesting a loan when the loan desk is closed should fail", async function () {            
                await loanDesk.connect(manager).close();
                await expect(
                    loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29")
                ).to.be.reverted;
            });

            it ("Requesting a loan as the manager should fail", async function () {
                await expect(
                    loanDesk.connect(manager).requestLoan(loanAmount, loanDuration, "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29")
                ).to.be.reverted;
            });

            it ("Requesting a loan as the protocol should fail", async function () {
                await expect(
                    loanDesk.connect(protocol).requestLoan(loanAmount, loanDuration, "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29")
                ).to.be.reverted;
            });

            it ("Requesting a loan as the governance should fail", async function () {
                await expect(
                    loanDesk.connect(governance).requestLoan(loanAmount, loanDuration, "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29")
                ).to.be.reverted;
            });
        });

        describe("Borrower Statistics", function () {
            it("Loan requests increments all time request count", async function () {
                let prevCountRequested = (await loanDesk.borrowerStats(borrower1.address)).countRequested;
    
                await loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29");
                
                expect((await loanDesk.borrowerStats(borrower1.address)).countRequested).to.equal(prevCountRequested.add(1));
            });
        });
    });

    describe("Approve/Deny Loans", function () {

        let gracePeriod;
        let installments;
        let apr;
        let applicationId;
        let application;

        beforeEach(async function () {
            gracePeriod = await loanDesk.templateLoanGracePeriod();
            installments = 1;
            apr = await loanDesk.templateLoanAPR();

            let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
            let loanDuration = BigNumber.from(365).mul(24*60*60);
            await loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29");
            applicationId = (await loanDesk.borrowerStats(borrower1.address)).recentApplicationId;
            application = await loanDesk.loanApplications(applicationId);
        });

        describe("Offer", function () {
            it("Manager can offer loans", async function () {
                expect(await poolContract.canOffer(applicationId)).to.equal(true);

                await loanDesk.connect(manager).offerLoan(applicationId, application.amount, application.duration, gracePeriod, 0, installments, apr);
                let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;
    
                expect((await loanDesk.loanApplications(applicationId)).status).to.equal(LoanApplicationStatus.OFFER_MADE);
                expect((await loanDesk.loanOffers(applicationId)).offeredTime).to.equal(blockTimestamp);
            });

            describe("Rejection scenarios", function () {
                it ("Offering a loan that is not in APPLIED status should fail", async function () {            
                    await loanDesk.connect(manager).offerLoan(applicationId, application.amount, application.duration, gracePeriod, 0, installments, apr);
                    await expect(loanDesk.connect(manager).offerLoan(applicationId, application.amount, application.duration, gracePeriod, 0, installments, apr)).to.be.reverted;
                });

                it ("Offering a loan with an amount greater than available liquidity should fail", async function () {        
                    let poolLiquidity = await poolContract.poolLiquidity();
                    let poolFunds = await poolContract.poolFunds();
                    let targetLiquidityPercent = await poolContract.targetLiquidityPercent();
                    let ONE_HUNDRED_PERCENT = await poolContract.ONE_HUNDRED_PERCENT();
        
                    let amountBorrowable = poolLiquidity.sub(poolFunds.mul(targetLiquidityPercent).div(ONE_HUNDRED_PERCENT));
                    let loanDuration = BigNumber.from(365).mul(24*60*60);
        
                    await loanDesk.connect(borrower2).requestLoan(amountBorrowable.add(1), loanDuration, "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29");
                    let otherApplicationId = (await loanDesk.borrowerStats(borrower2.address)).recentApplicationId;
                    let otherApplication = await loanDesk.loanApplications(otherApplicationId);
        
                    await expect(loanDesk.connect(manager).offerLoan(otherApplicationId, otherApplication.amount, otherApplication.duration, gracePeriod, 0, installments, apr)).to.be.reverted;
                });
        
                it ("Offering a loan while pool stake is insufficient should fail", async function () {   
                    let amountStaked = await poolContract.balanceStaked();
        
                    // request a loan with amount equal to 75% of the current stake and default it
                    let loanAmount = amountStaked.mul(75).div(100);
                    let loanDuration = BigNumber.from(365).mul(24*60*60);
        
                    await loanDesk.connect(borrower2).requestLoan(loanAmount, loanDuration, "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29");
                    let otherApplicationId = (await loanDesk.borrowerStats(borrower2.address)).recentApplicationId;
                    let otherApplication = await loanDesk.loanApplications(otherApplicationId);

                    await loanDesk.connect(manager).offerLoan(otherApplicationId, otherApplication.amount, otherApplication.duration, gracePeriod, 0, installments, apr);

                    await poolContract.connect(borrower2).borrow(otherApplicationId);

                    let otherLoanId = (await poolContract.borrowerStats(borrower2.address)).recentLoanId;
                    let loan = await poolContract.loans(otherLoanId);
                    await ethers.provider.send('evm_increaseTime', [loan.duration.add(loan.gracePeriod).toNumber()]);
                    await ethers.provider.send('evm_mine');
                    
                    await poolContract.connect(manager).defaultLoan(otherLoanId);
        
                    await expect(loanDesk.connect(manager).offerLoan(applicationId, application.amount, application.duration, gracePeriod, 0, installments, apr)).to.be.reverted;
                });

                /*
                it ("Offering a loan when lending is paused should fail", async function () {
                    await poolContract.connect(manager).pauseLending();
                    await expect(loanDesk.connect(manager).offerLoan(applicationId, application.amount, application.duration, gracePeriod, 0, installments, apr)).to.be.reverted;
                });
                */
        
                it ("Offering a loan when the pool is paused should fail", async function () {            
                    await loanDesk.connect(governance).pause();
                    await expect(loanDesk.connect(manager).offerLoan(applicationId, application.amount, application.duration, gracePeriod, 0, installments, apr)).to.be.reverted;
                });
        
                it ("Offering a loan when the pool is closed should fail", async function () {            
                    await loanDesk.connect(manager).close();
                    await expect(loanDesk.connect(manager).offerLoan(applicationId, application.amount, application.duration, gracePeriod, 0, installments, apr)).to.be.reverted;
                });

                it ("Offering a nonexistent loan should fail", async function () {
                    await expect(loanDesk.connect(manager).offerLoan(applicationId.add(1), application.amount, application.duration, gracePeriod, 0, installments, apr)).to.be.reverted;
                });
        
                it ("Offering a loan as the protocol should fail", async function () {
                    await expect(loanDesk.connect(protocol).offerLoan(applicationId, application.amount, application.duration, gracePeriod, 0, installments, apr)).to.be.reverted;
                });
        
                it ("Offering a loan as the governance should fail", async function () {
                    await expect(loanDesk.connect(governance).offerLoan(applicationId, application.amount, application.duration, gracePeriod, 0, installments, apr)).to.be.reverted;
                });
        
                it ("Offering a loan as a lender should fail", async function () {
                    await expect(loanDesk.connect(lender1).offerLoan(applicationId, application.amount, application.duration, gracePeriod, 0, installments, apr)).to.be.reverted;
                });
        
                it ("Offering a loan as the borrower should fail", async function () {
                    await expect(loanDesk.connect(borrower1).offerLoan(applicationId, application.amount, application.duration, gracePeriod, 0, installments, apr)).to.be.reverted;
                });
        
                it ("Offering a loan from an unrelated address should fail", async function () {
                    await expect(loanDesk.connect(addrs[0]).offerLoan(applicationId, application.amount, application.duration, gracePeriod, 0, installments, apr)).to.be.reverted;
                });
            });

            describe("Borrower Statistics", function () {
                it("Loan approval increments all time approval count", async function () {
                    let prevStat = await loanDesk.borrowerStats(borrower1.address);
                    
                    await loanDesk.connect(manager).offerLoan(applicationId, application.amount, application.duration, gracePeriod, 0, installments, apr)
        
                    let stat = await loanDesk.borrowerStats(borrower1.address);
        
                    expect(stat.countOffered).to.equal(prevStat.countOffered.add(1));
                });
            });
        });

        describe("Deny", function () {
            it("manager can deny loans", async function () {
                await loanDesk.connect(manager).denyLoan(applicationId);
                expect((await loanDesk.loanApplications(applicationId)).status).to.equal(LoanApplicationStatus.DENIED);
            });

            describe("Rejection scenarios", function () {
                it ("Denying a loan that is not in APPLIED status should fail", async function () {            
                    await loanDesk.connect(manager).offerLoan(applicationId, application.amount, application.duration, gracePeriod, 0, installments, apr);
                    await expect(loanDesk.connect(manager).denyLoan(applicationId)).to.be.reverted;
                });
        
                it ("Denying a nonexistent loan should fail", async function () {
                    await expect(loanDesk.connect(manager).denyLoan(applicationId.add(1))).to.be.reverted;
                });
        
                it ("Denying a loan as the protocol should fail", async function () {
                    await expect(loanDesk.connect(protocol).denyLoan(applicationId)).to.be.reverted;
                });
        
                it ("Denying a loan as the governance should fail", async function () {
                    await expect(loanDesk.connect(governance).denyLoan(applicationId)).to.be.reverted;
                });
        
                it ("Denying a loan as a lender should fail", async function () {
                    await expect(loanDesk.connect(lender1).denyLoan(applicationId)).to.be.reverted;
                });
        
                it ("Denying a loan as the borrower should fail", async function () {
                    await expect(loanDesk.connect(borrower1).denyLoan(applicationId)).to.be.reverted;
                });
        
                it ("Denying a loan from an unrelated address should fail", async function () {
                    await expect(loanDesk.connect(addrs[0]).denyLoan(applicationId)).to.be.reverted;
                });
            });

            describe("Borrower Statistics", function () {
                it("Loan Denial increments all time deny count", async function () {
                    let prevStat = await loanDesk.borrowerStats(borrower1.address);
                    
                    await loanDesk.connect(manager).denyLoan(applicationId);
        
                    let stat = await loanDesk.borrowerStats(borrower1.address);
        
                    expect(stat.countDenied).to.equal(prevStat.countDenied.add(1));
                });
            });
        });
    });

    describe("Borrow/Cancel Loans", function () {

        let gracePeriod;
        let installments;
        let apr;
        let applicationId;
        let application;

        beforeEach(async function () {
            gracePeriod = await loanDesk.templateLoanGracePeriod();
            installments = 1;
            apr = await loanDesk.templateLoanAPR();

            let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
            let loanDuration = BigNumber.from(365).mul(24*60*60);
            await loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29");
            applicationId = (await loanDesk.borrowerStats(borrower1.address)).recentApplicationId;
            application = await loanDesk.loanApplications(applicationId);
            await loanDesk.connect(manager).offerLoan(applicationId, application.amount, application.duration, gracePeriod, 0, installments, apr);
        });

        describe("Borrow", function () {
            it("Borrowers can borrow", async function () {
                let balanceBefore = await tokenContract.balanceOf(borrower1.address);
    
                await poolContract.connect(borrower1).borrow(applicationId);
                let loanId = (await poolContract.borrowerStats(borrower1.address)).recentLoanId;
    
                let loan = await poolContract.loans(loanId);
                expect(loan.status).to.equal(LoanStatus.OUTSTANDING);
    
                expect(await tokenContract.balanceOf(borrower1.address)).to.equal(balanceBefore.add(loan.amount));
            });

            describe("Rejection scenarios", function () {

                it ("Borrowing a loan that is not in APPROVED status should fail", async function () {
                    await loanDesk.connect(manager).cancelLoan(applicationId);
                    await expect(poolContract.connect(borrower1).borrow(applicationId)).to.be.reverted;
                });
        
                it ("Borrowing a loan when the pool is paused should fail", async function () {            
                    await poolContract.connect(governance).pause();
                    await expect(poolContract.connect(borrower1).borrow(applicationId)).to.be.reverted;
                });
        
                it ("Borrowing a nonexistent loan should fail", async function () {
                    await expect(poolContract.connect(lender1).borrow(applicationId.add(1))).to.be.reverted;
                });
        
                it ("Borrowing a loan as the protocol should fail", async function () {
                    await expect(poolContract.connect(protocol).borrow(applicationId)).to.be.reverted;
                });
        
                it ("Borrowing a loan as the governance should fail", async function () {
                    await expect(poolContract.connect(governance).borrow(applicationId)).to.be.reverted;
                });
        
                it ("Borrowing a loan as a lender should fail", async function () {
                    await expect(poolContract.connect(lender1).borrow(applicationId)).to.be.reverted;
                });
        
                it ("Borrowing a loan from an unrelated address should fail", async function () {
                    await expect(poolContract.connect(addrs[0]).borrow(applicationId)).to.be.reverted;
                });
            });

            describe("Borrower Statistics", function () {
                it("Borrowing a loan increases amount borrowed", async function () {
                    let prevAmountBorrowed = (await poolContract.borrowerStats(borrower1.address)).amountBorrowed;
        
                    await poolContract.connect(borrower1).borrow(applicationId);
                    let loanId = (await poolContract.borrowerStats(borrower1.address)).recentLoanId;

                    let loan = await poolContract.loans(loanId);
                    let stat = await poolContract.borrowerStats(borrower1.address);
                    expect(stat.amountBorrowed).to.equal(prevAmountBorrowed.add(loan.amount));
                });

                it("Borrowing a loan increments outstanding loan count", async function () {
                    let prevStat = await poolContract.borrowerStats(borrower1.address);
                    
                    await poolContract.connect(borrower1).borrow(applicationId);
        
                    let stat = await poolContract.borrowerStats(borrower1.address);
                    expect(stat.countOutstanding).to.equal(prevStat.countOutstanding.add(1));
                });
            });
        });

        describe("Cancel", function () {

            it("Manager can cancel", async function () {
                expect(await loanDesk.canCancel(applicationId, manager.address)).to.equal(true);
                await loanDesk.connect(manager).cancelLoan(applicationId);
                expect((await loanDesk.loanApplications(applicationId)).status).to.equal(LoanApplicationStatus.OFFER_CANCELLED);
            });

            it("Manager can cancel while other loans are present (Updating weighted avg loan APR", async function () {
                let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
                let loanDuration = BigNumber.from(365).mul(24*60*60);
                let requestLoanTx = await loanDesk.connect(borrower2).requestLoan(loanAmount, loanDuration, "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29");
                let otherApplicationId = BigNumber.from((await requestLoanTx.wait()).events[0].data);

                let otherApplication = await loanDesk.loanApplications(otherApplicationId);
                await loanDesk.connect(manager).offerLoan(otherApplicationId, otherApplication.amount, otherApplication.duration, gracePeriod, 0, installments, apr);

                await loanDesk.connect(manager).cancelLoan(applicationId);
                expect((await loanDesk.loanApplications(applicationId)).status).to.equal(LoanApplicationStatus.OFFER_CANCELLED);
            });
    
            describe("Rejection scenarios", function () {
                it ("Cancelling a loan that is not in APPROVED status should fail", async function () {
                    await poolContract.connect(borrower1).borrow(applicationId);

                    expect(await loanDesk.canCancel(applicationId, manager.address)).to.equal(false);
                    await expect(loanDesk.connect(manager).cancelLoan(applicationId)).to.be.reverted;
                });
        
                it ("Cancelling a nonexistent loan should fail", async function () {
                    expect(await loanDesk.canCancel(applicationId.add(1), manager.address)).to.equal(false);
                    await expect(loanDesk.connect(manager).cancelLoan(applicationId.add(1))).to.be.reverted;
                });
        
                it ("Cancelling a loan as the protocol should fail", async function () {
                    expect(await loanDesk.canCancel(applicationId, protocol.address)).to.equal(false);
                    await expect(loanDesk.connect(protocol).cancelLoan(applicationId)).to.be.reverted;
                });
        
                it ("Cancelling a loan as the governance should fail", async function () {
                    expect(await loanDesk.canCancel(applicationId, governance.address)).to.equal(false);
                    await expect(loanDesk.connect(governance).cancelLoan(applicationId)).to.be.reverted;
                });
        
                it ("Cancelling a loan as a lender should fail", async function () {
                    expect(await loanDesk.canCancel(applicationId, lender1.address)).to.equal(false);
                    await expect(loanDesk.connect(lender1).cancelLoan(applicationId)).to.be.reverted;
                });
        
                it ("Cancelling a loan as the borrower should fail", async function () {
                    expect(await loanDesk.canCancel(applicationId, borrower1.address)).to.equal(false);
                    await expect(loanDesk.connect(borrower1).cancelLoan(applicationId)).to.be.reverted;
                });
        
                it ("Cancelling a loan from an unrelated address should fail", async function () {
                    expect(await loanDesk.canCancel(applicationId, addrs[0].address)).to.equal(false);
                    await expect(loanDesk.connect(addrs[0]).cancelLoan(applicationId)).to.be.reverted;
                });
            });
    
            describe("Cancelling a loan on inactive manager", function () {
                beforeEach(async function () {
                    let inactivityPeriod = await poolContract.MANAGER_INACTIVITY_GRACE_PERIOD();
                    let skipTime = Math.max(inactivityPeriod, 0) + 1;
    
                    let depositAmount = BigNumber.from(1).mul(TOKEN_MULTIPLIER).div(2);
                    await tokenContract.connect(lender2).approve(poolContract.address, depositAmount);
                    await poolContract.connect(lender2).deposit(depositAmount);
    
                    await ethers.provider.send('evm_increaseTime', [skipTime]);
                    await ethers.provider.send('evm_mine');
                });

                it ("Protocol can cancel", async function () {
                    expect(await loanDesk.canCancel(applicationId, protocol.address)).to.equal(true);
                    await expect(loanDesk.connect(protocol).cancelLoan(applicationId)).to.be.ok;
                });
        
                it ("Governance can cancel", async function () {
                    expect(await loanDesk.canCancel(applicationId, governance.address)).to.equal(true);
                    await expect(loanDesk.connect(governance).cancelLoan(applicationId)).to.be.ok;
                });
        
                /*
                it ("Long term lender can cancel", async function () {
                    expect(await loanDesk.canCancel(applicationId, lender1.address)).to.equal(true);
                    await expect(loanDesk.connect(lender1).cancelLoan(applicationId)).to.be.ok;
                });
                */

                describe("Rejection scenarios", function () {
    
                    it ("A lender without sufficient balance can't cancel", async function () {
                        expect(await loanDesk.canCancel(applicationId, lender2.address)).to.equal(false);
                        await expect(loanDesk.connect(lender2).cancelLoan(applicationId)).to.be.reverted;
                    });
            
                    it ("Borrower can't cancel", async function () {
                        expect(await loanDesk.canCancel(applicationId, borrower1.address)).to.equal(false);
                        await expect(loanDesk.connect(borrower1).cancelLoan(applicationId)).to.be.reverted;
                    });
            
                    it ("An unrelated address can't cancel", async function () {
                        expect(await loanDesk.canCancel(applicationId, addrs[0].address)).to.equal(false);
                        await expect(loanDesk.connect(addrs[0]).cancelLoan(applicationId)).to.be.reverted;
                    });
                });
            });
    
            describe("Borrower Statistics", function () {
    
                it("Cancelling a loan increments all time cancel count", async function () {
                    let prevStat = await loanDesk.borrowerStats(borrower1.address);
                    
                    await loanDesk.connect(manager).cancelLoan(applicationId);
        
                    let stat = await loanDesk.borrowerStats(borrower1.address);
        
                    expect(stat.countCancelled).to.equal(prevStat.countCancelled.add(1));
                });
            });
        });
    });

    describe("Repay/Default Loans", function () {

        let loanId;
        let loanAmount;
        let loanDuration;

        beforeEach(async function () {
            loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
            loanDuration = BigNumber.from(365).mul(24*60*60);

            await loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29");
            let applicationId = (await loanDesk.borrowerStats(borrower1.address)).recentApplicationId;
            let gracePeriod = await loanDesk.templateLoanGracePeriod();
            let installments = 1;
            let apr = await loanDesk.templateLoanAPR();
            await loanDesk.connect(manager).offerLoan(applicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);
        
            await poolContract.connect(borrower1).borrow(applicationId);
            loanId = (await poolContract.borrowerStats(borrower1.address)).recentLoanId;
        });

        describe("Repay", function () {
            it("Borrower can do a partial payment", async function () {
                let balanceBefore = await tokenContract.balanceOf(borrower1.address);
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

            it("Borrower can do full payments", async function () {
                let balanceBefore = await tokenContract.balanceOf(borrower1.address);
                let loan = await poolContract.loans(loanId);
    
                await ethers.provider.send('evm_increaseTime', [loan.duration.toNumber()]);
                await ethers.provider.send('evm_mine');
    
                let paymentAmount = await poolContract.loanBalanceDue(loanId);
    
                await tokenContract.connect(borrower1).approve(poolContract.address, paymentAmount);
                await poolContract.connect(borrower1).repay(loanId, paymentAmount);
                let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;
    
                let loanDetail = await poolContract.loanDetails(loanId);
                expect(loanDetail.totalAmountRepaid).to.equal(paymentAmount);
                expect(loanDetail.lastPaymentTime).to.equal(blockTimestamp);
                expect((await poolContract.loans(loanId)).status).to.equal(LoanStatus.REPAID);
                expect(await poolContract.loanBalanceDue(loanId)).to.equal(0);
    
                expect(await tokenContract.balanceOf(borrower1.address)).to.equal(balanceBefore.sub(paymentAmount));
            });

            it("3rd party can do a partial payment on behalf of the borrower", async function () {
                let balanceBefore = await tokenContract.balanceOf(lender3.address);
                let loan = await poolContract.loans(loanId);
    
                await ethers.provider.send('evm_increaseTime', [loan.duration.toNumber()]);
                await ethers.provider.send('evm_mine');
    
                let paymentAmount = (await poolContract.loanBalanceDue(loanId)).div(2);
    
                await tokenContract.connect(lender3).approve(poolContract.address, paymentAmount);
                await poolContract.connect(lender3).repayOnBehalf(loanId, paymentAmount, borrower1.address);
                let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;
    
                loan = await poolContract.loans(loanId);
                let loanDetail = await poolContract.loanDetails(loanId);
                expect(loanDetail.totalAmountRepaid).to.equal(paymentAmount);
                expect(loanDetail.lastPaymentTime).to.equal(blockTimestamp);
                expect(loan.status).to.equal(LoanStatus.OUTSTANDING);
    
                expect(await tokenContract.balanceOf(lender3.address)).to.equal(balanceBefore.sub(paymentAmount));
            });

            it("3rd party can do full payments on behalf of the borrower", async function () {
                let balanceBefore = await tokenContract.balanceOf(lender3.address);
                let loan = await poolContract.loans(loanId);
    
                await ethers.provider.send('evm_increaseTime', [loan.duration.toNumber()]);
                await ethers.provider.send('evm_mine');
    
                let paymentAmount = await poolContract.loanBalanceDue(loanId);
    
                await tokenContract.connect(lender3).approve(poolContract.address, paymentAmount);
                await poolContract.connect(lender3).repayOnBehalf(loanId, paymentAmount, borrower1.address);
                let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;
    
                let loanDetail = await poolContract.loanDetails(loanId);
                expect(loanDetail.totalAmountRepaid).to.equal(paymentAmount);
                expect(loanDetail.lastPaymentTime).to.equal(blockTimestamp);
                expect((await poolContract.loans(loanId)).status).to.equal(LoanStatus.REPAID);
    
                expect(await tokenContract.balanceOf(lender3.address)).to.equal(balanceBefore.sub(paymentAmount));
            });
    
            it("Repaying a loan will allocate protocol fees to the protocol", async function () {
                let balanceBefore = await poolContract.protocolEarningsOf(protocol.address);
                let loan = await poolContract.loans(loanId);
    
                await ethers.provider.send('evm_increaseTime', [loan.duration.toNumber()]);
                await ethers.provider.send('evm_mine');
    
                let paymentAmount = await poolContract.loanBalanceDue(loanId);
    
                await tokenContract.connect(borrower1).approve(poolContract.address, paymentAmount);
                await poolContract.connect(borrower1).repay(loanId, paymentAmount);
    
                let loanDetail = await poolContract.loanDetails(loanId);
                let protocolEarningPercent = await poolContract.protocolEarningPercent();
                let ONE_HUNDRED_PERCENT = await poolContract.ONE_HUNDRED_PERCENT();
    
                let expectedProtocolFee = loanDetail.interestPaid.mul(protocolEarningPercent).div(ONE_HUNDRED_PERCENT);
                expect(await poolContract.protocolEarningsOf(protocol.address)).to.equal(balanceBefore.add(expectedProtocolFee));
            });
    
            it("Repaying a loan will allocate protocol fees to the manager", async function () {
                let balanceBefore = await poolContract.protocolEarningsOf(manager.address);
                let loan = await poolContract.loans(loanId);
    
                await ethers.provider.send('evm_increaseTime', [loan.duration.toNumber()]);
                await ethers.provider.send('evm_mine');
    
                let paymentAmount = await poolContract.loanBalanceDue(loanId);
    
                await tokenContract.connect(borrower1).approve(poolContract.address, paymentAmount);
                await poolContract.connect(borrower1).repay(loanId, paymentAmount);
    
                let loanDetail = await poolContract.loanDetails(loanId);
                let protocolEarningPercent = await poolContract.protocolEarningPercent();
                let ONE_HUNDRED_PERCENT = await poolContract.ONE_HUNDRED_PERCENT();
    
                let expectedProtocolFee = loanDetail.interestPaid.mul(protocolEarningPercent).div(ONE_HUNDRED_PERCENT);
    
                let stakedShares = await poolContract.stakedShares();
                let totalPoolShares = await poolContract.totalPoolShares();
                let managerExcessLeverageComponent = (await poolContract.managerEarnFactor()) - ONE_HUNDRED_PERCENT;
    
                let currentStakePercent = stakedShares.mul(ONE_HUNDRED_PERCENT).div(totalPoolShares);
                let managerEarningsPercent = currentStakePercent.mul(managerExcessLeverageComponent).div(ONE_HUNDRED_PERCENT);
                let managerEarnedInterest = loanDetail.interestPaid.sub(expectedProtocolFee).mul(managerEarningsPercent).div(ONE_HUNDRED_PERCENT);
    
                expect(await poolContract.protocolEarningsOf(manager.address)).to.equal(balanceBefore.add(managerEarnedInterest));
            });

            it ("Overpaying a loan should only charge up to total amount due", async function () {
                let prevWalletBalance = await tokenContract.balanceOf(borrower1.address);
    
                let loanBalanceDue = await poolContract.loanBalanceDue(loanId);
                let paymentAmount = loanBalanceDue.add(BigNumber.from(500).mul(TOKEN_MULTIPLIER));
    
                await tokenContract.connect(borrower1).approve(poolContract.address, paymentAmount);
                await poolContract.connect(borrower1).repay(loanId, paymentAmount);
    
                let walletBalance = await tokenContract.balanceOf(borrower1.address);
    
                expect(walletBalance).to.equal(prevWalletBalance.sub(loanBalanceDue));
            });

            it("Borrower can do a payment with amount less than the required minimum but equal to outstanding balance", async function () {
                let loan = await poolContract.loans(loanId);
    
                await ethers.provider.send('evm_increaseTime', [loan.duration.toNumber()]);
                await ethers.provider.send('evm_mine');
    
                let paymentAmount2 = (await poolContract.ONE_TOKEN()).sub(1);
                let paymentAmount1 = (await poolContract.loanBalanceDue(loanId)).sub(paymentAmount2);
    
                await tokenContract.connect(borrower1).approve(poolContract.address, paymentAmount1.add(paymentAmount2));
                await poolContract.connect(borrower1).repay(loanId, paymentAmount1);

                await expect(poolContract.connect(borrower1).repay(loanId, paymentAmount2)).to.be.ok;

                await ethers.provider.send('evm_mine');
                
                loan = await poolContract.loans(loanId);
                expect(loan.status).to.equal(LoanStatus.REPAID);
            });

            describe("Rejection scenarios", function () {
                it ("Repaying a less than minimum payment amount on a loan with a greater outstanding balance should fail", async function () {
                    let paymentAmount = (await poolContract.ONE_TOKEN()).sub(1);
                    let balanceDue = await poolContract.loanBalanceDue(loanId);

                    assert(balanceDue.gt(paymentAmount));

                    await tokenContract.connect(borrower1).approve(poolContract.address, paymentAmount);
                    await expect(poolContract.connect(protocol).repay(loanId, paymentAmount)).to.be.reverted;
                });

                it("Repaying less than the outstanding balance on a loan with balance less than the minimum required should fail", async function () {
                    let loan = await poolContract.loans(loanId);
        
                    await ethers.provider.send('evm_increaseTime', [loan.duration.toNumber()]);
                    await ethers.provider.send('evm_mine');
        
                    let paymentAmount2 = (await poolContract.ONE_TOKEN()).sub(1);
                    let paymentAmount1 = (await poolContract.loanBalanceDue(loanId)).sub(paymentAmount2);
        
                    await tokenContract.connect(borrower1).approve(poolContract.address, paymentAmount1.add(paymentAmount2));
                    await poolContract.connect(borrower1).repay(loanId, paymentAmount1);

                    await expect(poolContract.connect(borrower1).repay(loanId, paymentAmount2.sub(1))).to.be.reverted;
                });

                it ("Repaying a loan that is not in OUTSTANDING status should fail", async function () {
                    let paymentAmount = await poolContract.loanBalanceDue(loanId);
    
                    await tokenContract.connect(borrower1).approve(poolContract.address, paymentAmount);
                    await poolContract.connect(borrower1).repay(loanId, paymentAmount);        
                    expect((await poolContract.loans(loanId)).status).to.equal(LoanStatus.REPAID);

                    await tokenContract.connect(borrower1).approve(poolContract.address, loanAmount);
                    await expect(poolContract.connect(borrower1).repay(loanId, paymentAmount)).to.be.reverted;
                });
        
                it ("Repaying a nonexistent loan should fail", async function () {
                    await tokenContract.connect(borrower1).approve(poolContract.address, loanAmount);
                    await expect(poolContract.connect(borrower1).repay(loanId.add(1), loanAmount)).to.be.reverted;
                });
        
                it ("Repaying a loan as the protocol should fail", async function () {
                    let paymentAmount = BigNumber.from(100).mul(TOKEN_MULTIPLIER);
                    await tokenContract.connect(manager).transfer(protocol.address, paymentAmount);
                    await tokenContract.connect(protocol).approve(poolContract.address, paymentAmount);
                    await expect(poolContract.connect(protocol).repay(loanId, paymentAmount)).to.be.reverted;
                });
        
                it ("Repaying a loan as the governance should fail", async function () {
                    let paymentAmount = BigNumber.from(100).mul(TOKEN_MULTIPLIER);
                    await tokenContract.connect(manager).transfer(governance.address, paymentAmount);
                    await tokenContract.connect(governance).approve(poolContract.address, paymentAmount);
                    await expect(poolContract.connect(governance).repay(loanId, paymentAmount)).to.be.reverted;
                });
        
                it ("Repaying a loan from an unrelated address should fail", async function () {
                    let paymentAmount = BigNumber.from(100).mul(TOKEN_MULTIPLIER);
                    await tokenContract.connect(manager).transfer(addrs[0].address, paymentAmount);
                    await tokenContract.connect(addrs[0]).approve(poolContract.address, paymentAmount);
                    await expect(poolContract.connect(addrs[0]).repay(loanId, paymentAmount)).to.be.reverted;
                });

                it ("Repaying a loan on behalf of a wrong borrower should fail", async function () {
                    await tokenContract.connect(lender3).approve(poolContract.address, loanAmount);
                    await expect(poolContract.connect(lender3).repayOnBehalf(loanId, loanAmount, borrower2.address)).to.be.reverted;
                });
            });

            describe("Borrower Statistics", function () {

                describe("On Full Repay", function () {

                    let prevStat;
                    let prevLoanDetail;
                    let stat;
                    let loanDetail;

                    beforeEach(async function () {
                        await ethers.provider.send('evm_increaseTime', [365*24*60*60]);
                        await ethers.provider.send('evm_mine');
    
                        prevStat = await poolContract.borrowerStats(borrower1.address);
                        let loanId = prevStat.recentLoanId;
    
                        prevLoanDetail = await poolContract.loanDetails(loanId);
                        let paymentAmount = await poolContract.loanBalanceDue(loanId);
        
                        await tokenContract.connect(borrower1).approve(poolContract.address, paymentAmount);
                        await poolContract.connect(borrower1).repay(loanId, paymentAmount);
    
                        stat = await poolContract.borrowerStats(borrower1.address);
                        loanDetail = await poolContract.loanDetails(loanId);
                    });
    
                    it("Fully repaying a loan increments all time repay count", async function () {
                        expect(stat.countRepaid).to.equal(prevStat.countRepaid.add(1));
                    });
        
                    it("Fully repaying a loan decrements outstanding loan count", async function () {
                        expect(stat.countOutstanding).to.equal(prevStat.countOutstanding.sub(1));
                    });
    
                    it("Fully repaying a loan negates the effect of current loan amount on the statistics", async function () {
                        expect(stat.amountBorrowed).to.equal(prevStat.amountBorrowed.sub(loanDetail.baseAmountRepaid));
                    });
    
                    it("Fully repaying a loan negates the effect of current paid base amount stat on the statistics", async function () {
                        expect(stat.amountBaseRepaid).to.equal(prevStat.amountBaseRepaid);
                    });
    
                    it("Fully repaying a loan negates the effect of current paid interest amount on the statistics", async function () {
                        expect(stat.amountInterestPaid).to.equal(prevStat.amountInterestPaid);
                    });
                });
    
                describe("On Partial Repay", function () {

                    let prevStat;
                    let prevLoanDetail;
                    let stat;
                    let loanDetail;

                    beforeEach(async function () {
                        await ethers.provider.send('evm_increaseTime', [183*24*60*60]);
                        await ethers.provider.send('evm_mine');
    
                        prevStat = await poolContract.borrowerStats(borrower1.address);
                        let loanId = prevStat.recentLoanId;
    
                        prevLoanDetail = await poolContract.loanDetails(loanId);
                        let paymentAmount = (await poolContract.loanBalanceDue(loanId)).div(2);
        
                        await tokenContract.connect(borrower1).approve(poolContract.address, paymentAmount);
                        await poolContract.connect(borrower1).repay(loanId, paymentAmount);
    
                        stat = await poolContract.borrowerStats(borrower1.address);
                        loanDetail = await poolContract.loanDetails(loanId);
                    });
    
                    it("Partial loan payments do not change all time repaid loan count", async function () {
                        expect(stat.countRepaid).to.equal(prevStat.countRepaid);
                    });
        
                    it("Partial loan payments do not change all outstanding loan count", async function () {
                        expect(stat.countOutstanding).to.equal(prevStat.countOutstanding);
                    });
    
                    it("Partial loan payments do not change amount borrowed", async function () {
                        expect(stat.amountBorrowed).to.equal(prevStat.amountBorrowed);
                    });
    
                    it("Partial loan payments increase base amount repaid", async function () {
                        expect(stat.amountBaseRepaid).to.equal(prevStat.amountBaseRepaid.add(loanDetail.baseAmountRepaid));
                    });
    
                    it("Partial loan payments increase paid interest amount", async function () {
                        expect(stat.amountInterestPaid).to.equal(loanDetail.interestPaid);
                    });
                });
            });
        });

        describe("Default", function () {
            describe("Default before the grace period", function () {
                describe("Rejection scenarios", function () {
                    it ("Defaulting a loan before the grace period is up should fail", async function () {
                        await expect(poolContract.connect(manager).defaultLoan(loanId)).to.be.reverted;
                    });
                });
            });
    
            describe("Default after grace period", function () {
    
                beforeEach(async function () {
                    let loan = await poolContract.loans(loanId);
                    await ethers.provider.send('evm_increaseTime', [loan.duration.add(loan.gracePeriod).add(1).toNumber()]);
                    await ethers.provider.send('evm_mine');
                });
    
                it("Manager can default a partially repaid loan", async function () {
                    let poolFundsBefore = await poolContract.poolFunds();
                    let stakedBalanceBefore = await poolContract.balanceStaked();
    
                    let paymentAmount = (await poolContract.loanBalanceDue(loanId)).div(2);
                    await tokenContract.connect(borrower1).approve(poolContract.address, paymentAmount);
                    await poolContract.connect(borrower1).repay(loanId, paymentAmount);
                    
                    expect(await poolContract.canDefault(loanId, manager.address)).to.equal(true);
                    await poolContract.connect(manager).defaultLoan(loanId);
    
                    loan = await poolContract.loans(loanId);
                    let loanDetail = await poolContract.loanDetails(loanId);
                    let lossAmount = loan.amount.sub(loanDetail.totalAmountRepaid);
    
                    expect(loan.status).to.equal(LoanStatus.DEFAULTED);
                    expect(await poolContract.poolFunds()).to.equal(poolFundsBefore.sub(lossAmount));
                    expect(await poolContract.balanceStaked()).to.equal(stakedBalanceBefore.sub(lossAmount));
                });
    
                it("Manager can default a loan that has no payments made", async function () {
                    let poolFundsBefore = await poolContract.poolFunds();
                    let stakedBalanceBefore = await poolContract.balanceStaked();
                    
                    expect(await poolContract.canDefault(loanId, manager.address)).to.equal(true);
                    await poolContract.connect(manager).defaultLoan(loanId);
    
                    loan = await poolContract.loans(loanId);
                    let loanDetail = await poolContract.loanDetails(loanId);
                    let lossAmount = loan.amount.sub(loanDetail.totalAmountRepaid);
                    expect(loan.status).to.equal(LoanStatus.DEFAULTED);
                    expect(await poolContract.poolFunds()).to.equal(poolFundsBefore.sub(lossAmount));
                    expect(await poolContract.balanceStaked()).to.equal(stakedBalanceBefore.sub(lossAmount));
                });

                it("Manager can default a loan with an loss amount equal to the managers stake", async function () {

                    let loanAmount = await poolContract.balanceStaked();
                    let loanDuration = BigNumber.from(365).mul(24*60*60);

                    await loanDesk.connect(borrower2).requestLoan(loanAmount, loanDuration, "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29");
                    let otherApplicationId = (await loanDesk.borrowerStats(borrower2.address)).recentApplicationId;
                    let gracePeriod = await loanDesk.templateLoanGracePeriod();
                    let installments = 1;
                    let apr = await loanDesk.templateLoanAPR();
                    await loanDesk.connect(manager).offerLoan(otherApplicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);
                    await poolContract.connect(borrower2).borrow(otherApplicationId);

                    await ethers.provider.send('evm_increaseTime', [loanDuration.add(gracePeriod).add(1).toNumber()]);
                    await ethers.provider.send('evm_mine');

                    let poolFundsBefore = await poolContract.poolFunds();

                    let otherLoanId = (await poolContract.borrowerStats(borrower2.address)).recentLoanId;
                    
                    expect(await poolContract.canDefault(otherLoanId, manager.address)).to.equal(true);
                    await poolContract.connect(manager).defaultLoan(otherLoanId);
    
                    let loan = await poolContract.loans(otherLoanId);
                    let loanDetail = await poolContract.loanDetails(otherLoanId);
                    let lossAmount = loan.amount.sub(loanDetail.totalAmountRepaid);
                    expect(loan.status).to.equal(LoanStatus.DEFAULTED);
                    expect(await poolContract.poolFunds()).to.equal(poolFundsBefore.sub(lossAmount));
                    expect(await poolContract.balanceStaked()).to.equal(0);
                });

                it("Manager can default a loan with an loss amount greater than the managers stake", async function () {

                    let loanAmount = (await poolContract.balanceStaked()).mul(2);
                    let loanDuration = BigNumber.from(365).mul(24*60*60);

                    await loanDesk.connect(borrower2).requestLoan(loanAmount, loanDuration, "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29");
                    let otherApplicationId = (await loanDesk.borrowerStats(borrower2.address)).recentApplicationId;
                    let gracePeriod = await loanDesk.templateLoanGracePeriod();
                    let installments = 1;
                    let apr = await loanDesk.templateLoanAPR();
                    await loanDesk.connect(manager).offerLoan(otherApplicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);
                    await poolContract.connect(borrower2).borrow(otherApplicationId);

                    await ethers.provider.send('evm_increaseTime', [loanDuration.add(gracePeriod).add(1).toNumber()]);
                    await ethers.provider.send('evm_mine');

                    let otherLoanId = (await poolContract.borrowerStats(borrower2.address)).recentLoanId;
                    let poolFundsBefore = await poolContract.poolFunds();
                    
                    expect(await poolContract.canDefault(otherLoanId, manager.address)).to.equal(true);
                    await poolContract.connect(manager).defaultLoan(otherLoanId);
    
                    let loan = await poolContract.loans(otherLoanId);
                    let loanDetail = await poolContract.loanDetails(otherLoanId);
                    let lossAmount = loan.amount.sub(loanDetail.totalAmountRepaid);
                    expect(loan.status).to.equal(LoanStatus.DEFAULTED);
                    expect(await poolContract.poolFunds()).to.equal(poolFundsBefore.sub(lossAmount));
                    expect(await poolContract.balanceStaked()).to.equal(0);
                });
    
                describe("Rejection scenarios", function () {

                    it ("Defaulting a loan that is not in OUTSTANDING status should fail", async function () {
                        let paymentAmount = await poolContract.loanBalanceDue(loanId);
                        await tokenContract.connect(borrower1).approve(poolContract.address, paymentAmount);
                        await poolContract.connect(borrower1).repay(loanId, paymentAmount);
                        loan = await poolContract.loans(loanId);
                        assert(loan.status === LoanStatus.REPAID);
                        
                        expect(await poolContract.canDefault(loanId, manager.address)).to.equal(false);
                        await expect(poolContract.connect(manager).defaultLoan(loanId)).to.be.reverted;
                    });
        
                    it ("Defaulting a nonexistent loan should fail", async function () {
                        expect(await poolContract.canDefault(loanId.add(1), manager.address)).to.equal(false);
                        await expect(poolContract.connect(manager).defaultLoan(loanId.add(1))).to.be.reverted;
                    });
        
                    it ("Defaulting a loan as the protocol should fail", async function () {
                        expect(await poolContract.canDefault(loanId, protocol.address)).to.equal(false);
                        await expect(poolContract.connect(protocol).defaultLoan(loanId)).to.be.reverted;
                    });
        
                    it ("Defaulting a loan as the governance should fail", async function () {
                        expect(await poolContract.canDefault(loanId, governance.address)).to.equal(false);
                        await expect(poolContract.connect(governance).defaultLoan(loanId)).to.be.reverted;
                    });
        
                    it ("Defaulting a loan as a lender should fail", async function () {
                        expect(await poolContract.canDefault(loanId, lender1.address)).to.equal(false);
                        await expect(poolContract.connect(lender1).defaultLoan(loanId)).to.be.reverted;
                    });
        
                    it ("Defaulting a loan as the borrower should fail", async function () {
                        expect(await poolContract.canDefault(loanId, borrower1.address)).to.equal(false);
                        await expect(poolContract.connect(borrower1).defaultLoan(loanId)).to.be.reverted;
                    });
        
                    it ("Defaulting a loan from an unrelated address should fail", async function () {
                        expect(await poolContract.canDefault(loanId, addrs[0].address)).to.equal(false);
                        await expect(poolContract.connect(addrs[0]).defaultLoan(loanId)).to.be.reverted;
                    });
                });
    
                describe("Defaulting a loan on inactive manager", function () {
                    beforeEach(async function () {
                        let inactivityPeriod = await poolContract.MANAGER_INACTIVITY_GRACE_PERIOD();
                        let skipTime = Math.max(inactivityPeriod, 0) + 1;
    
                        let depositAmount = BigNumber.from(1).mul(TOKEN_MULTIPLIER).div(2);
                        await tokenContract.connect(lender2).approve(poolContract.address, depositAmount);
                        await poolContract.connect(lender2).deposit(depositAmount);
    
                        await ethers.provider.send('evm_increaseTime', [skipTime]);
                        await ethers.provider.send('evm_mine');
                    });

                    it ("Protocol can default", async function () {
                        expect(await poolContract.canDefault(loanId, protocol.address)).to.equal(true);
                        await expect(poolContract.connect(protocol).defaultLoan(loanId)).to.be.ok;
                    });
            
                    it ("Governance can default", async function () {
                        expect(await poolContract.canDefault(loanId, governance.address)).to.equal(true);
                        await expect(poolContract.connect(governance).defaultLoan(loanId)).to.be.ok;
                    });
                    
                    /*
                    it ("Long term lender can default", async function () {
                        expect(await poolContract.canDefault(loanId, lender1.address)).to.equal(true);
                        await expect(poolContract.connect(lender1).defaultLoan(loanId)).to.be.ok;
                    });
                    */
    
                    describe("Rejection scenarios", function () {

                        it ("A lender without sufficient balance can't default", async function () {
                            expect(await poolContract.canDefault(loanId, lender2.address)).to.equal(false);
                            await expect(poolContract.connect(lender2).defaultLoan(loanId)).to.be.reverted;
                        });
                
                        it ("Borrower can't default", async function () {
                            expect(await poolContract.canDefault(loanId, borrower1.address)).to.equal(false);
                            await expect(poolContract.connect(borrower1).defaultLoan(loanId)).to.be.reverted;
                        });
                
                        it ("An unrelated address can't default", async function () {
                            expect(await poolContract.canDefault(loanId, addrs[0].address)).to.equal(false);
                            await expect(poolContract.connect(addrs[0]).defaultLoan(loanId)).to.be.reverted;
                        });
                    });
                });

                describe("Borrower Statistics", function () {
                    describe("On Full Default", function () {

                        let loan;
                        let prevStat;
                        let stat;
        
                        beforeEach(async function () {
                            prevStat = await poolContract.borrowerStats(borrower1.address);
        
                            let loanId = prevStat.recentLoanId;
                            loan = await poolContract.loans(loanId);
            
                            await ethers.provider.send('evm_increaseTime', [loan.duration.add(loan.gracePeriod).toNumber()]);
                            await ethers.provider.send('evm_mine');
        
                            await poolContract.connect(manager).defaultLoan(loanId);
                
                            stat = await poolContract.borrowerStats(borrower1.address);
                        });
        
                        it("Full default increments all time default count", async function () {
                            expect(stat.countDefaulted).to.equal(prevStat.countDefaulted.add(1));
                        });
        
                        it("Full default decrements outstanding loan count", async function () {
                            expect(stat.countOutstanding).to.equal(prevStat.countOutstanding.sub(1));
                        });
        
                        it("Full default removes loan amount from borrowed amount", async function () {
                            expect(stat.amountBorrowed).to.equal(prevStat.amountBorrowed.sub(loan.amount));
                        });
        
                        it("Full default does not change paid base amount", async function () {
                            expect(stat.amountBaseRepaid).to.equal(prevStat.amountBaseRepaid);
                        });
        
                        it("Full default does not change paid interest amount", async function () {
                            expect(stat.amountInterestPaid).to.equal(prevStat.amountInterestPaid);
                        });
                    });
        
                    describe("On Partial Default", function () {

                        let loan;
                        let prevStat;
                        let prevLoanDetail;
                        let stat;
                        let loanDetail;
        
                        beforeEach(async function () {
                            prevStat = await poolContract.borrowerStats(borrower1.address);
        
                            let loanId = prevStat.recentLoanId;
                            loan = await poolContract.loans(loanId);
            
                            await ethers.provider.send('evm_increaseTime', [loan.duration.add(loan.gracePeriod).toNumber()]);
                            await ethers.provider.send('evm_mine');
        
                            let paymentAmount = (await poolContract.loanBalanceDue(loanId)).div(2);
                            await tokenContract.connect(borrower1).approve(poolContract.address, paymentAmount);
                            await poolContract.connect(borrower1).repay(loanId, paymentAmount);
        
                            prevStat = await poolContract.borrowerStats(borrower1.address);
                            prevLoanDetail = await poolContract.loanDetails(loanId);
                            await poolContract.connect(manager).defaultLoan(loanId);
                
                            stat = await poolContract.borrowerStats(borrower1.address);
                            loanDetail = await poolContract.loanDetails(loanId);
                        });
        
                        it("Partial default increments all time default count", async function () {
                            expect(stat.countDefaulted).to.equal(prevStat.countDefaulted.add(1));
                        });
        
                        it("Partial default removes loan amount from borrowed amount", async function () {
                            expect(stat.countOutstanding).to.equal(prevStat.countOutstanding.sub(1));
                        });
        
                        it("Partial default removes loan amount from borrowed amount", async function () {
                            expect(stat.amountBorrowed).to.equal(prevStat.amountBorrowed.sub(loan.amount));
                        });
        
                        it("Partial default removes loan base amount paid from base amount paid", async function () {
                            expect(stat.amountBaseRepaid).to.equal(prevStat.amountBaseRepaid.sub(loanDetail.baseAmountRepaid));
                        });
        
                        it("Partial default removes loan interest amount paid from interest amount paid", async function () {
                            expect(stat.amountInterestPaid).to.equal(prevStat.amountInterestPaid.sub(loanDetail.interestPaid));
                        });
                    });
                });
            });
        });

    });
  });
