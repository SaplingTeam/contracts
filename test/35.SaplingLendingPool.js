const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { ethers, upgrades } = require('hardhat');
const { assertHardhatInvariant } = require('hardhat/internal/core/errors');
const { TOKEN_DECIMALS, TOKEN_MULTIPLIER, NIL_UUID, NIL_DIGEST } = require('./utils/constants');
const { mintAndApprove, expectEqualsWithinMargin } = require('./utils/helpers');
const { snapshot, rollback, skipEvmTime } = require('./utils/evmControl');
const { deployEnv, deployProtocol } = require('./utils/deployer');

let evmSnapshotIds = [];

describe('Sapling Lending Pool', function () {
    let e; // initialized environment metadata
    let p; // deployed protocol metadata

    beforeEach(async function () {
        await snapshot(evmSnapshotIds);
    });

    afterEach(async function () {
        await rollback(evmSnapshotIds);
    });

    before(async function () {
        e = await deployEnv();
        p = await deployProtocol(e);

        await mintAndApprove(e.assetToken, e.deployer, e.staker, p.pool.address, 10 ** TOKEN_DECIMALS);
        await p.pool.connect(e.staker).initialMint();

        await p.pool.connect(e.staker).open();
        await p.loanDesk.connect(e.staker).open();
    });

    describe('Deployment', function () {
        it('Can deploy', async function () {
            let poolToken2 = await (
                await ethers.getContractFactory('PoolToken')
            ).deploy('Sapling Test Lending Pool Token', 'SLPT', TOKEN_DECIMALS);

            await expect(
                upgrades.deployProxy(await ethers.getContractFactory('SaplingLendingPool'), [
                    poolToken2.address,
                    e.assetToken.address,
                    p.accessControl.address,
                    e.treasury.address,
                    e.staker.address,
                ]),
            ).to.be.not.reverted;
        });

        describe('Rejection Scenarios', function () {});
    });

    describe('Initial state', function () {
        it('Loan count is correct', async function () {
            expect(await p.loanDesk.loansCount()).to.equal(0);
        });

        it('Empty pool cannot offer any nonzero loan amount', async function () {
            expect(await p.pool.canOffer(1)).to.equal(false);
        });
    });

    describe('Use Cases', function () {
        const LoanStatus = {
            NULL: 0,
            OUTSTANDING: 1,
            REPAID: 2,
            DEFAULTED: 3,
        };

        let PERCENT_DECIMALS;
        let ONE_HUNDRED_PERCENT;
        let exitFeePercent;

        let lender1;
        let lender2;
        let lender3;
        let borrower1;
        let borrower2;

        let stakeAmount;
        let unstakeAmount;
        let depositAmount;
        let withdrawAmount;
        let loanAmount;
        let loanDuration;

        before(async function () {
            PERCENT_DECIMALS = await p.pool.percentDecimals();
            ONE_HUNDRED_PERCENT = 100 * 10 ** PERCENT_DECIMALS;
            exitFeePercent = (await p.pool.config()).exitFeePercent;

            lender1 = e.users[1];
            lender2 = e.users[2];
            lender3 = e.users[3];

            borrower1 = e.users[4];
            borrower2 = e.users[5];

            stakeAmount = BigNumber.from(2000).mul(TOKEN_MULTIPLIER);
            unstakeAmount = BigNumber.from(500).mul(TOKEN_MULTIPLIER);
            depositAmount = BigNumber.from(9000).mul(TOKEN_MULTIPLIER);
            withdrawAmount = BigNumber.from(3000).mul(TOKEN_MULTIPLIER);
            loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
            loanDuration = BigNumber.from(365).mul(24 * 60 * 60);

            await mintAndApprove(e.assetToken, e.deployer, e.staker, p.pool.address, stakeAmount);
            await p.pool.connect(e.staker).stake(stakeAmount);

            await mintAndApprove(e.assetToken, e.deployer, lender1, p.pool.address, depositAmount);
            await p.pool.connect(lender1).deposit(depositAmount);
        });

        describe('Initial state', function () {});

        describe('Setting pool parameters', function () {
            describe('Loan Desk', function () {});
        });

        describe('Close Pool', function () {
            it('Staker can close the pool', async function () {
                await p.pool.connect(e.staker).close();
                expect(await p.pool.closed()).to.equal(true);
            });

            describe('Rejection scenarios', function () {
                it('Closing the pool with a non-zero borrowed amount should fail', async function () {
                    await p.loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
                    let applicationId = await p.loanDesk.recentApplicationIdOf(borrower1.address);
                    let gracePeriod = (await p.loanDesk.loanTemplate()).gracePeriod;
                    let installments = 1;
                    let apr = (await p.loanDesk.loanTemplate()).apr;
                    await p.loanDesk
                        .connect(e.staker)
                        .draftOffer(applicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);
                    await p.loanDesk.connect(e.staker).lockDraftOffer(applicationId);
                    await skipEvmTime(2 * 24 * 60 * 60 + 1);
                    await p.loanDesk.connect(e.staker).offerLoan(applicationId);
                    await p.loanDesk.connect(borrower1).borrow(applicationId);

                    await expect(p.pool.connect(e.staker).close()).to.be.reverted;
                });
            });
        });

        describe('Borrow', function () {
            let applicationId;

            after(async function () {
                await rollback(evmSnapshotIds);
            });

            before(async function () {
                await snapshot(evmSnapshotIds);

                gracePeriod = (await p.loanDesk.loanTemplate()).gracePeriod;
                installments = 1;
                apr = (await p.loanDesk.loanTemplate()).apr;

                let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
                let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);
                await p.loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
                applicationId = await p.loanDesk.recentApplicationIdOf(borrower1.address);
                application = await p.loanDesk.loanApplications(applicationId);
                await p.loanDesk
                    .connect(e.staker)
                    .draftOffer(
                        applicationId,
                        application.amount,
                        application.duration,
                        gracePeriod,
                        0,
                        installments,
                        apr,
                    );
            });

            it('Borrowers can borrow', async function () {
                let balanceBefore = await e.assetToken.balanceOf(borrower1.address);
                await p.loanDesk.connect(e.staker).lockDraftOffer(applicationId);
                await skipEvmTime(2 * 24 * 60 * 60 + 1);
                await p.loanDesk.connect(e.staker).offerLoan(applicationId);
                let tx = await p.loanDesk.connect(borrower1).borrow(applicationId);
                let loanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0].args.loanId;

                let loan = await p.loanDesk.loans(loanId);
                expect(loan.status).to.equal(LoanStatus.OUTSTANDING);

                expect(await e.assetToken.balanceOf(borrower1.address)).to.equal(balanceBefore.add(loan.amount));
            });

            describe('Rejection scenarios', function () {
                it('Borrowing a loan that is not in APPROVED status should fail', async function () {
                    await p.loanDesk.connect(e.staker).cancelLoan(applicationId);
                    await expect(p.loanDesk.connect(borrower1).borrow(applicationId)).to.be.reverted;
                });

                it('Borrowing a loan when the pool is paused should fail', async function () {
                    await p.pool.connect(e.governance).pause();
                    await expect(p.loanDesk.connect(borrower1).borrow(applicationId)).to.be.reverted;
                });

                it('Borrowing a nonexistent loan should fail', async function () {
                    await expect(p.loanDesk.connect(lender1).borrow(applicationId.add(1))).to.be.reverted;
                });

                it('Borrowing a loan as the protocol should fail', async function () {
                    await expect(p.loanDesk.connect(e.treasury).borrow(applicationId)).to.be.reverted;
                });

                it('Borrowing a loan as the governance should fail', async function () {
                    await expect(p.loanDesk.connect(e.governance).borrow(applicationId)).to.be.reverted;
                });

                it('Borrowing a loan as a lender should fail', async function () {
                    await expect(p.loanDesk.connect(lender1).borrow(applicationId)).to.be.reverted;
                });

                it('Borrowing a loan from an unrelated address should fail', async function () {
                    await expect(p.loanDesk.connect(e.users[0]).borrow(applicationId)).to.be.reverted;
                });
            });
        });

        describe('Repay/Default Loans', function () {
            let loanId;

            after(async function () {
                await rollback(evmSnapshotIds);
            });

            before(async function () {
                await snapshot(evmSnapshotIds);

                await p.loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
                let applicationId = await p.loanDesk.recentApplicationIdOf(borrower1.address);
                let gracePeriod = (await p.loanDesk.loanTemplate()).gracePeriod;
                let installments = 1;
                let apr = (await p.loanDesk.loanTemplate()).apr;
                await p.loanDesk
                    .connect(e.staker)
                    .draftOffer(applicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);
                await p.loanDesk.connect(e.staker).lockDraftOffer(applicationId);
                await skipEvmTime(2 * 24 * 60 * 60 + 1);
                await p.loanDesk.connect(e.staker).offerLoan(applicationId);
                let tx = await p.loanDesk.connect(borrower1).borrow(applicationId);
                loanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0].args.loanId;
            });

            describe('Repay', function () {
                it('Borrower can do a partial payment', async function () {
                    let loan = await p.loanDesk.loans(loanId);

                    await skipEvmTime(loan.duration.toNumber());

                    let paymentAmount = (await p.loanDesk.loanBalanceDue(loanId)).div(2);

                    await mintAndApprove(e.assetToken, e.deployer, borrower1, p.pool.address, paymentAmount);
                    await expect(p.loanDesk.connect(borrower1).repay(loanId, paymentAmount)).to.changeTokenBalance(
                        e.assetToken,
                        borrower1.address,
                        -paymentAmount,
                    );

                    let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

                    loan = await p.loanDesk.loans(loanId);
                    let loanDetail = await p.loanDesk.loanDetails(loanId);
                    expect(loanDetail.totalAmountRepaid).to.equal(paymentAmount);
                    expect(loan.status).to.equal(LoanStatus.OUTSTANDING);
                });

                it('Borrower can do full payments', async function () {
                    let balanceBefore = await e.assetToken.balanceOf(borrower1.address);
                    let loan = await p.loanDesk.loans(loanId);

                    await skipEvmTime(loan.duration.toNumber() - 60);

                    let paymentAmount = await p.loanDesk.loanBalanceDue(loanId);

                    await mintAndApprove(e.assetToken, e.deployer, borrower1, p.pool.address, paymentAmount);
                    await expect(p.loanDesk.connect(borrower1).repay(loanId, paymentAmount)).to.changeTokenBalance(
                        e.assetToken,
                        borrower1.address,
                        -paymentAmount,
                    );
                    let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

                    let loanDetail = await p.loanDesk.loanDetails(loanId);
                    expect(loanDetail.totalAmountRepaid).to.equal(paymentAmount);
                    expect((await p.loanDesk.loans(loanId)).status).to.equal(LoanStatus.REPAID);
                });

                it('3rd party can do a partial payment on behalf of the borrower', async function () {
                    let loan = await p.loanDesk.loans(loanId);

                    await skipEvmTime(loan.duration.toNumber());

                    let paymentAmount = (await p.loanDesk.loanBalanceDue(loanId)).div(2);

                    await mintAndApprove(e.assetToken, e.deployer, lender3, p.pool.address, paymentAmount);
                    await expect(
                        p.loanDesk.connect(lender3).repayOnBehalf(loanId, paymentAmount, borrower1.address),
                    ).to.changeTokenBalance(e.assetToken, lender3.address, -paymentAmount);
                    let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

                    loan = await p.loanDesk.loans(loanId);
                    let loanDetail = await p.loanDesk.loanDetails(loanId);
                    expect(loanDetail.totalAmountRepaid).to.equal(paymentAmount);
                    expect(loan.status).to.equal(LoanStatus.OUTSTANDING);
                });

                it('3rd party can do full payments on behalf of the borrower', async function () {
                    let loan = await p.loanDesk.loans(loanId);

                    await skipEvmTime(loan.duration.toNumber() - 60);

                    let paymentAmount = await p.loanDesk.loanBalanceDue(loanId);

                    await mintAndApprove(e.assetToken, e.deployer, lender3, p.pool.address, paymentAmount);
                    await expect(
                        p.loanDesk.connect(lender3).repayOnBehalf(loanId, paymentAmount, borrower1.address),
                    ).to.changeTokenBalance(e.assetToken, lender3.address, -paymentAmount);
                    let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

                    let loanDetail = await p.loanDesk.loanDetails(loanId);
                    expect(loanDetail.totalAmountRepaid).to.equal(paymentAmount);
                    expect((await p.loanDesk.loans(loanId)).status).to.equal(LoanStatus.REPAID);
                });

                it('Repaying a loan will transfer earnings to the staker', async function () {
                    let balanceBefore = await e.assetToken.balanceOf(e.staker.address);
                    let loan = await p.loanDesk.loans(loanId);

                    await skipEvmTime(loan.duration.toNumber());

                    let paymentAmount = await p.loanDesk.loanBalanceDue(loanId);

                    let protocolEarningPercent = (await p.pool.config()).protocolFeePercent;
                    // let ONE_HUNDRED_PERCENT = await lendingPool.HUNDRED_PERCENT();

                    let stakedShares = (await p.pool.balances()).stakedShares;
                    let totalPoolShares = await p.poolToken.totalSupply();
                    let stakerExcessLeverageComponent = (await p.pool.config()).stakerEarnFactor - ONE_HUNDRED_PERCENT;

                    let currentStakePercent = stakedShares.mul(ONE_HUNDRED_PERCENT).div(totalPoolShares);
                    let stakerEarningsPercent = currentStakePercent
                        .mul(stakerExcessLeverageComponent)
                        .div(ONE_HUNDRED_PERCENT);

                    await mintAndApprove(e.assetToken, e.deployer, borrower1, p.pool.address, paymentAmount);
                    await p.loanDesk.connect(borrower1).repay(loanId, paymentAmount);

                    let loanDetail = await p.loanDesk.loanDetails(loanId);

                    let expectedProtocolFee = loanDetail.totalAmountRepaid
                        .sub(loanDetail.principalAmountRepaid)
                        .mul(protocolEarningPercent)
                        .div(ONE_HUNDRED_PERCENT);

                    let stakerEarnedInterest = loanDetail.totalAmountRepaid
                        .sub(loanDetail.principalAmountRepaid)
                        .sub(expectedProtocolFee)
                        .mul(stakerEarningsPercent)
                        .div(stakerEarningsPercent.add(ONE_HUNDRED_PERCENT));

                    expect(await e.assetToken.balanceOf(e.staker.address)).to.equal(
                        balanceBefore.add(stakerEarnedInterest),
                    );
                });

                it('Overpaying a loan should only charge up to total amount due', async function () {
                    await skipEvmTime(60);

                    let loanBalanceDue = await p.loanDesk.loanBalanceDue(loanId);
                    let paymentAmount = loanBalanceDue.add(BigNumber.from(500).mul(TOKEN_MULTIPLIER));

                    await mintAndApprove(e.assetToken, e.deployer, borrower1, p.pool.address, paymentAmount);
                    await expect(p.loanDesk.connect(borrower1).repay(loanId, paymentAmount)).to.changeTokenBalance(
                        e.assetToken,
                        borrower1.address,
                        -loanBalanceDue,
                    );
                });

                describe('Rejection scenarios', function () {
                    it('Repaying a less than minimum payment amount on a loan with a greater outstanding balance should fail', async function () {
                        let paymentAmount = TOKEN_MULTIPLIER.mul(1).sub(1);
                        let balanceDue = await p.loanDesk.loanBalanceDue(loanId);

                        assertHardhatInvariant(balanceDue.gt(paymentAmount));

                        await mintAndApprove(e.assetToken, e.deployer, e.treasury, p.pool.address, paymentAmount);
                        await expect(p.loanDesk.connect(e.treasury).repay(loanId, paymentAmount)).to.be.reverted;
                    });

                    it('Repaying a loan that is not in OUTSTANDING status should fail', async function () {
                        await skipEvmTime(60);

                        let paymentAmount = await p.loanDesk.loanBalanceDue(loanId);

                        await mintAndApprove(e.assetToken, e.deployer, borrower1, p.pool.address, paymentAmount);
                        await p.loanDesk.connect(borrower1).repay(loanId, paymentAmount);
                        expect((await p.loanDesk.loans(loanId)).status).to.equal(LoanStatus.REPAID);

                        await mintAndApprove(e.assetToken, e.deployer, borrower1, p.pool.address, paymentAmount);
                        await expect(p.loanDesk.connect(borrower1).repay(loanId, paymentAmount)).to.be.reverted;
                    });

                    it('Repaying a nonexistent loan should fail', async function () {
                        await mintAndApprove(e.assetToken, e.deployer, borrower1, p.pool.address, loanAmount);
                        await expect(p.loanDesk.connect(borrower1).repay(loanId.add(1), loanAmount)).to.be.reverted;
                    });

                    it('Repaying a loan as the protocol should fail', async function () {
                        let paymentAmount = BigNumber.from(100).mul(TOKEN_MULTIPLIER);
                        await mintAndApprove(e.assetToken, e.deployer, e.treasury, p.pool.address, paymentAmount);
                        await expect(p.loanDesk.connect(e.treasury).repay(loanId, paymentAmount)).to.be.reverted;
                    });

                    it('Repaying a loan as the governance should fail', async function () {
                        let paymentAmount = BigNumber.from(100).mul(TOKEN_MULTIPLIER);
                        await mintAndApprove(e.assetToken, e.deployer, e.governance, p.pool.address, paymentAmount);
                        await expect(p.loanDesk.connect(e.governance).repay(loanId, paymentAmount)).to.be.reverted;
                    });

                    it('Repaying a loan from an unrelated address should fail', async function () {
                        let paymentAmount = BigNumber.from(100).mul(TOKEN_MULTIPLIER);
                        await mintAndApprove(e.assetToken, e.deployer, e.users[0], p.pool.address, paymentAmount);
                        await expect(p.loanDesk.connect(e.users[0]).repay(loanId, paymentAmount)).to.be.reverted;
                    });

                    it('Repaying a loan on behalf of a wrong borrower should fail', async function () {
                        await mintAndApprove(e.assetToken, e.deployer, lender3, p.pool.address, loanAmount);
                        await expect(p.loanDesk.connect(lender3).repayOnBehalf(loanId, loanAmount, borrower2.address))
                            .to.be.reverted;
                    });
                });
            });

            describe('Default', function () {
                describe('Default before the grace period', function () {
                    describe('Rejection scenarios', function () {
                        it('Defaulting a loan before the grace period is up should fail', async function () {
                            await expect(p.loanDesk.connect(e.staker).defaultLoan(loanId)).to.be.reverted;
                        });
                    });
                });

                describe('Default after grace period', function () {
                    after(async function () {
                        await rollback(evmSnapshotIds);
                    });

                    before(async function () {
                        await snapshot(evmSnapshotIds);

                        let loan = await p.loanDesk.loans(loanId);
                        await skipEvmTime(loan.duration.add(loan.gracePeriod).add(1).toNumber());
                    });

                    it('Staker can default a partially repaid loan', async function () {
                        let paymentAmount = (await p.loanDesk.loanBalanceDue(loanId)).div(2);
                        await mintAndApprove(e.assetToken, e.deployer, borrower1, p.pool.address, paymentAmount);
                        await p.loanDesk.connect(borrower1).repay(loanId, paymentAmount);

                        let poolFundsBefore = await p.pool.poolFunds();
                        let stakedBalanceBefore = await p.pool.balanceStaked();

                        expect(await p.loanDesk.canDefault(loanId)).to.equal(true);

                        let tx = await p.loanDesk.connect(e.staker).defaultLoan(loanId);
                        let loanDefaultedEvent = (await tx.wait()).events.filter((e) => e.event === 'LoanDefaulted')[0];
                        let stakerLoss = loanDefaultedEvent.args.stakerLoss;
                        let lenderLoss = loanDefaultedEvent.args.lenderLoss;
                        let lossAmount = stakerLoss.add(lenderLoss);

                        loan = await p.loanDesk.loans(loanId);

                        expect(loan.status).to.equal(LoanStatus.DEFAULTED);

                        // allow +/- half token accuracy due to pre settled yield being a rough value based on averages
                        expectEqualsWithinMargin(
                            await p.pool.poolFunds(),
                            poolFundsBefore.sub(lossAmount),
                            TOKEN_MULTIPLIER,
                        );
                        expectEqualsWithinMargin(
                            await p.pool.balanceStaked(),
                            stakedBalanceBefore.sub(stakerLoss),
                            TOKEN_MULTIPLIER,
                        );
                    });

                    it('Staker can default a loan that has no payments made', async function () {
                        // manual settling is only necessary to get the pool funds and staked balance pre default
                        await p.pool.connect(e.staker).settleYield();

                        let poolFundsBefore = await p.pool.poolFunds();
                        let stakedBalanceBefore = await p.pool.balanceStaked();

                        expect(await p.loanDesk.canDefault(loanId)).to.equal(true);
                        let tx = await p.loanDesk.connect(e.staker).defaultLoan(loanId);
                        let loanDefaultedEvent = (await tx.wait()).events.filter((e) => e.event === 'LoanDefaulted')[0];
                        let stakerLoss = loanDefaultedEvent.args.stakerLoss;
                        let lenderLoss = loanDefaultedEvent.args.lenderLoss;
                        let lossAmount = stakerLoss.add(lenderLoss);

                        loan = await p.loanDesk.loans(loanId);

                        expect(loan.status).to.equal(LoanStatus.DEFAULTED);
                        expectEqualsWithinMargin(
                            await p.pool.poolFunds(),
                            poolFundsBefore.sub(lossAmount),
                            BigNumber.from(2),
                        );
                        expectEqualsWithinMargin(
                            await p.pool.balanceStaked(),
                            stakedBalanceBefore.sub(stakerLoss),
                            BigNumber.from(2),
                        );
                    });

                    it('Staker can default a loan with an loss amount equal to the stakers stake', async function () {
                        let loanAmount = await p.pool.balanceStaked();
                        let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);

                        await p.loanDesk.connect(borrower2).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
                        let otherApplicationId = await p.loanDesk.recentApplicationIdOf(borrower2.address);
                        let gracePeriod = (await p.loanDesk.loanTemplate()).gracePeriod;
                        let installments = 1;
                        let apr = (await p.loanDesk.loanTemplate()).apr;
                        await p.loanDesk
                            .connect(e.staker)
                            .draftOffer(
                                otherApplicationId,
                                loanAmount,
                                loanDuration,
                                gracePeriod,
                                0,
                                installments,
                                apr,
                            );
                        await p.loanDesk.connect(e.staker).lockDraftOffer(otherApplicationId);
                        await skipEvmTime(2 * 24 * 60 * 60 + 1);
                        await p.loanDesk.connect(e.staker).offerLoan(otherApplicationId);
                        let tx = await p.loanDesk.connect(borrower2).borrow(otherApplicationId);
                        let otherLoanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0].args
                            .loanId;

                        await skipEvmTime(loanDuration.add(gracePeriod).add(1).toNumber());

                        await p.pool.connect(e.staker).settleYield();

                        let poolFundsBefore = await p.pool.poolFunds();

                        expect(await p.loanDesk.canDefault(otherLoanId)).to.equal(true);
                        tx = await p.loanDesk.connect(e.staker).defaultLoan(otherLoanId);
                        let loanDefaultedEvent = (await tx.wait()).events.filter((e) => e.event === 'LoanDefaulted')[0];
                        let stakerLoss = loanDefaultedEvent.args.stakerLoss;
                        let lenderLoss = loanDefaultedEvent.args.lenderLoss;
                        let lossAmount = stakerLoss.add(lenderLoss);

                        let loan = await p.loanDesk.loans(otherLoanId);
                        expect(loan.status).to.equal(LoanStatus.DEFAULTED);
                        expectEqualsWithinMargin(
                            await p.pool.poolFunds(),
                            poolFundsBefore.sub(lossAmount),
                            BigNumber.from(2),
                        );
                        expect(await p.pool.balanceStaked()).to.equal(0);
                    });

                    it('Staker can default a loan with an loss amount greater than the stakers stake', async function () {
                        let loanAmount = (await p.pool.balanceStaked()).mul(2);
                        let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);

                        await p.loanDesk.connect(borrower2).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
                        let otherApplicationId = await p.loanDesk.recentApplicationIdOf(borrower2.address);
                        let gracePeriod = (await p.loanDesk.loanTemplate()).gracePeriod;
                        let installments = 1;
                        let apr = (await p.loanDesk.loanTemplate()).apr;
                        await p.loanDesk
                            .connect(e.staker)
                            .draftOffer(
                                otherApplicationId,
                                loanAmount,
                                loanDuration,
                                gracePeriod,
                                0,
                                installments,
                                apr,
                            );
                        await p.loanDesk.connect(e.staker).lockDraftOffer(otherApplicationId);
                        await skipEvmTime(2 * 24 * 60 * 60 + 1);
                        await p.loanDesk.connect(e.staker).offerLoan(otherApplicationId);
                        let tx = await p.loanDesk.connect(borrower2).borrow(otherApplicationId);
                        let otherLoanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0].args
                            .loanId;

                        await skipEvmTime(loanDuration.add(gracePeriod).add(1).toNumber());

                        await p.pool.connect(e.staker).settleYield();

                        let poolFundsBefore = await p.pool.poolFunds();

                        expect(await p.loanDesk.canDefault(otherLoanId)).to.equal(true);
                        tx = await p.loanDesk.connect(e.staker).defaultLoan(otherLoanId);
                        let loanDefaultedEvent = (await tx.wait()).events.filter((e) => e.event === 'LoanDefaulted')[0];
                        let stakerLoss = loanDefaultedEvent.args.stakerLoss;
                        let lenderLoss = loanDefaultedEvent.args.lenderLoss;
                        let lossAmount = stakerLoss.add(lenderLoss);

                        let loan = await p.loanDesk.loans(otherLoanId);
                        expect(loan.status).to.equal(LoanStatus.DEFAULTED);
                        expectEqualsWithinMargin(
                            await p.pool.poolFunds(),
                            poolFundsBefore.sub(lossAmount),
                            BigNumber.from(2),
                        );
                        expect(await p.pool.balanceStaked()).to.equal(0);
                    });

                    it('Staker can default a loan with a missed installment', async function () {
                        await p.loanDesk.connect(borrower2).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);

                        let applicationId2 = await p.loanDesk.recentApplicationIdOf(borrower2.address);
                        let gracePeriod = (await p.loanDesk.loanTemplate()).gracePeriod;
                        let installments = 4;
                        let installmentAmount = BigNumber.from(250).mul(TOKEN_MULTIPLIER);
                        let apr = (await p.loanDesk.loanTemplate()).apr;
                        await p.loanDesk
                            .connect(e.staker)
                            .draftOffer(
                                applicationId2,
                                loanAmount,
                                loanDuration,
                                gracePeriod,
                                installmentAmount,
                                installments,
                                apr,
                            );
                        await p.loanDesk.connect(e.staker).lockDraftOffer(applicationId2);
                        await skipEvmTime(2 * 24 * 60 * 60 + 1);
                        await p.loanDesk.connect(e.staker).offerLoan(applicationId2);
                        let tx = await p.loanDesk.connect(borrower2).borrow(applicationId2);
                        let loanId2 = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0].args.loanId;

                        await skipEvmTime(loanDuration.div(installments).add(gracePeriod).add(1).toNumber());

                        expect(await p.loanDesk.canDefault(loanId2)).to.equal(true);
                        await expect(p.loanDesk.connect(e.staker).defaultLoan(loanId2)).to.be.not.reverted;
                    });

                    describe('Rejection scenarios', function () {
                        it('Defaulting a loan that is not in OUTSTANDING status should fail', async function () {
                            let paymentAmount = await p.loanDesk.loanBalanceDue(loanId);
                            await mintAndApprove(e.assetToken, e.deployer, borrower1, p.pool.address, paymentAmount);
                            await p.loanDesk.connect(borrower1).repay(loanId, paymentAmount);
                            loan = await p.loanDesk.loans(loanId);
                            assertHardhatInvariant(loan.status === LoanStatus.REPAID);

                            await expect(p.loanDesk.canDefault(loanId)).to.be.revertedWith('LoanDesk: invalid status');
                            await expect(p.loanDesk.connect(e.staker).defaultLoan(loanId)).to.be.reverted;
                        });

                        it('Defaulting a nonexistent loan should fail', async function () {
                            await expect(p.loanDesk.canDefault(loanId.add(1))).to.be.revertedWith(
                                'LoanDesk: not found',
                            );
                            await expect(p.loanDesk.connect(e.staker).defaultLoan(loanId.add(1))).to.be.reverted;
                        });

                        it('Defaulting a loan as the protocol should fail', async function () {
                            expect(await p.loanDesk.canDefault(loanId)).to.equal(true);
                            await expect(p.loanDesk.connect(e.treasury).defaultLoan(loanId)).to.be.reverted;
                        });

                        it('Defaulting a loan as the governance should fail', async function () {
                            expect(await p.loanDesk.canDefault(loanId)).to.equal(true);
                            await expect(p.loanDesk.connect(e.governance).defaultLoan(loanId)).to.be.reverted;
                        });

                        it('Defaulting a loan as a lender should fail', async function () {
                            expect(await p.loanDesk.canDefault(loanId)).to.equal(true);
                            await expect(p.loanDesk.connect(lender1).defaultLoan(loanId)).to.be.reverted;
                        });

                        it('Defaulting a loan as the borrower should fail', async function () {
                            expect(await p.loanDesk.canDefault(loanId)).to.equal(true);
                            await expect(p.loanDesk.connect(borrower1).defaultLoan(loanId)).to.be.reverted;
                        });

                        it('Defaulting a loan from an unrelated address should fail', async function () {
                            expect(await p.loanDesk.canDefault(loanId)).to.equal(true);
                            await expect(p.loanDesk.connect(e.users[0]).defaultLoan(loanId)).to.be.reverted;
                        });
                    });
                });
            });
        });
    });
});
