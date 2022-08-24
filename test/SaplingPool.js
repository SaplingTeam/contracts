const { expect, assert } = require("chai");
const { BigNumber } = require("ethers");

describe("SaplingPool", function() {

    let TestUSDC;
    let tokenContract;

    let SaplingPool;
    let poolContract;
    let loanDesk;

    let manager;
    let protocol;
    let lender1;
    let borrower1;
    let addrs;

    let PERCENT_DECIMALS;
    let TOKEN_DECIMALS;
    let TOKEN_MULTIPLIER;

    beforeEach(async function () {
        [manager, protocol, governance, lender1, lender2, borrower1, borrower2, ...addrs] = await ethers.getSigners();

        TestUSDC = await ethers.getContractFactory("TestToken");
        SaplingPool = await ethers.getContractFactory("SaplingLendingPool");
        LoanDesk = await ethers.getContractFactory("LoanDesk");

        tokenContract = await TestUSDC.deploy("Test USDC", "TestUSDC", 6);
        TOKEN_DECIMALS = await tokenContract.decimals();
        TOKEN_MULTIPLIER = BigNumber.from(10).pow(TOKEN_DECIMALS);

        let mintAmount = TOKEN_MULTIPLIER.mul(100000);

        await tokenContract.connect(manager).mint(manager.address, mintAmount);
        await tokenContract.connect(manager).mint(lender1.address, mintAmount);
        await tokenContract.connect(manager).mint(lender2.address, mintAmount);
        await tokenContract.connect(manager).mint(borrower1.address, mintAmount);
        await tokenContract.connect(manager).mint(borrower2.address, mintAmount);

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
    });

    describe("Staking", function () {
        let stakeAmount;

        beforeEach(async function () {
            stakeAmount = BigNumber.from(2000).mul(TOKEN_MULTIPLIER);
        });

        it("Manager can stake", async function () {
            let balanceBefore = await tokenContract.balanceOf(manager.address);
            
            await tokenContract.connect(manager).approve(poolContract.address, stakeAmount);
            await poolContract.connect(manager).stake(stakeAmount);
            expect(await poolContract.balanceStaked()).to.equal(stakeAmount);

            expect(await tokenContract.balanceOf(manager.address)).to.equal(balanceBefore.sub(stakeAmount));
        });

        it("Stake is reflected on the pool contract balance", async function () {
            let prevBalance = await tokenContract.balanceOf(poolContract.address);

            await tokenContract.connect(manager).approve(poolContract.address, stakeAmount);
            await poolContract.connect(manager).stake(stakeAmount);

            let balance = await tokenContract.balanceOf(poolContract.address);
            expect(balance).to.equal(prevBalance.add(stakeAmount))
                .and.equal(await poolContract.tokenBalance());
        });

        it("Stake is reflected on pool liquidity", async function () {
            let prevLiquidity = await poolContract.poolLiquidity();

            await tokenContract.connect(manager).approve(poolContract.address, stakeAmount);
            await poolContract.connect(manager).stake(stakeAmount);

            let liquidity = await poolContract.poolLiquidity();

            expect(liquidity).to.equal(prevLiquidity.add(stakeAmount));
        });

        it("Stake is reflected on pool funds", async function () {
            let prevPoolFunds = await poolContract.poolFunds();

            await tokenContract.connect(manager).approve(poolContract.address, stakeAmount);
            await poolContract.connect(manager).stake(stakeAmount);

            let poolFunds = await poolContract.poolFunds();

            expect(poolFunds).to.equal(prevPoolFunds.add(stakeAmount));
        });
        
        it("Manager can stake on a failed pool and have a correct pool balance", async function () {
            await tokenContract.connect(manager).approve(poolContract.address, stakeAmount);
            await poolContract.connect(manager).stake(stakeAmount);
            
            let depositAmount = BigNumber.from(10000).mul(TOKEN_MULTIPLIER);
            await tokenContract.connect(lender1).approve(poolContract.address, depositAmount);
            await poolContract.connect(lender1).deposit(depositAmount);

            let loanAmount = await poolContract.poolFunds();
            let loanDuration = BigNumber.from(365).mul(24*60*60);

            let requestLoanTx = await loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29");
            let applicationId = BigNumber.from((await requestLoanTx.wait()).events[0].data);

            let gracePeriod = await loanDesk.templateLoanGracePeriod();
            let installments = 1;
            let apr = await loanDesk.templateLoanAPR();

            await loanDesk.connect(manager).offerLoan(applicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);
            await poolContract.connect(borrower1).borrow(applicationId);
            
            let loanId = (await poolContract.borrowerStats(borrower1.address)).recentLoanId;

            let loan = await poolContract.loans(loanId);
            await ethers.provider.send('evm_increaseTime', [loan.duration.add(loan.gracePeriod).toNumber()]);
            await ethers.provider.send('evm_mine');

            await poolContract.connect(manager).defaultLoan(loanId);

            assert((await poolContract.balanceStaked()).eq(0));
            assert((await poolContract.poolFunds()).eq(0));

            await tokenContract.connect(manager).approve(poolContract.address, stakeAmount);
            await poolContract.connect(manager).stake(stakeAmount);
            expect(await poolContract.balanceStaked()).to.equal(stakeAmount.sub(1));
        });

        describe("Rejection scenarios", function () {

            it ("Staking a zero amount should fail", async function () {         
                await tokenContract.connect(manager).approve(poolContract.address, stakeAmount);
                await expect(poolContract.connect(manager).stake(0)).to.be.reverted;
            });

            it ("Staking when the pool is paused should fail", async function () {            
                await poolContract.connect(governance).pause();
                await tokenContract.connect(manager).approve(poolContract.address, stakeAmount);
                await expect(poolContract.connect(manager).stake(stakeAmount)).to.be.reverted;
            });

            it ("Staking when the pool is closed should fail", async function () {            
                await poolContract.connect(manager).close();
                await tokenContract.connect(manager).approve(poolContract.address, stakeAmount);
                await expect(poolContract.connect(manager).stake(stakeAmount)).to.be.reverted;
            });

            it ("Staking as the protocol should fail", async function () {
                await tokenContract.connect(manager).transfer(protocol.address, stakeAmount);
                await tokenContract.connect(protocol).approve(poolContract.address, stakeAmount);
                await expect(poolContract.connect(protocol).stake(stakeAmount)).to.be.reverted;
            });

            it ("Staking as the governance should fail", async function () {
                await tokenContract.connect(manager).transfer(governance.address, stakeAmount);
                await tokenContract.connect(governance).approve(poolContract.address, stakeAmount);
                await expect(poolContract.connect(governance).stake(stakeAmount)).to.be.reverted;
            });

            it ("Staking as a lender should fail", async function () {
                await tokenContract.connect(manager).transfer(lender1.address, stakeAmount);
                await tokenContract.connect(lender1).approve(poolContract.address, stakeAmount);
                await expect(poolContract.connect(lender1).stake(stakeAmount)).to.be.reverted;
            });

            it ("Staking as a borrower should fail", async function () {
                let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
                let loanDuration = BigNumber.from(365).mul(24*60*60);
                await loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29");

                await tokenContract.connect(borrower1).approve(poolContract.address, stakeAmount);
                await expect(poolContract.connect(borrower1).stake(stakeAmount)).to.be.reverted;
            });
        });
    });

    describe("Unstaking", function () {

        let stakeAmount;
        let unstakeAmount;
        let depositAmount;
        let exitFeePercent;
        let ONE_HUNDRED_PERCENT;

        beforeEach(async function () {
            stakeAmount = BigNumber.from(2000).mul(TOKEN_MULTIPLIER);
            unstakeAmount = BigNumber.from(500).mul(TOKEN_MULTIPLIER);
            depositAmount = BigNumber.from(9000).mul(TOKEN_MULTIPLIER);

            await tokenContract.connect(manager).approve(poolContract.address, stakeAmount);
            await poolContract.connect(manager).stake(stakeAmount);

            await tokenContract.connect(lender1).approve(poolContract.address, depositAmount);
            await poolContract.connect(lender1).deposit(depositAmount);

            exitFeePercent = await poolContract.exitFeePercent();
            ONE_HUNDRED_PERCENT = await poolContract.ONE_HUNDRED_PERCENT();
        });

        it("Manager can unstake", async function () {
            let balanceBefore = await tokenContract.balanceOf(manager.address);

            let exitFee = unstakeAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT);
            let exitFeeGain = exitFee.mul(stakeAmount.sub(unstakeAmount)).div(depositAmount.add(stakeAmount.sub(unstakeAmount)));

            let stakedBalance = await poolContract.balanceStaked();
            await poolContract.connect(manager).unstake(unstakeAmount);
            expect(await poolContract.balanceStaked()).to.equal(stakedBalance.sub(unstakeAmount).add(exitFeeGain));

            expect(await tokenContract.balanceOf(manager.address)).to.equal(balanceBefore.add(unstakeAmount).sub(exitFee));
        });

        describe("Amount Unstakable", function () {
            it("Can view amount unstakable", async function () {
                let expectedUnstakable = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
    
                expect(await poolContract.amountUnstakable()).to.equal(expectedUnstakable);
            });

            it("Amount unstakable is zero when pool is paused", async function () {
                await poolContract.connect(governance).pause();
                expect(await poolContract.amountUnstakable()).to.equal(0);
            });
        });

        it("Unstaking is reflected on the pool contract balance", async function () {

            let prevBalance = await tokenContract.balanceOf(poolContract.address);

            await poolContract.connect(manager).unstake(unstakeAmount);

            let balance = await tokenContract.balanceOf(poolContract.address);

            expect(balance).to.equal(prevBalance.sub(unstakeAmount).add(unstakeAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT)))
                .and.equal(await poolContract.tokenBalance());
        });

        it("Unstaking is reflected on pool liquidity", async function () {

            let prevLiquidity = await poolContract.poolLiquidity();

            await poolContract.connect(manager).unstake(unstakeAmount);

            let liquidity = await poolContract.poolLiquidity();

            expect(liquidity).to.equal(prevLiquidity.sub(unstakeAmount).add(unstakeAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT)));
        });

        it("Unstaking is reflected on pool funds", async function () {

            let prevPoolFunds = await poolContract.poolFunds();

            await poolContract.connect(manager).unstake(unstakeAmount);

            let poolFunds = await poolContract.poolFunds();

            expect(poolFunds).to.equal(prevPoolFunds.sub(unstakeAmount).add(unstakeAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT)));
        });

        describe("Rejection scenarios", function () {

            it ("Unstaking a zero amount should fail", async function () {         
                await expect(poolContract.connect(manager).unstake(0)).to.be.reverted;
            });

            it ("Unstaking an amount greater than unstakable should fail", async function () {     
                let amountUnstakable = await poolContract.amountUnstakable();   
                await expect(poolContract.connect(manager).unstake(amountUnstakable.add(1))).to.be.reverted;
            });

            it ("Unstaking when the pool is paused should fail", async function () {            
                await poolContract.connect(governance).pause();
                await expect(poolContract.connect(manager).unstake(unstakeAmount)).to.be.reverted;
            });

            it ("Unstaking as the protocol should fail", async function () {
                await expect(poolContract.connect(protocol).unstake(unstakeAmount)).to.be.reverted;
            });

            it ("Unstaking as the governance should fail", async function () {
                await expect(poolContract.connect(governance).unstake(unstakeAmount)).to.be.reverted;
            });

            it ("Unstaking as a lender should fail", async function () {
                await expect(poolContract.connect(lender1).unstake(unstakeAmount)).to.be.reverted;
            });

            it ("Unstaking as a borrower should fail", async function () {
                let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
                let loanDuration = BigNumber.from(365).mul(24*60*60);
                await loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29");


                await expect(poolContract.connect(borrower1).unstake(unstakeAmount)).to.be.reverted;
            });
        });
    });

    describe("Deposits", function () {
        let stakeAmount;
        let depositAmount;

        beforeEach(async function () {

            stakeAmount = BigNumber.from(2000).mul(TOKEN_MULTIPLIER);
            depositAmount = BigNumber.from(10000).mul(TOKEN_MULTIPLIER);

            await tokenContract.connect(manager).approve(poolContract.address, stakeAmount);
            await poolContract.connect(manager).stake(stakeAmount);
        });

        describe("Amount depositable", function () {
            it("Can view amount depositable", async function () {
                let targetStakePercent = await poolContract.targetStakePercent();
                let ONE_HUNDRED_PERCENT = await poolContract.ONE_HUNDRED_PERCENT();
                let calculatedDepositable = stakeAmount.mul(ONE_HUNDRED_PERCENT).div(targetStakePercent).sub(stakeAmount);
    
                expect(await poolContract.amountDepositable()).to.equal(calculatedDepositable);
            });
    

            it("Amount depositable is zero when pool is paused", async function () {
                await poolContract.connect(governance).pause();
                expect(await poolContract.amountDepositable()).to.equal(0);
            });

            it("Amount depositable is zero when pool is closed", async function () {
                await poolContract.connect(manager).close();
                expect(await poolContract.amountDepositable()).to.equal(0);
            });

            it("Amount depositable is zero when pool is full", async function () {
                let targetStakePercent = await poolContract.targetStakePercent();
                let ONE_HUNDRED_PERCENT = await poolContract.ONE_HUNDRED_PERCENT();
                let calculatedDepositable = stakeAmount.mul(ONE_HUNDRED_PERCENT).div(targetStakePercent).sub(stakeAmount);

                await tokenContract.connect(lender1).approve(poolContract.address, calculatedDepositable);
                await poolContract.connect(lender1).deposit(calculatedDepositable);
                expect(await poolContract.amountDepositable()).to.equal(0);
            });
        });

        it("Lender can deposit", async function () {
            let balanceBefore = await tokenContract.balanceOf(lender1.address);

            await tokenContract.connect(lender1).approve(poolContract.address, depositAmount);
            await poolContract.connect(lender1).deposit(depositAmount);
            expect(await poolContract.balanceOf(lender1.address)).to.equal(depositAmount);

            expect(await tokenContract.balanceOf(lender1.address)).to.equal(balanceBefore.sub(depositAmount));
        });

        it("Deposit is reflected on the pool contract balance", async function () {
            let prevBalance = await tokenContract.balanceOf(poolContract.address);

            await tokenContract.connect(lender1).approve(poolContract.address, depositAmount);
            await poolContract.connect(lender1).deposit(depositAmount);

            let balance = await tokenContract.balanceOf(poolContract.address);
            expect(balance).to.equal(prevBalance.add(depositAmount))
                .and.equal(await poolContract.tokenBalance());
        });

        it("Deposit is reflected on pool liquidity", async function () {
            let prevLiquidity = await poolContract.poolLiquidity();

            await tokenContract.connect(lender1).approve(poolContract.address, depositAmount);
            await poolContract.connect(lender1).deposit(depositAmount);

            let liquidity = await poolContract.poolLiquidity();

            expect(liquidity).to.equal(prevLiquidity.add(depositAmount));
        });

        it("Deposit is reflected on pool funds", async function () {
            let prevPoolFunds = await poolContract.poolFunds();

            await tokenContract.connect(lender1).approve(poolContract.address, depositAmount);
            await poolContract.connect(lender1).deposit(depositAmount);

            let poolFunds = await poolContract.poolFunds();

            expect(poolFunds).to.equal(prevPoolFunds.add(depositAmount));
        });

        describe("Rejection scenarios", function () {

            it ("Depositing a zero amount should fail", async function () {         
                await tokenContract.connect(lender1).approve(poolContract.address, depositAmount);
                await expect(poolContract.connect(lender1).deposit(0)).to.be.reverted;
            });

            it ("Depositing an amount greater than allowed should fail", async function () {   
                let amountDepositable = await poolContract.amountDepositable();

                await tokenContract.connect(lender1).approve(poolContract.address, amountDepositable.add(1));
                await expect(poolContract.connect(lender1).deposit(amountDepositable.add(1))).to.be.reverted;
            });

            it ("Depositing when the pool is paused should fail", async function () {            
                await poolContract.connect(governance).pause();
                await tokenContract.connect(lender1).approve(poolContract.address, depositAmount);
                await expect(poolContract.connect(lender1).deposit(depositAmount)).to.be.reverted;
            });

            it ("Depositing when the pool is closed should fail", async function () {            
                await poolContract.connect(manager).close();
                await tokenContract.connect(lender1).approve(poolContract.address, depositAmount);
                await expect(poolContract.connect(lender1).deposit(depositAmount)).to.be.reverted;
            });

            it ("Depositing as the manager should fail", async function () {
                await tokenContract.connect(manager).approve(poolContract.address, depositAmount);
                await expect(poolContract.connect(manager).deposit(depositAmount)).to.be.reverted;
            });

            it ("Depositing as the protocol should fail", async function () {
                await tokenContract.connect(lender1).transfer(protocol.address, depositAmount);
                await tokenContract.connect(protocol).approve(poolContract.address, depositAmount);
                await expect(poolContract.connect(protocol).deposit(depositAmount)).to.be.reverted;
            });

            it ("Depositing as the governance should fail", async function () {
                await tokenContract.connect(lender1).transfer(governance.address, depositAmount);
                await tokenContract.connect(governance).approve(poolContract.address, depositAmount);
                await expect(poolContract.connect(governance).deposit(depositAmount)).to.be.reverted;
            });
        });
    });

    describe("Withdrawals", function () {        

        let stakeAmount;
        let depositAmount;
        let withdrawAmount;
        let exitFeePercent;
        let ONE_HUNDRED_PERCENT;

        beforeEach(async function () {
            stakeAmount = BigNumber.from(2000).mul(TOKEN_MULTIPLIER);
            depositAmount = BigNumber.from(10000).mul(TOKEN_MULTIPLIER);
            withdrawAmount = BigNumber.from(3000).mul(TOKEN_MULTIPLIER);

            await tokenContract.connect(manager).approve(poolContract.address, stakeAmount);
            await poolContract.connect(manager).stake(stakeAmount);

            await tokenContract.connect(lender1).approve(poolContract.address, depositAmount);
            await poolContract.connect(lender1).deposit(depositAmount);

            exitFeePercent = await poolContract.exitFeePercent();
            ONE_HUNDRED_PERCENT = await poolContract.ONE_HUNDRED_PERCENT();
        });

        it("Lender can withdraw", async function () {
            let tokenBalanceBefore = await tokenContract.balanceOf(lender1.address);
            let poolBalanceBefore = await poolContract.balanceOf(lender1.address);

            let exitFee = withdrawAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT);
            let exitFeeGain = exitFee.mul(depositAmount.sub(withdrawAmount)).div(stakeAmount.add(depositAmount.sub(withdrawAmount)));

            await poolContract.connect(lender1).withdraw(withdrawAmount);
            expect(await poolContract.balanceOf(lender1.address)).to.equal(poolBalanceBefore.sub(withdrawAmount).add(exitFeeGain));

            expect(await tokenContract.balanceOf(lender1.address)).to.equal(tokenBalanceBefore.add(withdrawAmount).sub(exitFee));
        });

        it("Withdraw is reflected on the pool contract balance", async function () {

            let prevBalance = await tokenContract.balanceOf(poolContract.address);

            await poolContract.connect(lender1).withdraw(withdrawAmount);

            let balance = await tokenContract.balanceOf(poolContract.address);
            expect(balance).to.equal(prevBalance.sub(withdrawAmount).add(withdrawAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT)))
                .and.equal(await poolContract.tokenBalance());
        });

        it("Withdraw is reflected on pool liquidity", async function () {

            let prevLiquidity = await poolContract.poolLiquidity();

            await poolContract.connect(lender1).withdraw(withdrawAmount);

            let liquidity = await poolContract.poolLiquidity();

            expect(liquidity).to.equal(prevLiquidity.sub(withdrawAmount).add(withdrawAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT)));
        });

        it("Withdraw is reflected on pool funds", async function () {
            let prevPoolFunds = await poolContract.poolFunds();

            await poolContract.connect(lender1).withdraw(withdrawAmount);

            let poolFunds = await poolContract.poolFunds();

            expect(poolFunds).to.equal(prevPoolFunds.sub(withdrawAmount).add(withdrawAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT)));
        });

        it("Early Withdraw should charge an exit fee", async function () {
            let tokenBalanceBefore = await tokenContract.balanceOf(lender1.address);

            let expectedWithdrawalFee = withdrawAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT);

            await poolContract.connect(lender1).withdraw(withdrawAmount);

            expect(await tokenContract.balanceOf(lender1.address)).to.equal(tokenBalanceBefore.add(withdrawAmount.sub(expectedWithdrawalFee)));
        });

        describe("Rejection scenarios", function () {

            it ("Withdrawing a zero amount should fail", async function () {         
                await expect(poolContract.connect(lender1).withdraw(0)).to.be.reverted;
            });

            it ("Withdrawing an amount greater than lender's balance should fail", async function () {   
                let balance = await poolContract.balanceOf(lender1.address);
                await expect(poolContract.connect(lender1).withdraw(balance.add(1))).to.be.reverted;
            });

            it ("Withdrawing an amount greater than available should fail", async function () {   
                let gracePeriod = await loanDesk.templateLoanGracePeriod();
                let installments = 1;
                let apr = await loanDesk.templateLoanAPR();
                let loanAmount = BigNumber.from(5000).mul(TOKEN_MULTIPLIER);
                let loanDuration = BigNumber.from(365).mul(24*60*60);

                await loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29");
                let otherApplicationId = (await loanDesk.borrowerStats(borrower1.address)).recentApplicationId;
                await loanDesk.connect(manager).offerLoan(otherApplicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);
                await poolContract.connect(borrower1).borrow(otherApplicationId);

                let amountWithdrawable = await poolContract.amountWithdrawable(lender1.address);

                await expect(poolContract.connect(lender1).withdraw(amountWithdrawable.add(1))).to.be.reverted;
            });

            it ("Withdrawing when the pool is paused should fail", async function () {            
                await poolContract.connect(governance).pause();
                await expect(poolContract.connect(lender1).withdraw(withdrawAmount)).to.be.reverted;
            });

            it ("Withdrawing as the manager should fail", async function () {
                let balance = await poolContract.balanceStaked();
                await expect(poolContract.connect(manager).withdraw(balance.div(10))).to.be.reverted;
            });

            it ("Withdrawing as a borrower should fail", async function () {
                let gracePeriod = await loanDesk.templateLoanGracePeriod();
                let installments = 1;
                let apr = await loanDesk.templateLoanAPR();
                let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
                let loanDuration = BigNumber.from(365).mul(24*60*60);
                await loanDesk.connect(borrower2).requestLoan(loanAmount, loanDuration, "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29");
                let otherApplicationId = (await loanDesk.borrowerStats(borrower2.address)).recentApplicationId;
                await loanDesk.connect(manager).offerLoan(otherApplicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);

                await expect(poolContract.connect(borrower2).withdraw(loanAmount)).to.be.reverted;
            });
        });

        describe("Protocol fees", function () {
            beforeEach(async function () {
                let gracePeriod = await loanDesk.templateLoanGracePeriod();
                let installments = 1;
                let apr = await loanDesk.templateLoanAPR();

                let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
                let loanDuration = BigNumber.from(365).mul(24*60*60);

                await loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29");
                let applicationId = (await loanDesk.borrowerStats(borrower1.address)).recentApplicationId;
                await loanDesk.connect(manager).offerLoan(applicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);
                await poolContract.connect(borrower1).borrow(applicationId);
                let loanId = (await poolContract.borrowerStats(borrower1.address)).recentLoanId;
    
                await ethers.provider.send('evm_increaseTime', [loanDuration.toNumber()]);
                await ethers.provider.send('evm_mine');
    
                let paymentAmount = await poolContract.loanBalanceDue(loanId);
    
                await tokenContract.connect(borrower1).approve(poolContract.address, paymentAmount);
                await poolContract.connect(borrower1).repay(loanId, paymentAmount);
            });
    
            it("Protocol can withdraw earned protocol fees", async function () {
                let tokenBalanceBefore = await tokenContract.balanceOf(protocol.address);
                let poolBalanceBefore = await poolContract.protocolEarningsOf(protocol.address);
    
                await poolContract.connect(protocol).withdrawProtocolEarnings();
    
                expect(await tokenContract.balanceOf(protocol.address)).to.equal(tokenBalanceBefore.add(poolBalanceBefore));
                expect(await poolContract.protocolEarningsOf(protocol.address)).to.equal(0);
            });

            it("When a new protocol wallet address is set, earned protocol fees are allocated to the new address", async function () {
                let oldProtocolBalanceBefore = await poolContract.protocolEarningsOf(protocol.address);
                let newProtocolBalanceBefore = await poolContract.protocolEarningsOf(addrs[0].address);

                await poolContract.connect(governance).transferProtocolWallet(addrs[0].address);
    
                expect(await poolContract.protocolEarningsOf(protocol.address)).to.equal(0);
                expect(await poolContract.protocolEarningsOf(addrs[0].address)).to.equal(newProtocolBalanceBefore.add(oldProtocolBalanceBefore));
            });
    
            it("Manager can withdraw earned protocol fees", async function () {
                let tokenBalanceBefore = await tokenContract.balanceOf(manager.address);
                let poolBalanceBefore = await poolContract.protocolEarningsOf(manager.address);
    
                await poolContract.connect(manager).withdrawProtocolEarnings();
    
                expect(await tokenContract.balanceOf(manager.address)).to.equal(tokenBalanceBefore.add(poolBalanceBefore));
                expect(await poolContract.protocolEarningsOf(manager.address)).to.equal(0);
            });

            it("Protocol fee withdrawal is reflected on the pool contract balance", async function () {
    
                let prevBalance = await tokenContract.balanceOf(poolContract.address);

                let withdrawAmount = await poolContract.protocolEarningsOf(protocol.address);
                await poolContract.connect(protocol).withdrawProtocolEarnings();
    
                let balance = await tokenContract.balanceOf(poolContract.address);
                expect(balance).to.equal(prevBalance.sub(withdrawAmount))
                    .and.equal(await poolContract.tokenBalance());
            });
    
            it("Protocol fee withdrawal is not reflected on pool liquidity", async function () {
                let prevLiquidity = await poolContract.poolLiquidity();

                await poolContract.connect(protocol).withdrawProtocolEarnings();
    
                let liquidity = await poolContract.poolLiquidity();
    
                expect(liquidity).to.equal(prevLiquidity);
            });
    
            it("Protocol fee withdrawal is not reflected on pool funds", async function () {
                let prevPoolFunds = await poolContract.poolFunds();
    
                let withdrawAmount = await poolContract.protocolEarningsOf(manager.address);
                await poolContract.connect(protocol).withdrawProtocolEarnings();
    
                let poolFunds = await poolContract.poolFunds();
    
                expect(poolFunds).to.equal(prevPoolFunds);
            });

            describe("Rejection scenarios", function () {
                it("Protocol fees cannot be withdrawn while the pool is paused", async function () {
                    await poolContract.connect(governance).pause();
                    await expect(poolContract.connect(protocol).withdrawProtocolEarnings()).to.be.reverted;
                });

                it("Protocol withdrawal should fail when balance is zero", async function () {
                    await poolContract.connect(protocol).withdrawProtocolEarnings();

                    expect(await poolContract.protocolEarningsOf(protocol.address)).to.equal(0);
                    await expect(poolContract.connect(protocol).withdrawProtocolEarnings()).to.be.reverted;
                });
            });
        });
    });

    describe("Projected APY", function () {
        let stakeAmount;
        let depositAmount;
        let loanAmount;
        let poolFunds;

        beforeEach(async function () {
            stakeAmount = BigNumber.from(2000).mul(TOKEN_MULTIPLIER);
            depositAmount = BigNumber.from(18000).mul(TOKEN_MULTIPLIER);

            await tokenContract.connect(manager).approve(poolContract.address, stakeAmount);
            await poolContract.connect(manager).stake(stakeAmount);

            await tokenContract.connect(lender1).approve(poolContract.address, depositAmount);
            await poolContract.connect(lender1).deposit(depositAmount);

            loanAmount = BigNumber.from(10000).mul(TOKEN_MULTIPLIER);
            let loanDuration = BigNumber.from(365).mul(24*60*60);

            await loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, "a937074e-85a7-42a9-b858-9795d9471759", "6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29");
            let applicationId = (await loanDesk.borrowerStats(borrower1.address)).recentApplicationId;
            let application = await loanDesk.loanApplications(applicationId);

            let gracePeriod = await loanDesk.templateLoanGracePeriod();
            let installments = 1;
            let apr = await loanDesk.templateLoanAPR();

            await loanDesk.connect(manager).offerLoan(applicationId, application.amount, application.duration, gracePeriod, 0, installments, apr);
            await poolContract.connect(borrower1).borrow(applicationId);

            poolFunds = stakeAmount.add(depositAmount);
        });

        it("Can view lender APY given current pool state", async function () {
            let apr = await loanDesk.templateLoanAPR();
            let protocolEarningPercent = await poolContract.protocolEarningPercent();
            let ONE_HUNDRED_PERCENT = await poolContract.ONE_HUNDRED_PERCENT();
            let managersEarnFactor = await poolContract.managerEarnFactor();

            // pool APY
            let poolAPY = BigNumber.from(apr).mul(loanAmount).div(poolFunds);
            
            // protocol APY
            let protocolAPY = poolAPY.mul(protocolEarningPercent).div(ONE_HUNDRED_PERCENT);

            let remainingAPY = poolAPY.sub(protocolAPY);
            
            // manager withdrawableAPY
            let currentStakePercent = ONE_HUNDRED_PERCENT / poolFunds.div(stakeAmount).toNumber();
            let managerEarningsPercent = currentStakePercent * (managersEarnFactor - ONE_HUNDRED_PERCENT) / ONE_HUNDRED_PERCENT;
            let managerWithdrawableAPY = remainingAPY.mul(managerEarningsPercent).div(managerEarningsPercent + ONE_HUNDRED_PERCENT);

            let expectedLenderAPY = remainingAPY.sub(managerWithdrawableAPY).toNumber();

            expect(await poolContract.currentLenderAPY()).to.equal(expectedLenderAPY);
            
        });

        it("Can view projected lender APY", async function () {
            let apr = await loanDesk.templateLoanAPR();
            let protocolEarningPercent = await poolContract.protocolEarningPercent();
            let ONE_HUNDRED_PERCENT = await poolContract.ONE_HUNDRED_PERCENT();
            let managersEarnFactor = await poolContract.managerEarnFactor();

            // pool APY
            let poolAPY = BigNumber.from(apr).mul(loanAmount).div(poolFunds);
            
            // protocol APY
            let protocolAPY = poolAPY.mul(protocolEarningPercent).div(ONE_HUNDRED_PERCENT);
            
            let remainingAPY = poolAPY.sub(protocolAPY);
            
            // manager withdrawableAPY
            let currentStakePercent = ONE_HUNDRED_PERCENT / poolFunds.div(stakeAmount).toNumber();
            let managerEarningsPercent = currentStakePercent * (managersEarnFactor - ONE_HUNDRED_PERCENT) / ONE_HUNDRED_PERCENT;
            let managerWithdrawableAPY = remainingAPY.mul(managerEarningsPercent).div(managerEarningsPercent + ONE_HUNDRED_PERCENT);

            let expectedLenderAPY = remainingAPY.sub(managerWithdrawableAPY).toNumber();

            let borrowRate = loanAmount.mul(ONE_HUNDRED_PERCENT).div(poolFunds).toNumber();

            expect(await poolContract.projectedLenderAPY(borrowRate, apr)).to.equal(expectedLenderAPY);        
        });

        it("Increase in borrow rate is linearly reflected on projected lender APY within margin of integer math accuracy", async function () {
            let apr = await loanDesk.templateLoanAPR();
            let protocolEarningPercent = await poolContract.protocolEarningPercent();
            let ONE_HUNDRED_PERCENT = await poolContract.ONE_HUNDRED_PERCENT();
            let managersEarnFactor = await poolContract.managerEarnFactor();

            let projectedBorrowAmount = loanAmount.div(2);

            // pool APY
            let poolAPY = BigNumber.from(apr).mul(projectedBorrowAmount).div(poolFunds);
            
            // protocol APY
            let protocolAPY = poolAPY.mul(protocolEarningPercent).div(ONE_HUNDRED_PERCENT);
            
            // manager withdrawableAPY
            let currentStakePercent = ONE_HUNDRED_PERCENT / poolFunds.div(stakeAmount).toNumber();
            let managerEarningsPercent = currentStakePercent * (managersEarnFactor - ONE_HUNDRED_PERCENT) / ONE_HUNDRED_PERCENT;
            let managerWithdrawableAPY = managerEarningsPercent - (managerEarningsPercent * (ONE_HUNDRED_PERCENT - protocolEarningPercent) / ONE_HUNDRED_PERCENT);

            let expectedLenderAPY = poolAPY.sub(protocolAPY).sub(managerWithdrawableAPY).toNumber();

            let borrowRate = projectedBorrowAmount.mul(ONE_HUNDRED_PERCENT).div(poolFunds).toNumber();

            expect((await poolContract.projectedLenderAPY(borrowRate * 2, apr)) - (expectedLenderAPY * 2)).to.lte(10);
            expect((await poolContract.projectedLenderAPY(borrowRate * 3, apr)) - (expectedLenderAPY * 3)).to.lte(10);
        });


        describe("Rejection scenarios", function () {
            it("APY projection should fail when borrow rate of over 100% is requested", async function () {
                let apr = await loanDesk.templateLoanAPR();
                let ONE_HUNDRED_PERCENT = await poolContract.ONE_HUNDRED_PERCENT();
                await expect(poolContract.projectedLenderAPY(ONE_HUNDRED_PERCENT + 1, apr)).to.be.reverted;
            });
        });
    });
  });
  