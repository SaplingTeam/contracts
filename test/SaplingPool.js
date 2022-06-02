const { expect } = require("chai");
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
            let depositAmount = BigNumber.from(10000).mul(TOKEN_MULTIPLIER);

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
            let earlyExitFeePercent = await poolContract.earlyExitFeePercent();
            let ONE_HUNDRED_PERCENT = await poolContract.ONE_HUNDRED_PERCENT();

            let expectedWithdrawalFee = withdrawAmount.mul(earlyExitFeePercent).div(ONE_HUNDRED_PERCENT);

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
            });
        });
    });
  });
  