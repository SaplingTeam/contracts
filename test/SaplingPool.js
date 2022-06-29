const { expect, assert } = require("chai");
const { BigNumber } = require("ethers");

describe("SaplingPool", function() {

    let TestToken;
    let tokenContract;

    let SaplingPool;
    let poolContract;

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

        TestToken = await ethers.getContractFactory("TestToken");
        SaplingPool = await ethers.getContractFactory("SaplingPool");

        tokenContract = await TestToken.deploy(lender1.address, lender2.address, borrower1.address, borrower2.address);
        poolContract = await SaplingPool.deploy(tokenContract.address, governance.address, protocol.address, BigInt(100e18));

        PERCENT_DECIMALS = await poolContract.PERCENT_DECIMALS();
        TOKEN_DECIMALS = await tokenContract.decimals();
        TOKEN_MULTIPLIER = BigNumber.from(10).pow(TOKEN_DECIMALS);
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

            let requestLoanTx = await poolContract.connect(borrower1).requestLoan(loanAmount, loanDuration);
            loanId = BigNumber.from((await requestLoanTx.wait()).events[0].data);

            await poolContract.connect(manager).approveLoan(loanId);
            await poolContract.connect(borrower1).borrow(loanId);

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

            it ("Staking when lending is paused should fail", async function () {
                await poolContract.connect(manager).pauseLending();
                await tokenContract.connect(manager).approve(poolContract.address, stakeAmount);
                await expect(poolContract.connect(manager).stake(stakeAmount)).to.be.reverted;
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
                await poolContract.connect(borrower1).requestLoan(loanAmount, loanDuration)

                await tokenContract.connect(borrower1).approve(poolContract.address, stakeAmount);
                await expect(poolContract.connect(borrower1).stake(stakeAmount)).to.be.reverted;
            });
        });
    });

    describe("Unstaking", function () {

        let stakeAmount;
        let unstakeAmount;
        let EARLY_EXIT_COOLDOWN;

        beforeEach(async function () {
            stakeAmount = BigNumber.from(2000).mul(TOKEN_MULTIPLIER);
            unstakeAmount = BigNumber.from(500).mul(TOKEN_MULTIPLIER);
            let depositAmount = BigNumber.from(9000).mul(TOKEN_MULTIPLIER);

            await tokenContract.connect(manager).approve(poolContract.address, stakeAmount);
            await poolContract.connect(manager).stake(stakeAmount);

            await tokenContract.connect(lender1).approve(poolContract.address, depositAmount);
            await poolContract.connect(lender1).deposit(depositAmount);

            EARLY_EXIT_COOLDOWN = await poolContract.EARLY_EXIT_COOLDOWN();
        });

        it("Manager can unstake", async function () {
            let balanceBefore = await tokenContract.balanceOf(manager.address);

            await ethers.provider.send('evm_increaseTime', [EARLY_EXIT_COOLDOWN.toNumber()]);
            await ethers.provider.send('evm_mine');

            let stakedBalance = await poolContract.balanceStaked();
            await poolContract.connect(manager).unstake(unstakeAmount);
            expect(await poolContract.balanceStaked()).to.equal(stakedBalance.sub(unstakeAmount));

            expect(await tokenContract.balanceOf(manager.address)).to.equal(balanceBefore.add(unstakeAmount));
        });

        describe("Amount Unstakable", function () {
            it("Can view amount unstakable", async function () {
                let expectedUnstakable = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
    
                expect(await poolContract.amountUnstakable()).to.equal(expectedUnstakable);
            });
    
            it("Amount unstakable is zero when lending is paused", async function () {
                await poolContract.connect(manager).pauseLending();
                expect(await poolContract.amountUnstakable()).to.equal(0);
            });

            it("Amount unstakable is zero when pool is paused", async function () {
                await poolContract.connect(governance).pause();
                expect(await poolContract.amountUnstakable()).to.equal(0);
            });
        });

        it("Unstaking is reflected on the pool contract balance", async function () {
            await ethers.provider.send('evm_increaseTime', [EARLY_EXIT_COOLDOWN.toNumber()]);
            await ethers.provider.send('evm_mine');

            let prevBalance = await tokenContract.balanceOf(poolContract.address);

            await poolContract.connect(manager).unstake(unstakeAmount);

            let balance = await tokenContract.balanceOf(poolContract.address);

            expect(balance).to.equal(prevBalance.sub(unstakeAmount))
                .and.equal(await poolContract.tokenBalance());
        });

        it("Unstaking is reflected on pool liquidity", async function () {
            await ethers.provider.send('evm_increaseTime', [EARLY_EXIT_COOLDOWN.toNumber()]);
            await ethers.provider.send('evm_mine');

            let prevLiquidity = await poolContract.poolLiquidity();

            await poolContract.connect(manager).unstake(unstakeAmount);

            let liquidity = await poolContract.poolLiquidity();

            expect(liquidity).to.equal(prevLiquidity.sub(unstakeAmount));
        });

        it("Unstaking is reflected on pool funds", async function () {
            await ethers.provider.send('evm_increaseTime', [EARLY_EXIT_COOLDOWN.toNumber()]);
            await ethers.provider.send('evm_mine');

            let prevPoolFunds = await poolContract.poolFunds();

            await poolContract.connect(manager).unstake(unstakeAmount);

            let poolFunds = await poolContract.poolFunds();

            expect(poolFunds).to.equal(prevPoolFunds.sub(unstakeAmount));
        });

        describe("Rejection scenarios", function () {

            it ("Unstaking a zero amount should fail", async function () {         
                await expect(poolContract.connect(manager).unstake(0)).to.be.reverted;
            });

            it ("Unstaking an amount greater than unstakable should fail", async function () {     
                let amountUnstakable = await poolContract.amountUnstakable();   
                await expect(poolContract.connect(manager).unstake(amountUnstakable.add(1))).to.be.reverted;
            });

            it ("Unstaking when lending is paused should fail", async function () {
                await poolContract.connect(manager).pauseLending();
                await expect(poolContract.connect(manager).unstake(unstakeAmount)).to.be.reverted;
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
                await poolContract.connect(borrower1).requestLoan(loanAmount, loanDuration)

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
    
            it("Amount depositable is zero when lending is paused", async function () {
                await poolContract.connect(manager).pauseLending();
                expect(await poolContract.amountDepositable()).to.equal(0);
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

        it("Lender that has deposited is valid lender but not a valid borrower", async function () {
            await tokenContract.connect(lender1).approve(poolContract.address, depositAmount);
            await poolContract.connect(lender1).deposit(depositAmount);
            expect(await poolContract.isValidLender(lender1.address)).to.equal(true);
            expect(await poolContract.isValidBorrower(lender1.address)).to.equal(false);
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

            it ("Depositing when lending is paused should fail", async function () {
                await poolContract.connect(manager).pauseLending();
                await tokenContract.connect(lender1).approve(poolContract.address, depositAmount);
                await expect(poolContract.connect(lender1).deposit(depositAmount)).to.be.reverted;
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

            it ("Depositing as a borrower should fail", async function () {
                let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
                let loanDuration = BigNumber.from(365).mul(24*60*60);
                await poolContract.connect(borrower1).requestLoan(loanAmount, loanDuration)

                await tokenContract.connect(borrower1).approve(poolContract.address, depositAmount);
                await expect(poolContract.connect(borrower1).deposit(depositAmount)).to.be.reverted;
            });
        });
    });

    describe("Withdrawals", function () {        

        let stakeAmount;
        let depositAmount;
        let withdrawAmount;
        let EARLY_EXIT_COOLDOWN;

        beforeEach(async function () {
            stakeAmount = BigNumber.from(2000).mul(TOKEN_MULTIPLIER);
            depositAmount = BigNumber.from(10000).mul(TOKEN_MULTIPLIER);
            withdrawAmount = BigNumber.from(3000).mul(TOKEN_MULTIPLIER);

            await tokenContract.connect(manager).approve(poolContract.address, stakeAmount);
            await poolContract.connect(manager).stake(stakeAmount);

            await tokenContract.connect(lender1).approve(poolContract.address, depositAmount);
            await poolContract.connect(lender1).deposit(depositAmount);

            EARLY_EXIT_COOLDOWN = await poolContract.EARLY_EXIT_COOLDOWN();
        });

        it("Lender can withdraw", async function () {
            let tokenBalanceBefore = await tokenContract.balanceOf(lender1.address);
            let poolBalanceBefore = await poolContract.balanceOf(lender1.address);

            await ethers.provider.send('evm_increaseTime', [EARLY_EXIT_COOLDOWN.toNumber()]);
            await ethers.provider.send('evm_mine');

            await poolContract.connect(lender1).withdraw(withdrawAmount);
            expect(await poolContract.balanceOf(lender1.address)).to.equal(poolBalanceBefore.sub(withdrawAmount));

            expect(await tokenContract.balanceOf(lender1.address)).to.equal(tokenBalanceBefore.add(withdrawAmount));
        });

        it("Withdraw is reflected on the pool contract balance", async function () {
            await ethers.provider.send('evm_increaseTime', [EARLY_EXIT_COOLDOWN.toNumber()]);
            await ethers.provider.send('evm_mine');

            let prevBalance = await tokenContract.balanceOf(poolContract.address);

            await poolContract.connect(lender1).withdraw(withdrawAmount);

            let balance = await tokenContract.balanceOf(poolContract.address);
            expect(balance).to.equal(prevBalance.sub(withdrawAmount))
                .and.equal(await poolContract.tokenBalance());
        });

        it("Withdraw is reflected on pool liquidity", async function () {
            await ethers.provider.send('evm_increaseTime', [EARLY_EXIT_COOLDOWN.toNumber()]);
            await ethers.provider.send('evm_mine');

            let prevLiquidity = await poolContract.poolLiquidity();

            await poolContract.connect(lender1).withdraw(withdrawAmount);

            let liquidity = await poolContract.poolLiquidity();

            expect(liquidity).to.equal(prevLiquidity.sub(withdrawAmount));
        });

        it("Withdraw is reflected on pool funds", async function () {
            await ethers.provider.send('evm_increaseTime', [EARLY_EXIT_COOLDOWN.toNumber()]);
            await ethers.provider.send('evm_mine');

            let prevPoolFunds = await poolContract.poolFunds();

            await poolContract.connect(lender1).withdraw(withdrawAmount);

            let poolFunds = await poolContract.poolFunds();

            expect(poolFunds).to.equal(prevPoolFunds.sub(withdrawAmount));
        });

        it("Early Withdraw should charge an exit fee", async function () {
            let tokenBalanceBefore = await tokenContract.balanceOf(lender1.address);
            let exitFeePercent = await poolContract.exitFeePercent();
            let ONE_HUNDRED_PERCENT = await poolContract.ONE_HUNDRED_PERCENT();

            let expectedWithdrawalFee = withdrawAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT);

            await poolContract.connect(lender1).withdraw(withdrawAmount);

            expect(await tokenContract.balanceOf(lender1.address)).to.equal(tokenBalanceBefore.add(withdrawAmount.sub(expectedWithdrawalFee)));
        });

        describe("Withdrawal with a liquidity request", function () {
            let liquidityRequestAmount;
            beforeEach(async function () {
                liquidityRequestAmount = withdrawAmount.div(2);
                await poolContract.connect(lender1).requestLiquidity(liquidityRequestAmount);
                await ethers.provider.send('evm_increaseTime', [EARLY_EXIT_COOLDOWN.toNumber()]);
                await ethers.provider.send('evm_mine');
            });

            it("Withdrawing full requested amount sets the allocated liquidity amount to zero", async function () {
                await poolContract.connect(lender1).withdraw(liquidityRequestAmount);
                expect(await poolContract.requestedLiquidity(lender1.address)).to.equal(0);
            });

            it("Withdrawing more than the requested amount sets the allocated liquidity amount to zero", async function () {
                await poolContract.connect(lender1).withdraw(withdrawAmount);
                expect(await poolContract.requestedLiquidity(lender1.address)).to.equal(0);
            });

            it("Withdrawing less than the requested amount updates the allocated liquidity amount", async function () {
                let allocatedLiquidityBefore = await poolContract.requestedLiquidity(lender1.address);
                let amount = liquidityRequestAmount.div(2);
                await poolContract.connect(lender1).withdraw(amount);
                expect(await poolContract.requestedLiquidity(lender1.address)).to.equal(allocatedLiquidityBefore.sub(amount));
            });
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
                let loanAmount = BigNumber.from(5000).mul(TOKEN_MULTIPLIER);
                let loanDuration = BigNumber.from(365).mul(24*60*60);

                await poolContract.connect(borrower1).requestLoan(loanAmount, loanDuration);
                let loanId = (await poolContract.borrowerStats(borrower1.address)).recentLoanId;

                await poolContract.connect(manager).approveLoan(loanId);
                await poolContract.connect(borrower1).borrow(loanId);

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
                let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
                let loanDuration = BigNumber.from(365).mul(24*60*60);
                await poolContract.connect(borrower1).requestLoan(loanAmount, loanDuration);
                let loanId = (await poolContract.borrowerStats(borrower1.address)).recentLoanId;

                await poolContract.connect(manager).approveLoan(loanId);

                await expect(poolContract.connect(borrower1).withdraw(loanAmount)).to.be.reverted;
            });
        });

        describe("Protocol fees", function () {
            beforeEach(async function () {
                let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
                let loanDuration = BigNumber.from(365).mul(24*60*60);
                
                let requestLoanTx = await poolContract.connect(borrower1).requestLoan(loanAmount, loanDuration);
                loanId = BigNumber.from((await requestLoanTx.wait()).events[0].data);
                await poolContract.connect(manager).approveLoan(loanId);
                await poolContract.connect(borrower1).borrow(loanId);
    
                await ethers.provider.send('evm_increaseTime', [loan.duration.toNumber()]);
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
                await ethers.provider.send('evm_increaseTime', [EARLY_EXIT_COOLDOWN.toNumber()]);
                await ethers.provider.send('evm_mine');
    
                let prevBalance = await tokenContract.balanceOf(poolContract.address);

                let withdrawAmount = await poolContract.protocolEarningsOf(protocol.address);
                await poolContract.connect(protocol).withdrawProtocolEarnings();
    
                let balance = await tokenContract.balanceOf(poolContract.address);
                expect(balance).to.equal(prevBalance.sub(withdrawAmount))
                    .and.equal(await poolContract.tokenBalance());
            });
    
            it("Protocol fee withdrawal is not reflected on pool liquidity", async function () {
                await ethers.provider.send('evm_increaseTime', [EARLY_EXIT_COOLDOWN.toNumber()]);
                await ethers.provider.send('evm_mine');
    
                let prevLiquidity = await poolContract.poolLiquidity();

                await poolContract.connect(protocol).withdrawProtocolEarnings();
    
                let liquidity = await poolContract.poolLiquidity();
    
                expect(liquidity).to.equal(prevLiquidity);
            });
    
            it("Protocol fee withdrawal is not reflected on pool funds", async function () {
                await ethers.provider.send('evm_increaseTime', [EARLY_EXIT_COOLDOWN.toNumber()]);
                await ethers.provider.send('evm_mine');
    
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

        describe("Withdrawal requests", function () {
            beforeEach(async function () {
                let loanAmount = BigNumber.from(10000).mul(TOKEN_MULTIPLIER);
                let loanDuration = BigNumber.from(365).mul(24*60*60);
                
                let requestLoanTx = await poolContract.connect(borrower1).requestLoan(loanAmount, loanDuration);
                loanId = BigNumber.from((await requestLoanTx.wait()).events[0].data);
                await poolContract.connect(manager).approveLoan(loanId);
                await poolContract.connect(borrower1).borrow(loanId);
            });
    
            it("Lender can request liquidity for withdrawal allocation", async function () {
                let prevTotalRequestedLiquidity = await poolContract.totalRequestedLiquidity();
                let prevRequestedLiquidity = await poolContract.requestedLiquidity(lender1.address);

                await poolContract.connect(lender1).requestLiquidity(withdrawAmount);
    
                expect(await poolContract.totalRequestedLiquidity()).to.equal(prevTotalRequestedLiquidity.add(withdrawAmount));
                expect(await poolContract.requestedLiquidity(lender1.address)).to.equal(prevRequestedLiquidity.add(withdrawAmount));
            });

            it("Lender can cancel requested liquidity", async function () {
                await poolContract.connect(lender1).requestLiquidity(withdrawAmount);

                let prevTotalRequestedLiquidity = await poolContract.totalRequestedLiquidity();
                let prevRequestedLiquidity = await poolContract.requestedLiquidity(lender1.address);
                let cancelAmount = prevRequestedLiquidity.div(2);

                await poolContract.connect(lender1).cancelLiquidityRequest(cancelAmount);
    
                expect(await poolContract.totalRequestedLiquidity()).to.equal(prevTotalRequestedLiquidity.sub(cancelAmount));
                expect(await poolContract.requestedLiquidity(lender1.address)).to.equal(prevRequestedLiquidity.sub(cancelAmount));
            });

            describe("Rejection scenarios", function () {
                it("Liquidity request with a zero amount should fail", async function () {
                    await expect(poolContract.connect(lender1).requestLiquidity(0)).to.be.reverted;
                });

                it("Liquidity request with an amount greater than the lender's balance should fail", async function () {
                    let balance = await poolContract.balanceOf(lender1.address);
                    await expect(poolContract.connect(lender1).requestLiquidity(balance.add(1))).to.be.reverted;
                });

                it("Liquidity request with a cumulative amount greater than the lender's balance should fail", async function () {
                    await poolContract.connect(lender1).requestLiquidity(withdrawAmount);

                    let prevRequestedLiquidity = await poolContract.requestedLiquidity(lender1.address);
                    let balance = await poolContract.balanceOf(lender1.address);

                    await expect(poolContract.connect(lender1).requestLiquidity(balance.sub(prevRequestedLiquidity).add(1))).to.be.reverted;
                });
    
                it("Liquidity request cancellation with a zero amount should fail", async function () {
                    await poolContract.connect(lender1).requestLiquidity(withdrawAmount);
                    await expect(poolContract.connect(lender1).cancelLiquidityRequest(0)).to.be.reverted;
                });

                it("Liquidity request cancellation with an amount greater than requested should fail", async function () {
                    await poolContract.connect(lender1).requestLiquidity(withdrawAmount);
                    let prevRequestedLiquidity = await poolContract.requestedLiquidity(lender1.address);
                    await expect(poolContract.connect(lender1).cancelLiquidityRequest(prevRequestedLiquidity.add(1))).to.be.reverted;
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
            await poolContract.connect(borrower1).requestLoan(loanAmount, loanDuration);
            let loanId = (await poolContract.borrowerStats(borrower1.address)).recentLoanId;

            await poolContract.connect(manager).approveLoan(loanId);
            await poolContract.connect(borrower1).borrow(loanId);

            poolFunds = stakeAmount.add(depositAmount);
        });

        it("Can view lender APY given current pool state", async function () {
            let apr = await poolContract.templateLoanAPR();
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
            let apr = await poolContract.templateLoanAPR();
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

            expect(await poolContract.projectedLenderAPY(borrowRate)).to.equal(expectedLenderAPY);        
        });

        it("Increase in borrow rate is linearly reflected on projected lender APY within margin of integer math accuracy", async function () {
            let apr = await poolContract.templateLoanAPR();
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

            expect((await poolContract.projectedLenderAPY(borrowRate * 2)) - (expectedLenderAPY * 2)).to.lte(10);
            expect((await poolContract.projectedLenderAPY(borrowRate * 3)) - (expectedLenderAPY * 3)).to.lte(10);
        });


        describe("Rejection scenarios", function () {
            it("APY projection should fail when borrow rate of over 100% is requested", async function () {
                let ONE_HUNDRED_PERCENT = await poolContract.ONE_HUNDRED_PERCENT();
                await expect(poolContract.projectedLenderAPY(ONE_HUNDRED_PERCENT + 1)).to.be.reverted;
            });
        });
    });
  });
  