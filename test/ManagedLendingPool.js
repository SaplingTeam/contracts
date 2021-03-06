const { expect, assert } = require("chai");
const { BigNumber } = require("ethers");

describe("ManagedLendingPool (SaplingPool)", function() {

    let tokenContract;
    let poolContract;

    let manager;
    let protocol;
    let governance;
    let lender1;
    let borrower1;
    let addrs;

    let PERCENT_DECIMALS;
    let TOKEN_DECIMALS;
    let TOKEN_MULTIPLIER;

    beforeEach(async function () {
        [manager, protocol, governance, lender1, borrower1, ...addrs] = await ethers.getSigners();

        let TestUSDC = await ethers.getContractFactory("TestUSDC");
        let SaplingPool = await ethers.getContractFactory("SaplingPool");

        tokenContract = await TestUSDC.deploy();

        TOKEN_DECIMALS = await tokenContract.decimals();
        TOKEN_MULTIPLIER = BigNumber.from(10).pow(TOKEN_DECIMALS);

        let mintAmount = TOKEN_MULTIPLIER.mul(100000);

        await tokenContract.connect(manager).mint(manager.address, mintAmount);
        await tokenContract.connect(manager).mint(lender1.address, mintAmount);
        await tokenContract.connect(manager).mint(borrower1.address, mintAmount);
        await tokenContract.connect(manager).mint(addrs[0].address, mintAmount);
        await tokenContract.connect(manager).mint(addrs[1].address, mintAmount);

        poolContract = await SaplingPool.deploy(tokenContract.address, governance.address, protocol.address, manager.address);

        PERCENT_DECIMALS = await poolContract.PERCENT_DECIMALS();
    });

    describe("Initial state", function () {

        it("Pool manager address is correct", async function () {
            expect(await poolContract.manager()).to.equal(manager.address);
        });

        it("Protocol wallet address is correct", async function () {
            expect(await poolContract.protocol()).to.equal(protocol.address);
        });

        it("Token contract address is correct", async function () {
            expect(await poolContract.token()).to.equal(tokenContract.address);
        });

        it("Pool is not closed", async function () {
            expect(await poolContract.isClosed()).to.equal(false);
        });

        it("Lending is not paused", async function () {
            expect(await poolContract.isLendingPaused()).to.equal(false);
        });

        it("Target stake percent is correct", async function () {
            let minValue = 0 * 10**PERCENT_DECIMALS;
            let maxValue = 100 * 10**PERCENT_DECIMALS;
            let defaultValue = 10 * 10**PERCENT_DECIMALS;

            expect(await poolContract.ONE_HUNDRED_PERCENT()).to.equal(maxValue);
            expect(await poolContract.targetStakePercent()).to.equal(defaultValue)
                .and.gte(minValue)
                .and.lte(maxValue);
        });

        it("Target liquidity percent is correct", async function () {
            let minValue = 0 * 10**PERCENT_DECIMALS;
            let maxValue = 100 * 10**PERCENT_DECIMALS;
            let defaultValue = 0 * 10**PERCENT_DECIMALS;

            expect(await poolContract.ONE_HUNDRED_PERCENT()).to.equal(maxValue);
            expect(await poolContract.targetLiquidityPercent()).to.equal(defaultValue)
                .and.gte(minValue)
                .and.lte(maxValue);
        });

        it("Protocol fee percent is correct", async function () {
            let minValue = 0 * 10**PERCENT_DECIMALS;
            let maxValue = 10 * 10**PERCENT_DECIMALS;
            let defaultValue = 10 * 10**PERCENT_DECIMALS;

            expect(await poolContract.MAX_PROTOCOL_EARNING_PERCENT()).to.equal(maxValue);
            expect(await poolContract.protocolEarningPercent()).to.equal(defaultValue)
                .and.gte(minValue)
                .and.lte(maxValue);
        });

        it("Manager's earn factor is correct", async function () {
            let minValue = 100 * 10**PERCENT_DECIMALS;
            let maxValue = 500 * 10**PERCENT_DECIMALS;
            let defaultValue = 150 * 10**PERCENT_DECIMALS;

            expect(await poolContract.managerEarnFactorMax()).to.equal(maxValue);
            expect(await poolContract.managerEarnFactor()).to.equal(defaultValue)
                .and.gte(minValue)
                .and.lte(maxValue);
        });

        it("Early exit period is correct", async function () {
            expect(await poolContract.EARLY_EXIT_COOLDOWN()).to.equal(90*24*60*60);
        });

        it("Early exit fee is correct", async function () {
            expect(await poolContract.exitFeePercent()).to.equal(0.5*10**PERCENT_DECIMALS);
        });

        it("Loan APR is correct", async function () {
            let minValue = 0 * 10**PERCENT_DECIMALS;
            let maxValue = 100 * 10**PERCENT_DECIMALS;
            let defaultValue = 30 * 10**PERCENT_DECIMALS;

            expect(await poolContract.SAFE_MIN_APR()).to.equal(minValue);
            expect(await poolContract.SAFE_MAX_APR()).to.equal(maxValue);
            expect(await poolContract.templateLoanAPR()).to.equal(defaultValue)
                .and.gte(minValue)
                .and.lte(maxValue);
        });

        it("Loan late APR delta is correct", async function () {
            let minValue = 0 * 10**PERCENT_DECIMALS;
            let maxValue = 100 * 10**PERCENT_DECIMALS;
            let defaultValue = 5 * 10**PERCENT_DECIMALS;

            expect(await poolContract.SAFE_MIN_APR()).to.equal(minValue);
            expect(await poolContract.SAFE_MAX_APR()).to.equal(maxValue);
            expect(await poolContract.templateLateLoanAPRDelta()).to.equal(defaultValue)
                .and.gte(minValue)
                .and.lte(maxValue);
        });

        it("Empty pool lenderAPY is correct", async function () {
            expect(await poolContract.currentLenderAPY()).to.equal(0);
        });

        it("Loan grace period is correct", async function () {
            let minValue = BigNumber.from(3*24*60*60);
            let maxValue = BigNumber.from(365*24*60*60);
            let defaultValue = BigNumber.from(60*24*60*60);
            
            expect(await poolContract.MIN_LOAN_GRACE_PERIOD()).to.equal(minValue);
            expect(await poolContract.MAX_LOAN_GRACE_PERIOD()).to.equal(maxValue);
            expect(await poolContract.templateLoanGracePeriod()).to.equal(defaultValue)
                .and.gte(minValue)
                .and.lte(maxValue);
            
        });

        it("Manager inactivity grace period is correct", async function () {
            expect(await poolContract.MANAGER_INACTIVITY_GRACE_PERIOD()).to.equal(90*24*60*60);
        });

        it("Token decimals is correct", async function () {
            expect(await poolContract.tokenDecimals()).to.equal(TOKEN_DECIMALS);
            expect(await poolContract.ONE_TOKEN()).to.equal(TOKEN_MULTIPLIER.mul(1));
        });

        it("Initial balances are correct", async function () {
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

    describe("Pause Lending", function () {

        it("Manager can pause lending", async function () {
            await poolContract.connect(manager).pauseLending();
            expect(await poolContract.isLendingPaused()).to.equal(true);
        });

        it("Manager can pause lending with a non-zero borrowed amount in the pool", async function () {
            let stakeAmount = BigNumber.from(2000).mul(TOKEN_MULTIPLIER);
            let depositAmount = BigNumber.from(10000).mul(TOKEN_MULTIPLIER);

            await tokenContract.connect(manager).approve(poolContract.address, stakeAmount);
            await poolContract.connect(manager).stake(stakeAmount);

            await tokenContract.connect(lender1).approve(poolContract.address, depositAmount);
            await poolContract.connect(lender1).deposit(depositAmount);

            let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
            let loanDuration = BigNumber.from(365).mul(24*60*60);
            let requestLoanTx = await poolContract.connect(borrower1).requestLoan(loanAmount, loanDuration);
            loanId = BigNumber.from((await requestLoanTx.wait()).events[0].data);
            await poolContract.connect(manager).approveLoan(loanId);

            await poolContract.connect(manager).pauseLending();
            expect(await poolContract.isLendingPaused()).to.equal(true);
        });

        describe("Rejection scenarios", function () {
            it("Pausing lending when paused should fail", async function () {
                await poolContract.connect(manager).pauseLending();
                await expect(poolContract.connect(manager).pauseLending()).to.be.reverted;
            });

            it("Pausing lending as a non manager should fail", async function () {
                await expect(poolContract.connect(addrs[0]).pauseLending()).to.be.reverted;
            });
        });
    });

    describe("Resume Lending", function () {
        beforeEach(async function () {
            await poolContract.connect(manager).pauseLending();
        });

        it("Manager can resume lending", async function () {
            await poolContract.connect(manager).resumeLending();
            expect(await poolContract.isLendingPaused()).to.equal(false);
        });

        describe("Rejection scenarios", function () {

            it("Resuming lending when not paused should fail", async function () {
                await poolContract.connect(manager).resumeLending();
                await expect(poolContract.connect(manager).resumeLending()).to.be.reverted;
            });

            it("Resuming lending as a non manager should fail", async function () {
                await expect(poolContract.connect(addrs[0]).resumeLending()).to.be.reverted;
            });
        });
    });

    describe("Close Pool", function () {

        it("Manager can close the pool", async function () {
            await poolContract.connect(manager).close();
            expect(await poolContract.isClosed()).to.equal(true);
        });

        describe("Rejection scenarios", function () {
            it("Closing the pool with a non-zero borrowed amount should fail", async function () {
                let stakeAmount = BigNumber.from(2000).mul(TOKEN_MULTIPLIER);
                let depositAmount = BigNumber.from(10000).mul(TOKEN_MULTIPLIER);

                await tokenContract.connect(manager).approve(poolContract.address, stakeAmount);
                await poolContract.connect(manager).stake(stakeAmount);

                await tokenContract.connect(lender1).approve(poolContract.address, depositAmount);
                await poolContract.connect(lender1).deposit(depositAmount);

                let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
                let loanDuration = BigNumber.from(365).mul(24*60*60);
                let requestLoanTx = await poolContract.connect(borrower1).requestLoan(loanAmount, loanDuration);
                loanId = BigNumber.from((await requestLoanTx.wait()).events[0].data);
                await poolContract.connect(manager).approveLoan(loanId);

                await expect(poolContract.connect(manager).close()).to.be.reverted;
            });

            it("Closing the pool when closed should fail", async function () {
                await poolContract.connect(manager).close();
                await expect(poolContract.connect(manager).close()).to.be.reverted;
            });

            it("Closing the pool as a non manager should fail", async function () {
                await expect(poolContract.connect(addrs[0]).close()).to.be.reverted;
            });
        });
    });

    describe("Open Pool", function () {
        beforeEach(async function () {
            await poolContract.connect(manager).close();
        });

        it("Manager can open the pool", async function () {
            await poolContract.connect(manager).open();
            expect(await poolContract.isClosed()).to.equal(false);
        });

        describe("Rejection scenarios", function () {

            it("Opening the pool when not closed should fail", async function () {
                await poolContract.connect(manager).open();
                await expect(poolContract.connect(manager).open()).to.be.reverted;
            });

            it("Opening the pool as a non manager should fail", async function () {
                await expect(poolContract.connect(addrs[0]).open()).to.be.reverted;
            });
        });
    });

    describe("Setting pool parameters", function () {
        describe("Target stake percent", function () {
            it("Governance can set target stake percent", async function () {
                let currentValue = await poolContract.targetStakePercent();
                let maxValue = await poolContract.ONE_HUNDRED_PERCENT();

                let newValue = 50 * 10 ** PERCENT_DECIMALS;
                assert(newValue != currentValue && newValue <= maxValue);

                await poolContract.connect(governance).setTargetStakePercent(newValue);
                expect(await poolContract.targetStakePercent()).to.equal(newValue);
            });

            describe("Rejection scenarios", function () {
                it("Target stake percent cannot be set to a value greater than the allowed maximum", async function () {
                    let currentValue = await poolContract.targetStakePercent();
                    let maxValue = await poolContract.ONE_HUNDRED_PERCENT();
    
                    await expect(poolContract.connect(governance).setTargetStakePercent(maxValue + 1)).to.be.reverted;
                });

                it("A non-governance cannot set target stake percent", async function () {
                    let currentValue = await poolContract.targetStakePercent();
                    let maxValue = await poolContract.ONE_HUNDRED_PERCENT();
    
                    let newValue = 50 * 10 ** PERCENT_DECIMALS;
                    assert(newValue != currentValue && newValue <= maxValue);
    
                    await expect(poolContract.connect(manager).setTargetStakePercent(newValue)).to.be.reverted;
                });

            });
        });

        describe("Target liquidity percent", function () {
            it("Manager can set target liquidity percent", async function () {
                let currentValue = await poolContract.targetLiquidityPercent();
                let maxValue = await poolContract.ONE_HUNDRED_PERCENT();

                let newValue = 50 * 10 ** PERCENT_DECIMALS;
                assert(newValue != currentValue && newValue <= maxValue);

                await poolContract.connect(manager).setTargetLiquidityPercent(newValue);
                expect(await poolContract.targetLiquidityPercent()).to.equal(newValue);
            });

            describe("Rejection scenarios", function () {
                it("Target liquidity percent cannot be set to a value greater than the allowed maximum", async function () {
                    let currentValue = await poolContract.targetLiquidityPercent();
                    let maxValue = await poolContract.ONE_HUNDRED_PERCENT();
    
                    await expect(poolContract.connect(manager).setTargetLiquidityPercent(maxValue + 1)).to.be.reverted;
                });

                it("A non-manager cannot set target liquidity percent", async function () {
                    let currentValue = await poolContract.targetLiquidityPercent();
                    let maxValue = await poolContract.ONE_HUNDRED_PERCENT();
    
                    let newValue = 50 * 10 ** PERCENT_DECIMALS;
                    assert(newValue != currentValue && newValue <= maxValue);
    
                    await expect(poolContract.connect(governance).setTargetLiquidityPercent(newValue)).to.be.reverted;
                });

            });
        });
        
        describe("Protocol fee percent", function () {
            it("Governance can set protocol fee percent", async function () {
                let currentValue = await poolContract.protocolEarningPercent();
                let maxValue = await poolContract.MAX_PROTOCOL_EARNING_PERCENT();

                let newValue = 2 * 10 ** PERCENT_DECIMALS;
                assert(newValue != currentValue && newValue <= maxValue);

                await poolContract.connect(governance).setProtocolEarningPercent(newValue);
                expect(await poolContract.protocolEarningPercent()).to.equal(newValue);
            });

            describe("Rejection scenarios", function () {
                it("Protocol fee percent cannot be set to a value greater than the allowed maximum", async function () {
                    let currentValue = await poolContract.protocolEarningPercent();
                    let maxValue = await poolContract.MAX_PROTOCOL_EARNING_PERCENT();
    
                    await expect(poolContract.connect(governance).setProtocolEarningPercent(maxValue + 1)).to.be.reverted;
                });

                it("A non-governance cannot set protocol fee percent", async function () {
                    let currentValue = await poolContract.protocolEarningPercent();
                    let maxValue = await poolContract.MAX_PROTOCOL_EARNING_PERCENT();

                    let newValue = 2 * 10 ** PERCENT_DECIMALS;
                    assert(newValue != currentValue && newValue <= maxValue);
    
                    await expect(poolContract.connect(manager).setProtocolEarningPercent(newValue)).to.be.reverted;
                });
            });
        });

        describe("Manager's earn factor", function () {
            it("Manager can set manager's earn factor", async function () {
                let currentValue = await poolContract.managerEarnFactor();
                let minValue = await poolContract.ONE_HUNDRED_PERCENT();
                let maxValue = await poolContract.managerEarnFactorMax();

                let newValue = 125 * 10 ** PERCENT_DECIMALS;
                assert(newValue != currentValue && minValue <= newValue && newValue <= maxValue);

                await poolContract.connect(manager).setManagerEarnFactor(newValue);
                expect(await poolContract.managerEarnFactor()).to.equal(newValue);
            });

            describe("Rejection scenarios", function () {
                it("Manager's earn factor cannot be set to a value less than the allowed minimum", async function () {
                    let minValue = await poolContract.ONE_HUNDRED_PERCENT();
                    assert(minValue > 0);
                    await expect(poolContract.connect(manager).setManagerEarnFactor(minValue - 1)).to.be.reverted;
                });

                it("Manager's earn factor cannot be set to a value greater than the allowed maximum", async function () {
                    let maxValue = await poolContract.managerEarnFactorMax();
                    await expect(poolContract.connect(manager).setManagerEarnFactor(maxValue + 1)).to.be.reverted;
                });

                it("Manager's earn factor cannot be set while the pool is paused", async function () {
                    let currentValue = await poolContract.managerEarnFactor();
                    let minValue = await poolContract.ONE_HUNDRED_PERCENT();
                    let maxValue = await poolContract.managerEarnFactorMax();

                    let newValue = 125 * 10 ** PERCENT_DECIMALS;
                    assert(newValue != currentValue && minValue <= newValue && newValue <= maxValue);

                    await poolContract.connect(governance).pause();

                    await expect(poolContract.connect(manager).setManagerEarnFactor(newValue)).to.be.reverted;
                });

                it("A non-manager cannot set manager's earn factor", async function () {
                    let currentValue = await poolContract.managerEarnFactor();
                    let minValue = await poolContract.ONE_HUNDRED_PERCENT();
                    let maxValue = await poolContract.managerEarnFactorMax();

                    let newValue = 125 * 10 ** PERCENT_DECIMALS;
                    assert(newValue != currentValue && minValue <= newValue && newValue <= maxValue);
    
                    await expect(poolContract.connect(governance).setManagerEarnFactor(newValue)).to.be.reverted;
                });

            });
        });

        describe("Maximum for Manager's earn factor", function () {
            it("Governance can set a maximum for manager's earn factor", async function () {
                let currentValue = await poolContract.managerEarnFactorMax();
                let minValue = await poolContract.ONE_HUNDRED_PERCENT();
                
                let newValue = currentValue - 1;
                assert(currentValue >= minValue);

                await poolContract.connect(governance).setManagerEarnFactorMax(newValue);
                expect(await poolContract.managerEarnFactorMax()).to.equal(newValue);
            });

            it("Setting the maximum for manager's earn factor to less than current earn factor value will update the current earn factor", async function () {
                let prevEarnFactor = await poolContract.managerEarnFactor();
                let currentValue = await poolContract.managerEarnFactorMax();
                let minValue = await poolContract.ONE_HUNDRED_PERCENT();
                
                let newValue = prevEarnFactor - 1;
                assert(currentValue >= minValue);

                await poolContract.connect(governance).setManagerEarnFactorMax(newValue);
                expect(await poolContract.managerEarnFactorMax()).to.equal(newValue);
                expect(await poolContract.managerEarnFactor()).to.equal(newValue);
            });

            describe("Rejection scenarios", function () {
                it("Maximum for Manager's earn factor cannot be set to a value less than the allowed minimum", async function () {
                    let minValue = await poolContract.ONE_HUNDRED_PERCENT();
                    assert(minValue > 0);
                    await expect(poolContract.connect(governance).setManagerEarnFactorMax(minValue - 1)).to.be.reverted;
                });

                it("A non-governance cannot set a maximum for manager's earn factor", async function () {
                    let currentValue = await poolContract.managerEarnFactorMax();
                    let minValue = await poolContract.ONE_HUNDRED_PERCENT();
                    let maxValue = await poolContract.managerEarnFactorMax();

                    let newValue = 125 * 10 ** PERCENT_DECIMALS;
                    assert(newValue != currentValue && minValue <= newValue && newValue <= maxValue);
    
                    await expect(poolContract.connect(manager).setManagerEarnFactorMax(newValue)).to.be.reverted;
                });
            });
        });

        describe("Loan APR", function () {
            it("Manager can set a template loan APR", async function () {
                let currentValue = await poolContract.templateLoanAPR();
                let minValue = await poolContract.SAFE_MIN_APR();
                let maxValue = await poolContract.SAFE_MAX_APR();

                let newValue = 40 * 10 ** PERCENT_DECIMALS;
                assert(newValue != currentValue && minValue <= newValue && newValue <= maxValue);

                await poolContract.connect(manager).setTemplateLoanAPR(newValue);
                expect(await poolContract.templateLoanAPR()).to.equal(newValue);
            });

            describe("Rejection scenarios", function () {
                it("Loan APR cannot be set to a value less than the allowed minimum", async function () {
                    let minValue = await poolContract.SAFE_MIN_APR();
                    if (minValue > 0) {
                        await expect(poolContract.connect(manager).setTemplateLoanAPR(minValue - 1)).to.be.reverted;
                    }
                });

                it("Loan APR cannot be set to a value greater than the allowed maximum", async function () {
                    let maxValue = await poolContract.SAFE_MAX_APR();
                    await expect(poolContract.connect(manager).setTemplateLoanAPR(maxValue + 1)).to.be.reverted;
                });

                it("Loan APR cannot be set while the pool is paused", async function () {
                    let currentValue = await poolContract.templateLoanAPR();
                    let minValue = await poolContract.SAFE_MIN_APR();
                    let maxValue = await poolContract.SAFE_MAX_APR();

                    let newValue = 40 * 10 ** PERCENT_DECIMALS;
                    assert(newValue != currentValue && minValue <= newValue && newValue <= maxValue);

                    await poolContract.connect(governance).pause();

                    await expect(poolContract.connect(manager).setTemplateLoanAPR(newValue)).to.be.reverted;
                });

                it("A non-manager cannot set the loan APR", async function () {
                    let currentValue = await poolContract.templateLoanAPR();
                    let minValue = await poolContract.SAFE_MIN_APR();
                    let maxValue = await poolContract.SAFE_MAX_APR();

                    let newValue = 40 * 10 ** PERCENT_DECIMALS;
                    assert(newValue != currentValue && minValue <= newValue && newValue <= maxValue);
    
                    await expect(poolContract.connect(governance).setTemplateLoanAPR(newValue)).to.be.reverted;
                });

            });
        });

        describe("Loan late payment APR delta", function () {
            it("Manager can set a template loan late payment APR delta", async function () {
                let currentValue = await poolContract.templateLateLoanAPRDelta();
                let minValue = await poolContract.SAFE_MIN_APR();
                let maxValue = await poolContract.SAFE_MAX_APR();

                let newValue = 40 * 10 ** PERCENT_DECIMALS;
                assert(newValue != currentValue && minValue <= newValue && newValue <= maxValue);

                await poolContract.connect(manager).setTemplateLateLoanAPRDelta(newValue);
                expect(await poolContract.templateLateLoanAPRDelta()).to.equal(newValue);
            });

            describe("Rejection scenarios", function () {
                it("Loan late payment APR delta cannot be set to a value less than the allowed minimum", async function () {
                    let minValue = await poolContract.SAFE_MIN_APR();
                    if (minValue > 0) {
                        await expect(poolContract.connect(manager).setTemplateLateLoanAPRDelta(minValue - 1)).to.be.reverted;
                    }
                });

                it("Loan late payment APR delta cannot be set to a value greater than the allowed maximum", async function () {
                    let maxValue = await poolContract.SAFE_MAX_APR();
                    await expect(poolContract.connect(manager).setTemplateLateLoanAPRDelta(maxValue + 1)).to.be.reverted;
                });

                it("Loan late payment APR delta cannot be set while the pool is paused", async function () {
                    let currentValue = await poolContract.templateLateLoanAPRDelta();
                    let minValue = await poolContract.SAFE_MIN_APR();
                    let maxValue = await poolContract.SAFE_MAX_APR();

                    let newValue = 40 * 10 ** PERCENT_DECIMALS;
                    assert(newValue != currentValue && minValue <= newValue && newValue <= maxValue);

                    await poolContract.connect(governance).pause();

                    await expect(poolContract.connect(manager).setTemplateLateLoanAPRDelta(newValue)).to.be.reverted;
                });

                it("A non-manager cannot set the loan late payment APR delta", async function () {
                    let currentValue = await poolContract.templateLateLoanAPRDelta();
                    let minValue = await poolContract.SAFE_MIN_APR();
                    let maxValue = await poolContract.SAFE_MAX_APR();

                    let newValue = 40 * 10 ** PERCENT_DECIMALS;
                    assert(newValue != currentValue && minValue <= newValue && newValue <= maxValue);
    
                    await expect(poolContract.connect(governance).setTemplateLateLoanAPRDelta(newValue)).to.be.reverted;
                });

            });
        });

        describe("Minimum loan amount", function () {
            it("Manager can set a minimum loan amount", async function () {
                let currentValue = await poolContract.minLoanAmount();
                let newValue = currentValue.add(1);

                await poolContract.connect(manager).setMinLoanAmount(newValue);
                expect(await poolContract.minLoanAmount()).to.equal(newValue);
            });

            describe("Rejection scenarios", function () {
                it("Minimum loan amount cannot be set to a value less than the allowed minimum", async function () {
                    let minValue = await poolContract.SAFE_MIN_AMOUNT();
                    await expect(poolContract.connect(manager).setMinLoanAmount(minValue.sub(1))).to.be.reverted;
                });

                it("Minimum loan amount cannot be set while the pool is paused", async function () {
                    let currentValue = await poolContract.minLoanAmount();
                    let newValue = currentValue.add(1);

                    await poolContract.connect(governance).pause();

                    await expect(poolContract.connect(manager).setMinLoanAmount(newValue)).to.be.reverted;
                });

                it("A non-manager cannot set the loan APR", async function () {
                    let currentValue = await poolContract.minLoanAmount();
                let newValue = currentValue.add(1);
    
                    await expect(poolContract.connect(governance).setMinLoanAmount(newValue)).to.be.reverted;
                });

            });
        });

        describe("Minimum loan duration", function () {
            it("Manager can set a template minimum loan duration", async function () {
                let currentValue = await poolContract.minLoanDuration();
                let maxValue = await poolContract.maxLoanDuration();

                let newValue = currentValue.add(1);
                assert(newValue.lte(maxValue));

                await poolContract.connect(manager).setMinLoanDuration(newValue);
                expect(await poolContract.minLoanDuration()).to.equal(newValue);
            });

            describe("Rejection scenarios", function () {
                it("Minimum loan duration cannot be set to a value less than the allowed minimum", async function () {
                    let minValue = await poolContract.SAFE_MIN_DURATION();
                    if (minValue > 0) {
                        await expect(poolContract.connect(manager).setMinLoanDuration(minValue.sub(1))).to.be.reverted;
                    }
                });

                it("Minimum loan duration cannot be set to a value greater than the allowed maximum", async function () {
                    let maxValue = await poolContract.maxLoanDuration();
                    await expect(poolContract.connect(manager).setMinLoanDuration(maxValue.add(1))).to.be.reverted;
                });

                it("Minimum loan duration cannot be set while the pool is paused", async function () {
                    let currentValue = await poolContract.minLoanDuration();
                    let maxValue = await poolContract.maxLoanDuration();

                    let newValue = currentValue.add(1);
                    assert(newValue.lte(maxValue));

                    await poolContract.connect(governance).pause();

                    await expect(poolContract.connect(manager).setMinLoanDuration(newValue)).to.be.reverted;
                });

                it("A non-manager cannot set the minimum loan duration", async function () {
                    let currentValue = await poolContract.minLoanDuration();
                    let maxValue = await poolContract.maxLoanDuration();

                    let newValue = currentValue.add(1);
                    assert(newValue.lte(maxValue));
    
                    await expect(poolContract.connect(governance).setMinLoanDuration(newValue)).to.be.reverted;
                });

            });
        });

        describe("Maximum loan duration", function () {
            it("Manager can set a template maximum loan duration", async function () {
                let currentValue = await poolContract.maxLoanDuration();
                let minValue = await poolContract.minLoanDuration();
                let maxValue = await poolContract.SAFE_MAX_DURATION();

                let newValue = currentValue.sub(1);
                assert(minValue.lte(newValue) && newValue.lte(maxValue));

                await poolContract.connect(manager).setMaxLoanDuration(newValue);
                expect(await poolContract.maxLoanDuration()).to.equal(newValue);
            });

            describe("Rejection scenarios", function () {
                it("Maximum loan duration cannot be set to a value less than the allowed minimum", async function () {
                    let minValue = await poolContract.minLoanDuration();
                    if (minValue > 0) {
                        await expect(poolContract.connect(manager).setMaxLoanDuration(minValue.sub(1))).to.be.reverted;
                    }
                });

                it("Maximum loan duration cannot be set to a value greater than the allowed maximum", async function () {
                    let maxValue = await poolContract.SAFE_MAX_DURATION();
                    await expect(poolContract.connect(manager).setMaxLoanDuration(maxValue.add(1))).to.be.reverted;
                });

                it("Maximum loan duration cannot be set while the pool is paused", async function () {
                    let currentValue = await poolContract.maxLoanDuration();
                    let minValue = await poolContract.minLoanDuration();
                    let maxValue = await poolContract.SAFE_MAX_DURATION();

                    let newValue = currentValue.sub(1);
                    assert(minValue.lte(newValue) && newValue.lte(maxValue));

                    await poolContract.connect(governance).pause();

                    await expect(poolContract.connect(manager).setMaxLoanDuration(newValue)).to.be.reverted;
                });

                it("A non-manager cannot set the maximum loan duration", async function () {
                    let currentValue = await poolContract.maxLoanDuration();
                    let minValue = await poolContract.minLoanDuration();
                    let maxValue = await poolContract.SAFE_MAX_DURATION();

                    let newValue = currentValue.sub(1);
                    assert(minValue.lte(newValue) && newValue.lte(maxValue));
    
                    await expect(poolContract.connect(governance).setMaxLoanDuration(newValue)).to.be.reverted;
                });

            });
        });
        
        describe("Loan grace period", function () {
            it("Manager can set a template loan grace period", async function () {
                let currentValue = await poolContract.templateLoanGracePeriod();
                let minValue = await poolContract.MIN_LOAN_GRACE_PERIOD();
                let maxValue = await poolContract.MAX_LOAN_GRACE_PERIOD();

                let newValue = currentValue.add(1);
                assert(minValue.lte(newValue) && newValue.lte(maxValue));

                await poolContract.connect(manager).setTemplateLoanGracePeriod(newValue);
                expect(await poolContract.templateLoanGracePeriod()).to.equal(newValue);
            });

            describe("Rejection scenarios", function () {
                it("Loan grace period cannot be set to a value less than the allowed minimum", async function () {
                    let minValue = await poolContract.MIN_LOAN_GRACE_PERIOD();
                    if (minValue > 0) {
                        await expect(poolContract.connect(manager).setTemplateLoanGracePeriod(minValue.sub(1))).to.be.reverted;
                    }
                });

                it("Loan grace period cannot be set to a value greater than the allowed maximum", async function () {
                    let maxValue = await poolContract.MAX_LOAN_GRACE_PERIOD();
                    await expect(poolContract.connect(manager).setTemplateLoanGracePeriod(maxValue.add(1))).to.be.reverted;
                });

                it("Loan grace period cannot be set while the pool is paused", async function () {
                    let currentValue = await poolContract.templateLoanGracePeriod();
                    let minValue = await poolContract.MIN_LOAN_GRACE_PERIOD();
                    let maxValue = await poolContract.MAX_LOAN_GRACE_PERIOD();

                    let newValue = currentValue.add(1);
                    assert(minValue.lte(newValue) && newValue.lte(maxValue));

                    await poolContract.connect(governance).pause();

                    await expect(poolContract.connect(manager).setTemplateLoanGracePeriod(newValue)).to.be.reverted;
                });

                it("A non-manager cannot set the loan grace period", async function () {
                    let currentValue = await poolContract.templateLoanGracePeriod();
                    let minValue = await poolContract.MIN_LOAN_GRACE_PERIOD();
                    let maxValue = await poolContract.MAX_LOAN_GRACE_PERIOD();
    
                    let newValue = currentValue.add(1);
                    assert(minValue.lte(newValue) && newValue.lte(maxValue));
    
                    await expect(poolContract.connect(governance).setTemplateLoanGracePeriod(newValue)).to.be.reverted;
                });

            });
        });
    });
  });
  