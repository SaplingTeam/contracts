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
    let coreAccessControl;

    let liquidityToken;
    let poolToken;
    let loanDesk;
    let lendingPool;

    let deployer;
    let governance;
    let lenderGovernance;
    let protocol;
    let staker;
    let addresses;

    beforeEach(async function () {
        await snapshot(evmSnapshotIds);
    });

    afterEach(async function () {
        await rollback(evmSnapshotIds);
    });

    before(async function () {
        const e = await deployEnv();
        const p = await deployProtocol(e);

        deployer = e.deployer;
        governance = e.governance;
        protocol = e.treasury;
        lenderGovernance = e.lenderGovernance;
        staker = e.staker;
        addresses = e.users;

        liquidityToken = e.assetToken;

        coreAccessControl = p.coreAccessControl;
        poolToken = p.poolToken;
        lendingPool = p.pool;
        loanDesk = p.loanDesk;

        let initialMintAmount = 10 ** TOKEN_DECIMALS;
        await mintAndApprove(liquidityToken, deployer, staker, lendingPool.address, initialMintAmount);
        await lendingPool.connect(staker).initialMint();

        await lendingPool.connect(staker).open();
        await loanDesk.connect(staker).open();
    });

    describe('Deployment', function () {
        it('Can deploy', async function () {
            let poolToken2 = await (
                await ethers.getContractFactory('PoolToken')
            ).deploy('Sapling Test Lending Pool Token', 'SLPT', TOKEN_DECIMALS);

            await expect(
                upgrades.deployProxy(await ethers.getContractFactory('SaplingLendingPool'), [
                    poolToken2.address,
                    liquidityToken.address,
                    coreAccessControl.address,
                    protocol.address,
                    staker.address,
                ]),
            ).to.be.not.reverted;
        });

        describe('Rejection Scenarios', function () {});
    });

    describe('Initial state', function () {
        it('Loan count is correct', async function () {
            expect(await loanDesk.loansCount()).to.equal(0);
        });

        it('Empty pool cannot offer any nonzero loan amount', async function () {
            expect(await lendingPool.canOffer(1)).to.equal(false);
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
            PERCENT_DECIMALS = await lendingPool.percentDecimals();
            ONE_HUNDRED_PERCENT = 100 * 10 ** PERCENT_DECIMALS;
            exitFeePercent = (await lendingPool.config()).exitFeePercent;

            lender1 = addresses[1];
            lender2 = addresses[2];
            lender3 = addresses[3];

            borrower1 = addresses[4];
            borrower2 = addresses[5];

            stakeAmount = BigNumber.from(2000).mul(TOKEN_MULTIPLIER);
            unstakeAmount = BigNumber.from(500).mul(TOKEN_MULTIPLIER);
            depositAmount = BigNumber.from(9000).mul(TOKEN_MULTIPLIER);
            withdrawAmount = BigNumber.from(3000).mul(TOKEN_MULTIPLIER);
            loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
            loanDuration = BigNumber.from(365).mul(24 * 60 * 60);

            await mintAndApprove(liquidityToken, deployer, staker, lendingPool.address, stakeAmount);
            await lendingPool.connect(staker).stake(stakeAmount);

            await mintAndApprove(liquidityToken, deployer, lender1, lendingPool.address, depositAmount);
            await lendingPool.connect(lender1).deposit(depositAmount);
        });

        describe('Initial state', function () {});

        describe('Setting pool parameters', function () {
            describe('Loan Desk', function () {});
        });

        describe('Close Pool', function () {
            it('Staker can close the pool', async function () {
                await lendingPool.connect(staker).close();
                expect(await lendingPool.closed()).to.equal(true);
            });

            describe('Rejection scenarios', function () {
                it('Closing the pool with a non-zero borrowed amount should fail', async function () {
                    await loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
                    let applicationId = await loanDesk.recentApplicationIdOf(borrower1.address);
                    let gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                    let installments = 1;
                    let apr = (await loanDesk.loanTemplate()).apr;
                    await loanDesk
                        .connect(staker)
                        .draftOffer(applicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);
                    await loanDesk.connect(staker).lockDraftOffer(applicationId);
                    await skipEvmTime(2 * 24 * 60 * 60 + 1);
                    await loanDesk.connect(staker).offerLoan(applicationId);
                    await loanDesk.connect(borrower1).borrow(applicationId);

                    await expect(lendingPool.connect(staker).close()).to.be.reverted;
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

                gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                installments = 1;
                apr = (await loanDesk.loanTemplate()).apr;

                let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
                let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);
                await loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
                applicationId = await loanDesk.recentApplicationIdOf(borrower1.address);
                application = await loanDesk.loanApplications(applicationId);
                await loanDesk
                    .connect(staker)
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
                let balanceBefore = await liquidityToken.balanceOf(borrower1.address);
                await loanDesk.connect(staker).lockDraftOffer(applicationId);
                await skipEvmTime(2 * 24 * 60 * 60 + 1);
                await loanDesk.connect(staker).offerLoan(applicationId);
                let tx = await loanDesk.connect(borrower1).borrow(applicationId);
                let loanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0].args.loanId;

                let loan = await loanDesk.loans(loanId);
                expect(loan.status).to.equal(LoanStatus.OUTSTANDING);

                expect(await liquidityToken.balanceOf(borrower1.address)).to.equal(balanceBefore.add(loan.amount));
            });

            describe('Rejection scenarios', function () {
                it('Borrowing a loan that is not in APPROVED status should fail', async function () {
                    await loanDesk.connect(staker).cancelLoan(applicationId);
                    await expect(loanDesk.connect(borrower1).borrow(applicationId)).to.be.reverted;
                });

                it('Borrowing a loan when the pool is paused should fail', async function () {
                    await lendingPool.connect(governance).pause();
                    await expect(loanDesk.connect(borrower1).borrow(applicationId)).to.be.reverted;
                });

                it('Borrowing a nonexistent loan should fail', async function () {
                    await expect(loanDesk.connect(lender1).borrow(applicationId.add(1))).to.be.reverted;
                });

                it('Borrowing a loan as the protocol should fail', async function () {
                    await expect(loanDesk.connect(protocol).borrow(applicationId)).to.be.reverted;
                });

                it('Borrowing a loan as the governance should fail', async function () {
                    await expect(loanDesk.connect(governance).borrow(applicationId)).to.be.reverted;
                });

                it('Borrowing a loan as a lender should fail', async function () {
                    await expect(loanDesk.connect(lender1).borrow(applicationId)).to.be.reverted;
                });

                it('Borrowing a loan from an unrelated address should fail', async function () {
                    await expect(loanDesk.connect(addresses[0]).borrow(applicationId)).to.be.reverted;
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

                await loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
                let applicationId = await loanDesk.recentApplicationIdOf(borrower1.address);
                let gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                let installments = 1;
                let apr = (await loanDesk.loanTemplate()).apr;
                await loanDesk
                    .connect(staker)
                    .draftOffer(applicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);
                await loanDesk.connect(staker).lockDraftOffer(applicationId);
                await skipEvmTime(2 * 24 * 60 * 60 + 1);
                await loanDesk.connect(staker).offerLoan(applicationId);
                let tx = await loanDesk.connect(borrower1).borrow(applicationId);
                loanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0].args.loanId;
            });

            describe('Repay', function () {
                it('Borrower can do a partial payment', async function () {
                    let loan = await loanDesk.loans(loanId);

                    await skipEvmTime(loan.duration.toNumber());

                    let paymentAmount = (await loanDesk.loanBalanceDue(loanId)).div(2);

                    await mintAndApprove(liquidityToken, deployer, borrower1, lendingPool.address, paymentAmount);
                    await expect(loanDesk.connect(borrower1).repay(loanId, paymentAmount)).to.changeTokenBalance(
                        liquidityToken,
                        borrower1.address,
                        -paymentAmount,
                    );

                    let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

                    loan = await loanDesk.loans(loanId);
                    let loanDetail = await loanDesk.loanDetails(loanId);
                    expect(loanDetail.totalAmountRepaid).to.equal(paymentAmount);
                    expect(loan.status).to.equal(LoanStatus.OUTSTANDING);
                });

                it('Borrower can do full payments', async function () {
                    let balanceBefore = await liquidityToken.balanceOf(borrower1.address);
                    let loan = await loanDesk.loans(loanId);

                    await skipEvmTime(loan.duration.toNumber() - 60);

                    let paymentAmount = await loanDesk.loanBalanceDue(loanId);

                    await mintAndApprove(liquidityToken, deployer, borrower1, lendingPool.address, paymentAmount);
                    await expect(loanDesk.connect(borrower1).repay(loanId, paymentAmount)).to.changeTokenBalance(
                        liquidityToken,
                        borrower1.address,
                        -paymentAmount,
                    );
                    let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

                    let loanDetail = await loanDesk.loanDetails(loanId);
                    expect(loanDetail.totalAmountRepaid).to.equal(paymentAmount);
                    expect((await loanDesk.loans(loanId)).status).to.equal(LoanStatus.REPAID);
                });

                it('3rd party can do a partial payment on behalf of the borrower', async function () {
                    let loan = await loanDesk.loans(loanId);

                    await skipEvmTime(loan.duration.toNumber());

                    let paymentAmount = (await loanDesk.loanBalanceDue(loanId)).div(2);

                    await mintAndApprove(liquidityToken, deployer, lender3, lendingPool.address, paymentAmount);
                    await expect(
                        loanDesk.connect(lender3).repayOnBehalf(loanId, paymentAmount, borrower1.address),
                    ).to.changeTokenBalance(liquidityToken, lender3.address, -paymentAmount);
                    let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

                    loan = await loanDesk.loans(loanId);
                    let loanDetail = await loanDesk.loanDetails(loanId);
                    expect(loanDetail.totalAmountRepaid).to.equal(paymentAmount);
                    expect(loan.status).to.equal(LoanStatus.OUTSTANDING);
                });

                it('3rd party can do full payments on behalf of the borrower', async function () {
                    let loan = await loanDesk.loans(loanId);

                    await skipEvmTime(loan.duration.toNumber() - 60);

                    let paymentAmount = await loanDesk.loanBalanceDue(loanId);

                    await mintAndApprove(liquidityToken, deployer, lender3, lendingPool.address, paymentAmount);
                    await expect(
                        loanDesk.connect(lender3).repayOnBehalf(loanId, paymentAmount, borrower1.address),
                    ).to.changeTokenBalance(liquidityToken, lender3.address, -paymentAmount);
                    let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

                    let loanDetail = await loanDesk.loanDetails(loanId);
                    expect(loanDetail.totalAmountRepaid).to.equal(paymentAmount);
                    expect((await loanDesk.loans(loanId)).status).to.equal(LoanStatus.REPAID);
                });

                it('Repaying a loan will transfer earnings to the staker', async function () {
                    let balanceBefore = await liquidityToken.balanceOf(staker.address);
                    let loan = await loanDesk.loans(loanId);

                    await skipEvmTime(loan.duration.toNumber());

                    let paymentAmount = await loanDesk.loanBalanceDue(loanId);

                    let protocolEarningPercent = (await lendingPool.config()).protocolFeePercent;
                    // let ONE_HUNDRED_PERCENT = await lendingPool.HUNDRED_PERCENT();

                    let stakedShares = (await lendingPool.balances()).stakedShares;
                    let totalPoolShares = await poolToken.totalSupply();
                    let stakerExcessLeverageComponent =
                        (await lendingPool.config()).stakerEarnFactor - ONE_HUNDRED_PERCENT;

                    let currentStakePercent = stakedShares.mul(ONE_HUNDRED_PERCENT).div(totalPoolShares);
                    let stakerEarningsPercent = currentStakePercent
                        .mul(stakerExcessLeverageComponent)
                        .div(ONE_HUNDRED_PERCENT);

                    await mintAndApprove(liquidityToken, deployer, borrower1, lendingPool.address, paymentAmount);
                    await loanDesk.connect(borrower1).repay(loanId, paymentAmount);

                    let loanDetail = await loanDesk.loanDetails(loanId);

                    let expectedProtocolFee = loanDetail.totalAmountRepaid
                        .sub(loanDetail.principalAmountRepaid)
                        .mul(protocolEarningPercent)
                        .div(ONE_HUNDRED_PERCENT);

                    let stakerEarnedInterest = loanDetail.totalAmountRepaid
                        .sub(loanDetail.principalAmountRepaid)
                        .sub(expectedProtocolFee)
                        .mul(stakerEarningsPercent)
                        .div(stakerEarningsPercent.add(ONE_HUNDRED_PERCENT));

                    expect(await liquidityToken.balanceOf(staker.address)).to.equal(
                        balanceBefore.add(stakerEarnedInterest),
                    );
                });

                it('Overpaying a loan should only charge up to total amount due', async function () {
                    await skipEvmTime(60);

                    let loanBalanceDue = await loanDesk.loanBalanceDue(loanId);
                    let paymentAmount = loanBalanceDue.add(BigNumber.from(500).mul(TOKEN_MULTIPLIER));

                    await mintAndApprove(liquidityToken, deployer, borrower1, lendingPool.address, paymentAmount);
                    await expect(loanDesk.connect(borrower1).repay(loanId, paymentAmount)).to.changeTokenBalance(
                        liquidityToken,
                        borrower1.address,
                        -loanBalanceDue,
                    );
                });

                describe('Rejection scenarios', function () {
                    it('Repaying a less than minimum payment amount on a loan with a greater outstanding balance should fail', async function () {
                        let paymentAmount = TOKEN_MULTIPLIER.mul(1).sub(1);
                        let balanceDue = await loanDesk.loanBalanceDue(loanId);

                        assertHardhatInvariant(balanceDue.gt(paymentAmount));

                        await mintAndApprove(liquidityToken, deployer, protocol, lendingPool.address, paymentAmount);
                        await expect(loanDesk.connect(protocol).repay(loanId, paymentAmount)).to.be.reverted;
                    });

                    it('Repaying a loan that is not in OUTSTANDING status should fail', async function () {
                        await skipEvmTime(60);

                        let paymentAmount = await loanDesk.loanBalanceDue(loanId);

                        await mintAndApprove(liquidityToken, deployer, borrower1, lendingPool.address, paymentAmount);
                        await loanDesk.connect(borrower1).repay(loanId, paymentAmount);
                        expect((await loanDesk.loans(loanId)).status).to.equal(LoanStatus.REPAID);

                        await mintAndApprove(liquidityToken, deployer, borrower1, lendingPool.address, paymentAmount);
                        await expect(loanDesk.connect(borrower1).repay(loanId, paymentAmount)).to.be.reverted;
                    });

                    it('Repaying a nonexistent loan should fail', async function () {
                        await mintAndApprove(liquidityToken, deployer, borrower1, lendingPool.address, loanAmount);
                        await expect(loanDesk.connect(borrower1).repay(loanId.add(1), loanAmount)).to.be.reverted;
                    });

                    it('Repaying a loan as the protocol should fail', async function () {
                        let paymentAmount = BigNumber.from(100).mul(TOKEN_MULTIPLIER);
                        await mintAndApprove(liquidityToken, deployer, protocol, lendingPool.address, paymentAmount);
                        await expect(loanDesk.connect(protocol).repay(loanId, paymentAmount)).to.be.reverted;
                    });

                    it('Repaying a loan as the governance should fail', async function () {
                        let paymentAmount = BigNumber.from(100).mul(TOKEN_MULTIPLIER);
                        await mintAndApprove(liquidityToken, deployer, governance, lendingPool.address, paymentAmount);
                        await expect(loanDesk.connect(governance).repay(loanId, paymentAmount)).to.be.reverted;
                    });

                    it('Repaying a loan from an unrelated address should fail', async function () {
                        let paymentAmount = BigNumber.from(100).mul(TOKEN_MULTIPLIER);
                        await mintAndApprove(
                            liquidityToken,
                            deployer,
                            addresses[0],
                            lendingPool.address,
                            paymentAmount,
                        );
                        await expect(loanDesk.connect(addresses[0]).repay(loanId, paymentAmount)).to.be.reverted;
                    });

                    it('Repaying a loan on behalf of a wrong borrower should fail', async function () {
                        await mintAndApprove(liquidityToken, deployer, lender3, lendingPool.address, loanAmount);
                        await expect(loanDesk.connect(lender3).repayOnBehalf(loanId, loanAmount, borrower2.address)).to
                            .be.reverted;
                    });
                });
            });

            describe('Default', function () {
                describe('Default before the grace period', function () {
                    describe('Rejection scenarios', function () {
                        it('Defaulting a loan before the grace period is up should fail', async function () {
                            await expect(loanDesk.connect(staker).defaultLoan(loanId)).to.be.reverted;
                        });
                    });
                });

                describe('Default after grace period', function () {
                    after(async function () {
                        await rollback(evmSnapshotIds);
                    });

                    before(async function () {
                        await snapshot(evmSnapshotIds);

                        let loan = await loanDesk.loans(loanId);
                        await skipEvmTime(loan.duration.add(loan.gracePeriod).add(1).toNumber());
                    });

                    it('Staker can default a partially repaid loan', async function () {
                        let paymentAmount = (await loanDesk.loanBalanceDue(loanId)).div(2);
                        await mintAndApprove(liquidityToken, deployer, borrower1, lendingPool.address, paymentAmount);
                        await loanDesk.connect(borrower1).repay(loanId, paymentAmount);

                        let poolFundsBefore = await lendingPool.poolFunds();
                        let stakedBalanceBefore = await lendingPool.balanceStaked();

                        expect(await loanDesk.canDefault(loanId)).to.equal(true);

                        let tx = await loanDesk.connect(staker).defaultLoan(loanId);
                        let loanDefaultedEvent = (await tx.wait()).events.filter((e) => e.event === 'LoanDefaulted')[0];
                        let stakerLoss = loanDefaultedEvent.args.stakerLoss;
                        let lenderLoss = loanDefaultedEvent.args.lenderLoss;
                        let lossAmount = stakerLoss.add(lenderLoss);

                        loan = await loanDesk.loans(loanId);

                        expect(loan.status).to.equal(LoanStatus.DEFAULTED);

                        // allow +/- half token accuracy due to pre settled yield being a rough value based on averages
                        expectEqualsWithinMargin(
                            await lendingPool.poolFunds(),
                            poolFundsBefore.sub(lossAmount),
                            TOKEN_MULTIPLIER,
                        );
                        expectEqualsWithinMargin(
                            await lendingPool.balanceStaked(),
                            stakedBalanceBefore.sub(stakerLoss),
                            TOKEN_MULTIPLIER,
                        );
                    });

                    it('Staker can default a loan that has no payments made', async function () {
                        // manual settling is only necessary to get the pool funds and staked balance pre default
                        await lendingPool.connect(staker).settleYield();

                        let poolFundsBefore = await lendingPool.poolFunds();
                        let stakedBalanceBefore = await lendingPool.balanceStaked();

                        expect(await loanDesk.canDefault(loanId)).to.equal(true);
                        let tx = await loanDesk.connect(staker).defaultLoan(loanId);
                        let loanDefaultedEvent = (await tx.wait()).events.filter((e) => e.event === 'LoanDefaulted')[0];
                        let stakerLoss = loanDefaultedEvent.args.stakerLoss;
                        let lenderLoss = loanDefaultedEvent.args.lenderLoss;
                        let lossAmount = stakerLoss.add(lenderLoss);

                        loan = await loanDesk.loans(loanId);

                        expect(loan.status).to.equal(LoanStatus.DEFAULTED);
                        expectEqualsWithinMargin(
                            await lendingPool.poolFunds(),
                            poolFundsBefore.sub(lossAmount),
                            BigNumber.from(2),
                        );
                        expectEqualsWithinMargin(
                            await lendingPool.balanceStaked(),
                            stakedBalanceBefore.sub(stakerLoss),
                            BigNumber.from(2),
                        );
                    });

                    it('Staker can default a loan with an loss amount equal to the stakers stake', async function () {
                        let loanAmount = await lendingPool.balanceStaked();
                        let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);

                        await loanDesk.connect(borrower2).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
                        let otherApplicationId = await loanDesk.recentApplicationIdOf(borrower2.address);
                        let gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                        let installments = 1;
                        let apr = (await loanDesk.loanTemplate()).apr;
                        await loanDesk
                            .connect(staker)
                            .draftOffer(
                                otherApplicationId,
                                loanAmount,
                                loanDuration,
                                gracePeriod,
                                0,
                                installments,
                                apr,
                            );
                        await loanDesk.connect(staker).lockDraftOffer(otherApplicationId);
                        await skipEvmTime(2 * 24 * 60 * 60 + 1);
                        await loanDesk.connect(staker).offerLoan(otherApplicationId);
                        let tx = await loanDesk.connect(borrower2).borrow(otherApplicationId);
                        let otherLoanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0].args
                            .loanId;

                        await skipEvmTime(loanDuration.add(gracePeriod).add(1).toNumber());

                        await lendingPool.connect(staker).settleYield();

                        let poolFundsBefore = await lendingPool.poolFunds();

                        expect(await loanDesk.canDefault(otherLoanId)).to.equal(true);
                        tx = await loanDesk.connect(staker).defaultLoan(otherLoanId);
                        let loanDefaultedEvent = (await tx.wait()).events.filter((e) => e.event === 'LoanDefaulted')[0];
                        let stakerLoss = loanDefaultedEvent.args.stakerLoss;
                        let lenderLoss = loanDefaultedEvent.args.lenderLoss;
                        let lossAmount = stakerLoss.add(lenderLoss);

                        let loan = await loanDesk.loans(otherLoanId);
                        expect(loan.status).to.equal(LoanStatus.DEFAULTED);
                        expectEqualsWithinMargin(
                            await lendingPool.poolFunds(),
                            poolFundsBefore.sub(lossAmount),
                            BigNumber.from(2),
                        );
                        expect(await lendingPool.balanceStaked()).to.equal(0);
                    });

                    it('Staker can default a loan with an loss amount greater than the stakers stake', async function () {
                        let loanAmount = (await lendingPool.balanceStaked()).mul(2);
                        let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);

                        await loanDesk.connect(borrower2).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
                        let otherApplicationId = await loanDesk.recentApplicationIdOf(borrower2.address);
                        let gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                        let installments = 1;
                        let apr = (await loanDesk.loanTemplate()).apr;
                        await loanDesk
                            .connect(staker)
                            .draftOffer(
                                otherApplicationId,
                                loanAmount,
                                loanDuration,
                                gracePeriod,
                                0,
                                installments,
                                apr,
                            );
                        await loanDesk.connect(staker).lockDraftOffer(otherApplicationId);
                        await skipEvmTime(2 * 24 * 60 * 60 + 1);
                        await loanDesk.connect(staker).offerLoan(otherApplicationId);
                        let tx = await loanDesk.connect(borrower2).borrow(otherApplicationId);
                        let otherLoanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0].args
                            .loanId;

                        await skipEvmTime(loanDuration.add(gracePeriod).add(1).toNumber());

                        await lendingPool.connect(staker).settleYield();

                        let poolFundsBefore = await lendingPool.poolFunds();

                        expect(await loanDesk.canDefault(otherLoanId)).to.equal(true);
                        tx = await loanDesk.connect(staker).defaultLoan(otherLoanId);
                        let loanDefaultedEvent = (await tx.wait()).events.filter((e) => e.event === 'LoanDefaulted')[0];
                        let stakerLoss = loanDefaultedEvent.args.stakerLoss;
                        let lenderLoss = loanDefaultedEvent.args.lenderLoss;
                        let lossAmount = stakerLoss.add(lenderLoss);

                        let loan = await loanDesk.loans(otherLoanId);
                        expect(loan.status).to.equal(LoanStatus.DEFAULTED);
                        expectEqualsWithinMargin(
                            await lendingPool.poolFunds(),
                            poolFundsBefore.sub(lossAmount),
                            BigNumber.from(2),
                        );
                        expect(await lendingPool.balanceStaked()).to.equal(0);
                    });

                    it('Staker can default a loan with a missed installment', async function () {
                        await loanDesk.connect(borrower2).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);

                        let applicationId2 = await loanDesk.recentApplicationIdOf(borrower2.address);
                        let gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                        let installments = 4;
                        let installmentAmount = BigNumber.from(250).mul(TOKEN_MULTIPLIER);
                        let apr = (await loanDesk.loanTemplate()).apr;
                        await loanDesk
                            .connect(staker)
                            .draftOffer(
                                applicationId2,
                                loanAmount,
                                loanDuration,
                                gracePeriod,
                                installmentAmount,
                                installments,
                                apr,
                            );
                        await loanDesk.connect(staker).lockDraftOffer(applicationId2);
                        await skipEvmTime(2 * 24 * 60 * 60 + 1);
                        await loanDesk.connect(staker).offerLoan(applicationId2);
                        let tx = await loanDesk.connect(borrower2).borrow(applicationId2);
                        let loanId2 = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0].args.loanId;

                        await skipEvmTime(loanDuration.div(installments).add(gracePeriod).add(1).toNumber());

                        expect(await loanDesk.canDefault(loanId2)).to.equal(true);
                        await expect(loanDesk.connect(staker).defaultLoan(loanId2)).to.be.not.reverted;
                    });

                    describe('Rejection scenarios', function () {
                        it('Defaulting a loan that is not in OUTSTANDING status should fail', async function () {
                            let paymentAmount = await loanDesk.loanBalanceDue(loanId);
                            await mintAndApprove(
                                liquidityToken,
                                deployer,
                                borrower1,
                                lendingPool.address,
                                paymentAmount,
                            );
                            await loanDesk.connect(borrower1).repay(loanId, paymentAmount);
                            loan = await loanDesk.loans(loanId);
                            assertHardhatInvariant(loan.status === LoanStatus.REPAID);

                            await expect(loanDesk.canDefault(loanId)).to.be.revertedWith('LoanDesk: invalid status');
                            await expect(loanDesk.connect(staker).defaultLoan(loanId)).to.be.reverted;
                        });

                        it('Defaulting a nonexistent loan should fail', async function () {
                            await expect(loanDesk.canDefault(loanId.add(1))).to.be.revertedWith('LoanDesk: not found');
                            await expect(loanDesk.connect(staker).defaultLoan(loanId.add(1))).to.be.reverted;
                        });

                        it('Defaulting a loan as the protocol should fail', async function () {
                            expect(await loanDesk.canDefault(loanId)).to.equal(true);
                            await expect(loanDesk.connect(protocol).defaultLoan(loanId)).to.be.reverted;
                        });

                        it('Defaulting a loan as the governance should fail', async function () {
                            expect(await loanDesk.canDefault(loanId)).to.equal(true);
                            await expect(loanDesk.connect(governance).defaultLoan(loanId)).to.be.reverted;
                        });

                        it('Defaulting a loan as a lender should fail', async function () {
                            expect(await loanDesk.canDefault(loanId)).to.equal(true);
                            await expect(loanDesk.connect(lender1).defaultLoan(loanId)).to.be.reverted;
                        });

                        it('Defaulting a loan as the borrower should fail', async function () {
                            expect(await loanDesk.canDefault(loanId)).to.equal(true);
                            await expect(loanDesk.connect(borrower1).defaultLoan(loanId)).to.be.reverted;
                        });

                        it('Defaulting a loan from an unrelated address should fail', async function () {
                            expect(await loanDesk.canDefault(loanId)).to.equal(true);
                            await expect(loanDesk.connect(addresses[0]).defaultLoan(loanId)).to.be.reverted;
                        });
                    });
                });
            });
        });
    });
});
