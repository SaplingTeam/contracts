const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { ethers, upgrades } = require('hardhat');
const { assertHardhatInvariant } = require('hardhat/internal/core/errors');
const { TOKEN_DECIMALS, TOKEN_MULTIPLIER, NIL_UUID, NIL_DIGEST } = require('./utils/constants');
const { POOL_1_LENDER_GOVERNANCE_ROLE } = require('./utils/roles');
const { mintAndApprove } = require('./utils/helpers');
const { snapshot, rollback, skipEvmTime } = require('./utils/evmControl');
const { deployEnv, deployProtocol } = require('./utils/deployer');

let evmSnapshotIds = [];

describe('Loan Desk', function () {
    let saplingMath;

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

        saplingMath = await (await ethers.getContractFactory('SaplingMath')).deploy();

        await mintAndApprove(e.assetToken, e.deployer, e.staker, p.pool.address, 10 ** TOKEN_DECIMALS);
        await p.pool.connect(e.staker).initialMint();

        await p.pool.connect(e.staker).open();
        await p.loanDesk.connect(e.staker).open();
    });

    describe('Deployment', function () {
        it('Can deploy', async function () {
            await expect(
                upgrades.deployProxy(await ethers.getContractFactory('LoanDesk'), [
                    p.pool.address,
                    e.assetToken.address,
                    p.accessControl.address,
                    e.staker.address,
                    POOL_1_LENDER_GOVERNANCE_ROLE,
                ]),
            ).to.be.not.reverted;
        });

        describe('Rejection Scenarios', function () {});
    });

    describe('Use Cases', function () {
        const LoanApplicationStatus = {
            NULL: 0,
            APPLIED: 1,
            DENIED: 2,
            OFFER_DRAFTED: 3,
            OFFER_DRAFT_LOCKED: 4,
            OFFER_MADE: 5,
            OFFER_ACCEPTED: 6,
            CANCELLED: 7,
        };

        let PERCENT_DECIMALS;

        let lender1;
        let lender2;
        let borrower1;
        let borrower2;

        let loanAmount;
        let loanDuration;

        before(async function () {
            lender1 = e.users[1];
            lender2 = e.users[2];
            borrower1 = e.users[3];
            borrower2 = e.users[4];

            PERCENT_DECIMALS = await saplingMath.PERCENT_DECIMALS();

            loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
            loanDuration = BigNumber.from(365).mul(24 * 60 * 60);
        });

        describe('Initial State', function () {
            it('Initial balances are correct', async function () {
                expect(await p.loanDesk.lentFunds()).to.equal(0);
                expect(await e.assetToken.balanceOf(p.loanDesk.address)).to.equal(0);
            });

            it('Loan APR is correct', async function () {
                let minValue = 0 * 10 ** PERCENT_DECIMALS;
                let maxValue = 100 * 10 ** PERCENT_DECIMALS;
                let defaultValue = 30 * 10 ** PERCENT_DECIMALS;

                expect(await saplingMath.SAFE_MIN_APR()).to.equal(minValue);
                expect((await p.loanDesk.loanTemplate()).apr)
                    .to.equal(defaultValue)
                    .and.gte(minValue)
                    .and.lte(maxValue);
            });

            it('Loan grace period is correct', async function () {
                let minValue = BigNumber.from(3 * 24 * 60 * 60);
                let maxValue = BigNumber.from(365 * 24 * 60 * 60);
                let defaultValue = BigNumber.from(60 * 24 * 60 * 60);

                expect(await saplingMath.MIN_LOAN_GRACE_PERIOD()).to.equal(minValue);
                expect(await saplingMath.MAX_LOAN_GRACE_PERIOD()).to.equal(maxValue);
                expect((await p.loanDesk.loanTemplate()).gracePeriod)
                    .to.equal(defaultValue)
                    .and.gte(minValue)
                    .and.lte(maxValue);
            });

            it('Pool and LoanDesk percentDecimals are the same', async function () {
                expect(await p.loanDesk.percentDecimals()).to.equal(await p.pool.percentDecimals());
            });
        });

        describe('Setting pool parameters', function () {
            describe('Loan APR', function () {
                it('Staker can set a template loan APR', async function () {
                    let currentValue = (await p.loanDesk.loanTemplate()).apr;
                    let minValue = await saplingMath.SAFE_MIN_APR();
                    let maxValue = 100 * 10 ** PERCENT_DECIMALS;

                    let newValue = 40 * 10 ** PERCENT_DECIMALS;
                    assertHardhatInvariant(newValue != currentValue && minValue <= newValue && newValue <= maxValue);

                    await p.loanDesk.connect(e.staker).setTemplateLoanAPR(newValue);
                    expect((await p.loanDesk.loanTemplate()).apr).to.equal(newValue);
                });

                it('Loan APR can be set while the pool is paused', async function () {
                    let currentValue = (await p.loanDesk.loanTemplate()).apr;
                    let minValue = await saplingMath.SAFE_MIN_APR();
                    let maxValue = 100 * 10 ** PERCENT_DECIMALS;

                    let newValue = 40 * 10 ** PERCENT_DECIMALS;
                    assertHardhatInvariant(newValue != currentValue && minValue <= newValue && newValue <= maxValue);

                    await p.loanDesk.connect(e.governance).pause();

                    await expect(p.loanDesk.connect(e.staker).setTemplateLoanAPR(newValue)).to.be.not.reverted;
                });

                describe('Rejection scenarios', function () {
                    it('Loan APR cannot be set to a value less than the allowed minimum', async function () {
                        let minValue = await saplingMath.SAFE_MIN_APR();
                        if (minValue > 0) {
                            await expect(
                                p.loanDesk.connect(e.staker).setTemplateLoanAPR(minValue - 1),
                            ).to.be.revertedWith('LoanDesk: APR is out of bounds');
                        }
                    });

                    it('Loan APR cannot be set to a value greater than the allowed maximum', async function () {
                        let maxValue = 100 * 10 ** PERCENT_DECIMALS;
                        await expect(p.loanDesk.connect(e.staker).setTemplateLoanAPR(maxValue + 1)).to.be.revertedWith(
                            'LoanDesk: APR is out of bounds',
                        );
                    });

                    it('A non-staker cannot set the loan APR', async function () {
                        let currentValue = (await p.loanDesk.loanTemplate()).apr;
                        let minValue = await saplingMath.SAFE_MIN_APR();
                        let maxValue = 100 * 10 ** PERCENT_DECIMALS;

                        let newValue = 40 * 10 ** PERCENT_DECIMALS;
                        assertHardhatInvariant(
                            newValue != currentValue && minValue <= newValue && newValue <= maxValue,
                        );

                        await expect(p.loanDesk.connect(e.governance).setTemplateLoanAPR(newValue)).to.be.revertedWith(
                            'SaplingStakerContext: unauthorized',
                        );
                    });
                });
            });

            describe('Minimum loan amount', function () {
                it('Staker can set a minimum loan amount', async function () {
                    let currentValue = (await p.loanDesk.loanTemplate()).minAmount;
                    let newValue = currentValue.add(1);

                    await p.loanDesk.connect(e.staker).setMinLoanAmount(newValue);
                    expect((await p.loanDesk.loanTemplate()).minAmount).to.equal(newValue);
                });

                it('Minimum loan amount can be set while the pool is paused', async function () {
                    let currentValue = (await p.loanDesk.loanTemplate()).minAmount;
                    let newValue = currentValue.add(1);

                    await p.loanDesk.connect(e.governance).pause();

                    await expect(p.loanDesk.connect(e.staker).setMinLoanAmount(newValue)).to.be.not.reverted;
                });

                describe('Rejection scenarios', function () {
                    it('Minimum loan amount cannot be set to a value less than the allowed minimum', async function () {
                        let minValue = await saplingMath.SAFE_MIN_AMOUNT();
                        await expect(p.loanDesk.connect(e.staker).setMinLoanAmount(minValue.sub(1))).to.be.revertedWith(
                            'LoanDesk: new min loan amount is less than the safe limit',
                        );
                    });

                    it('A non-staker cannot set the loan APR', async function () {
                        let currentValue = (await p.loanDesk.loanTemplate()).minAmount;
                        let newValue = currentValue.add(1);

                        await expect(p.loanDesk.connect(e.governance).setMinLoanAmount(newValue)).to.be.revertedWith(
                            'SaplingStakerContext: unauthorized',
                        );
                    });
                });
            });

            describe('Minimum loan duration', function () {
                it('Staker can set a template minimum loan duration', async function () {
                    let currentValue = (await p.loanDesk.loanTemplate()).minDuration;
                    let maxValue = (await p.loanDesk.loanTemplate()).maxDuration;

                    let newValue = currentValue.add(1);
                    assertHardhatInvariant(newValue.lte(maxValue));

                    await p.loanDesk.connect(e.staker).setMinLoanDuration(newValue);
                    expect((await p.loanDesk.loanTemplate()).minDuration).to.equal(newValue);
                });

                it('Minimum loan duration can be set while the pool is paused', async function () {
                    let currentValue = (await p.loanDesk.loanTemplate()).minDuration;
                    let maxValue = (await p.loanDesk.loanTemplate()).maxDuration;

                    let newValue = currentValue.add(1);
                    assertHardhatInvariant(newValue.lte(maxValue));

                    await p.loanDesk.connect(e.governance).pause();

                    await expect(p.loanDesk.connect(e.staker).setMinLoanDuration(newValue)).to.be.not.reverted;
                });

                describe('Rejection scenarios', function () {
                    it('Minimum loan duration cannot be set to a value less than the allowed minimum', async function () {
                        let minValue = await saplingMath.SAFE_MIN_DURATION();
                        if (minValue > 0) {
                            await expect(p.loanDesk.connect(e.staker).setMinLoanDuration(minValue.sub(1))).to.be
                                .reverted;
                        }
                    });

                    it('Minimum loan duration cannot be set to a value greater than the allowed maximum', async function () {
                        let maxValue = (await p.loanDesk.loanTemplate()).maxDuration;
                        await expect(
                            p.loanDesk.connect(e.staker).setMinLoanDuration(maxValue.add(1)),
                        ).to.be.revertedWith('LoanDesk: new min duration is out of bounds');
                    });

                    it('A non-staker cannot set the minimum loan duration', async function () {
                        let currentValue = (await p.loanDesk.loanTemplate()).minDuration;
                        let maxValue = (await p.loanDesk.loanTemplate()).maxDuration;

                        let newValue = currentValue.add(1);
                        assertHardhatInvariant(newValue.lte(maxValue));

                        await expect(p.loanDesk.connect(e.governance).setMinLoanDuration(newValue)).to.be.revertedWith(
                            'SaplingStakerContext: unauthorized',
                        );
                    });
                });
            });

            describe('Maximum loan duration', function () {
                it('Staker can set a template maximum loan duration', async function () {
                    let currentValue = (await p.loanDesk.loanTemplate()).maxDuration;
                    let minValue = (await p.loanDesk.loanTemplate()).minDuration;
                    let maxValue = await saplingMath.SAFE_MAX_DURATION();

                    let newValue = currentValue.sub(1);
                    assertHardhatInvariant(minValue.lte(newValue) && newValue.lte(maxValue));

                    await p.loanDesk.connect(e.staker).setMaxLoanDuration(newValue);
                    expect((await p.loanDesk.loanTemplate()).maxDuration).to.equal(newValue);
                });

                it('Maximum loan duration can be set while the pool is paused', async function () {
                    let currentValue = (await p.loanDesk.loanTemplate()).maxDuration;
                    let minValue = (await p.loanDesk.loanTemplate()).minDuration;
                    let maxValue = await saplingMath.SAFE_MAX_DURATION();

                    let newValue = currentValue.sub(1);
                    assertHardhatInvariant(minValue.lte(newValue) && newValue.lte(maxValue));

                    await p.loanDesk.connect(e.governance).pause();

                    await expect(p.loanDesk.connect(e.staker).setMaxLoanDuration(newValue)).to.be.not.reverted;
                });

                describe('Rejection scenarios', function () {
                    it('Maximum loan duration cannot be set to a value less than the allowed minimum', async function () {
                        let minValue = (await p.loanDesk.loanTemplate()).minDuration;
                        if (minValue > 0) {
                            await expect(p.loanDesk.connect(e.staker).setMaxLoanDuration(minValue.sub(1))).to.be
                                .reverted;
                        }
                    });

                    it('Maximum loan duration cannot be set to a value greater than the allowed maximum', async function () {
                        let maxValue = await saplingMath.SAFE_MAX_DURATION();
                        await expect(
                            p.loanDesk.connect(e.staker).setMaxLoanDuration(maxValue.add(1)),
                        ).to.be.revertedWith('LoanDesk: new max duration is out of bounds');
                    });

                    it('A non-staker cannot set the maximum loan duration', async function () {
                        let currentValue = (await p.loanDesk.loanTemplate()).maxDuration;
                        let minValue = (await p.loanDesk.loanTemplate()).minDuration;
                        let maxValue = await saplingMath.SAFE_MAX_DURATION();

                        let newValue = currentValue.sub(1);
                        assertHardhatInvariant(minValue.lte(newValue) && newValue.lte(maxValue));

                        await expect(p.loanDesk.connect(e.governance).setMaxLoanDuration(newValue)).to.be.revertedWith(
                            'SaplingStakerContext: unauthorized',
                        );
                    });
                });
            });

            describe('Loan grace period', function () {
                it('Staker can set a template loan grace period', async function () {
                    let currentValue = (await p.loanDesk.loanTemplate()).gracePeriod;
                    let minValue = await saplingMath.MIN_LOAN_GRACE_PERIOD();
                    let maxValue = await saplingMath.MAX_LOAN_GRACE_PERIOD();

                    let newValue = currentValue.add(1);
                    assertHardhatInvariant(minValue.lte(newValue) && newValue.lte(maxValue));

                    await p.loanDesk.connect(e.staker).setTemplateLoanGracePeriod(newValue);
                    expect((await p.loanDesk.loanTemplate()).gracePeriod).to.equal(newValue);
                });

                it('Loan grace period can be set while the pool is paused', async function () {
                    let currentValue = (await p.loanDesk.loanTemplate()).gracePeriod;
                    let minValue = await saplingMath.MIN_LOAN_GRACE_PERIOD();
                    let maxValue = await saplingMath.MAX_LOAN_GRACE_PERIOD();

                    let newValue = currentValue.add(1);
                    assertHardhatInvariant(minValue.lte(newValue) && newValue.lte(maxValue));

                    await p.loanDesk.connect(e.governance).pause();

                    await expect(p.loanDesk.connect(e.staker).setTemplateLoanGracePeriod(newValue)).to.be.not.reverted;
                });

                describe('Rejection scenarios', function () {
                    it('Loan grace period cannot be set to a value less than the allowed minimum', async function () {
                        let minValue = await saplingMath.MIN_LOAN_GRACE_PERIOD();
                        if (minValue > 0) {
                            await expect(p.loanDesk.connect(e.staker).setTemplateLoanGracePeriod(minValue.sub(1))).to.be
                                .reverted;
                        }
                    });

                    it('Loan grace period cannot be set to a value greater than the allowed maximum', async function () {
                        let maxValue = await saplingMath.MAX_LOAN_GRACE_PERIOD();
                        await expect(p.loanDesk.connect(e.staker).setTemplateLoanGracePeriod(maxValue.add(1))).to.be
                            .reverted;
                    });

                    it('A non-staker cannot set the loan grace period', async function () {
                        let currentValue = (await p.loanDesk.loanTemplate()).gracePeriod;
                        let minValue = await saplingMath.MIN_LOAN_GRACE_PERIOD();
                        let maxValue = await saplingMath.MAX_LOAN_GRACE_PERIOD();

                        let newValue = currentValue.add(1);
                        assertHardhatInvariant(minValue.lte(newValue) && newValue.lte(maxValue));

                        await expect(p.loanDesk.connect(e.governance).setTemplateLoanGracePeriod(newValue)).to.be
                            .reverted;
                    });
                });
            });
        });

        describe('Loan Request', function () {
            it('Borrower can request a loan', async function () {
                let requestLoanTx = await p.loanDesk
                    .connect(borrower1)
                    .requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
                let applicationId = (await requestLoanTx.wait()).events.filter((e) => e.event === 'LoanRequested')[0]
                    .args.applicationId;

                let loanApplication = await p.loanDesk.loanApplications(applicationId);

                expect(loanApplication.id).to.equal(applicationId);
                expect(loanApplication.borrower).to.equal(borrower1.address);
                expect(loanApplication.amount).to.equal(loanAmount);
                expect(loanApplication.duration).to.equal(loanDuration);
                expect(loanApplication.status).to.equal(LoanApplicationStatus.APPLIED);
            });

            it('Requesting a loan increments application count', async function () {
                let prevApplicationCount = await p.loanDesk.applicationsCount();
                await p.loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
                expect(await p.loanDesk.applicationsCount()).to.equal(prevApplicationCount.add(1));

                prevApplicationCount = await p.loanDesk.applicationsCount();
                await p.loanDesk.connect(borrower2).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
                expect(await p.loanDesk.applicationsCount()).to.equal(prevApplicationCount.add(1));
            });

            it('Can view most recent applicationId by address', async function () {
                let requestLoanTx = await p.loanDesk
                    .connect(borrower1)
                    .requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
                let applicationId = (await requestLoanTx.wait()).events.filter((e) => e.event === 'LoanRequested')[0]
                    .args.applicationId;
                expect(await p.loanDesk.recentApplicationIdOf(borrower1.address)).to.equal(applicationId);
            });

            describe('Rejection scenarios', function () {
                it('Requesting a loan with an amount less than the minimum should fail', async function () {
                    let minAmount = (await p.loanDesk.loanTemplate()).minAmount;
                    await expect(
                        p.loanDesk.connect(borrower1).requestLoan(minAmount.sub(1), loanDuration, NIL_UUID, NIL_DIGEST),
                    ).to.be.revertedWith('LoanDesk: loan amount is less than the minimum allowed');
                });

                it('Requesting a loan with a duration less than the minimum should fail', async function () {
                    let minDuration = (await p.loanDesk.loanTemplate()).minDuration;
                    await expect(
                        p.loanDesk.connect(borrower1).requestLoan(loanAmount, minDuration.sub(1), NIL_UUID, NIL_DIGEST),
                    ).to.be.revertedWith('LoanDesk: loan duration is less than minimum allowed');
                });

                it('Requesting a loan with a duration greater than the maximum should fail', async function () {
                    let maxDuration = (await p.loanDesk.loanTemplate()).maxDuration;
                    await expect(
                        p.loanDesk.connect(borrower1).requestLoan(loanAmount, maxDuration.add(1), NIL_UUID, NIL_DIGEST),
                    ).to.be.revertedWith('LoanDesk: loan duration is greater than maximum allowed');
                });

                it('Requesting a loan should fail while another application from the same borrower is pending approval', async function () {
                    await p.loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
                    await expect(
                        p.loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST),
                    ).to.be.revertedWith('LoanDesk: another loan application is pending');
                });

                it('Requesting a loan when the loan desk is paused should fail', async function () {
                    await p.loanDesk.connect(e.governance).pause();
                    await expect(
                        p.loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST),
                    ).to.be.revertedWith('Pausable: paused');
                });

                it('Requesting a loan when the loan desk is closed should fail', async function () {
                    await p.loanDesk.connect(e.staker).close();
                    await expect(
                        p.loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST),
                    ).to.be.revertedWith('SaplingStakerContext: closed');
                });

                it('Requesting a loan as the staker should fail', async function () {
                    await expect(
                        p.loanDesk.connect(e.staker).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST),
                    ).to.be.revertedWith('SaplingStakerContext: caller is not a user');
                });

                it('Requesting a loan as the governance should fail', async function () {
                    await expect(
                        p.loanDesk.connect(e.governance).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST),
                    ).to.be.revertedWith('SaplingStakerContext: caller is not a user');
                });
            });
        });

        describe('Actions on a Loan Request', function () {
            let gracePeriod;
            let installments;
            let apr;
            let applicationId;
            let application;

            after(async function () {
                await rollback(evmSnapshotIds);
            });

            before(async function () {
                await snapshot(evmSnapshotIds);

                gracePeriod = (await p.loanDesk.loanTemplate()).gracePeriod;
                installments = 1;
                apr = (await p.loanDesk.loanTemplate()).apr;

                await p.loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
                applicationId = await p.loanDesk.recentApplicationIdOf(borrower1.address);
                application = await p.loanDesk.loanApplications(applicationId);

                let stakeAmount = BigNumber.from(2000).mul(TOKEN_MULTIPLIER);
                let depositAmount = BigNumber.from(10000).mul(TOKEN_MULTIPLIER);

                await mintAndApprove(e.assetToken, e.deployer, e.staker, p.pool.address, stakeAmount);
                await p.pool.connect(e.staker).stake(stakeAmount);

                await mintAndApprove(e.assetToken, e.deployer, lender1, p.pool.address, depositAmount);
                await p.pool.connect(lender1).deposit(depositAmount);
            });

            describe('Offer', function () {
                it('Staker make loan offer drafts', async function () {
                    let offeredFunds = await e.assetToken.balanceOf(p.loanDesk.address);
                    expect(await p.pool.canOffer(offeredFunds.add(application.amount))).to.equal(true);

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
                    let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

                    expect((await p.loanDesk.loanApplications(applicationId)).status).to.equal(
                        LoanApplicationStatus.OFFER_DRAFTED,
                    );
                });

                describe('Rejection scenarios', function () {
                    it('Making a draft offer with less than minimum amount should fail', async function () {
                        await expect(
                            p.loanDesk
                                .connect(e.staker)
                                .draftOffer(
                                    applicationId,
                                    (await p.loanDesk.loanTemplate()).minAmount.sub(1),
                                    application.duration,
                                    gracePeriod,
                                    0,
                                    installments,
                                    apr,
                                ),
                        ).to.be.revertedWith('LoanDesk: invalid amount');
                    });

                    it('Making a draft offer with less than minimum duration should fail', async function () {
                        await expect(
                            p.loanDesk
                                .connect(e.staker)
                                .draftOffer(
                                    applicationId,
                                    application.amount,
                                    (await p.loanDesk.loanTemplate()).minDuration.sub(1),
                                    gracePeriod,
                                    0,
                                    installments,
                                    apr,
                                ),
                        ).to.be.revertedWith('LoanDesk: invalid duration');
                    });

                    it('Making a draft offer with greater than maximum duration should fail', async function () {
                        await expect(
                            p.loanDesk
                                .connect(e.staker)
                                .draftOffer(
                                    applicationId,
                                    application.amount,
                                    (await p.loanDesk.loanTemplate()).maxDuration.add(1),
                                    gracePeriod,
                                    0,
                                    installments,
                                    apr,
                                ),
                        ).to.be.revertedWith('LoanDesk: invalid duration');
                    });

                    it('Making a draft offer with less than minimum grace period should fail', async function () {
                        await expect(
                            p.loanDesk
                                .connect(e.staker)
                                .draftOffer(
                                    applicationId,
                                    application.amount,
                                    application.duration,
                                    (await saplingMath.MIN_LOAN_GRACE_PERIOD()).sub(1),
                                    0,
                                    installments,
                                    apr,
                                ),
                        ).to.be.revertedWith('LoanDesk: invalid grace period');
                    });

                    it('Making a draft offer with greater than maximum grace period should fail', async function () {
                        await expect(
                            p.loanDesk
                                .connect(e.staker)
                                .draftOffer(
                                    applicationId,
                                    application.amount,
                                    application.duration,
                                    (await saplingMath.MAX_LOAN_GRACE_PERIOD()).add(1),
                                    0,
                                    installments,
                                    apr,
                                ),
                        ).to.be.revertedWith('LoanDesk: invalid grace period');
                    });

                    it('Making a draft offer with greater than maximum APR should fail', async function () {
                        await expect(
                            p.loanDesk.connect(e.staker).draftOffer(
                                applicationId,
                                application.amount,
                                application.duration, //
                                gracePeriod,
                                0,
                                installments,
                                (await saplingMath.HUNDRED_PERCENT()) + 1,
                            ),
                        ).to.be.revertedWith('LoanDesk: invalid APR');
                    });

                    it('Making a draft offer with installment number less than 1 should fail', async function () {
                        await expect(
                            p.loanDesk
                                .connect(e.staker)
                                .draftOffer(
                                    applicationId,
                                    application.amount,
                                    application.duration,
                                    gracePeriod,
                                    0,
                                    0,
                                    apr,
                                ),
                        ).to.be.revertedWith('LoanDesk: invalid number of installments');
                    });

                    it('Making a draft offer with installment number greater than the number of days in the duration should fail', async function () {
                        await expect(
                            p.loanDesk
                                .connect(e.staker)
                                .draftOffer(
                                    applicationId,
                                    application.amount,
                                    application.duration,
                                    gracePeriod,
                                    0,
                                    application.duration.div(86400).add(1),
                                    apr,
                                ),
                        ).to.be.revertedWith('LoanDesk: invalid number of installments');
                    });

                    it('Offering a loan that is not in APPLIED status should fail', async function () {
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
                        await expect(
                            p.loanDesk
                                .connect(e.staker)
                                .draftOffer(
                                    applicationId,
                                    application.amount,
                                    application.duration,
                                    gracePeriod,
                                    0,
                                    installments,
                                    apr,
                                ),
                        ).to.be.revertedWith('LoanDesk: invalid status');
                    });

                    it('Offering a loan with an amount greater than available liquidity should fail', async function () {
                        let rawLiquidity = await e.assetToken.balanceOf(p.pool.address);
                        let poolFunds = await p.pool.poolFunds();
                        let targetLiquidityPercent = (await p.pool.config()).targetLiquidityPercent;
                        let ONE_HUNDRED_PERCENT = await saplingMath.HUNDRED_PERCENT();

                        let amountBorrowable = rawLiquidity.sub(
                            poolFunds.mul(targetLiquidityPercent).div(ONE_HUNDRED_PERCENT),
                        );
                        let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);

                        await p.loanDesk
                            .connect(borrower2)
                            .requestLoan(amountBorrowable.add(1), loanDuration, NIL_UUID, NIL_DIGEST);
                        let otherApplicationId = await p.loanDesk.recentApplicationIdOf(borrower2.address);
                        let otherApplication = await p.loanDesk.loanApplications(otherApplicationId);

                        await expect(
                            p.loanDesk
                                .connect(e.staker)
                                .draftOffer(
                                    otherApplicationId,
                                    otherApplication.amount,
                                    otherApplication.duration,
                                    gracePeriod,
                                    0,
                                    installments,
                                    apr,
                                ),
                        ).to.be.revertedWith('LoanDesk: pool cannot offer this loan at this time');
                    });

                    it('Offering a loan while pool stake is insufficient should fail', async function () {
                        let amountStaked = await p.pool.balanceStaked();

                        // request a loan with amount equal to 75% of the current stake and default it
                        let loanAmount = amountStaked.mul(75).div(100);
                        let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);

                        await p.loanDesk.connect(borrower2).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
                        let otherApplicationId = await p.loanDesk.recentApplicationIdOf(borrower2.address);
                        let otherApplication = await p.loanDesk.loanApplications(otherApplicationId);

                        await p.loanDesk
                            .connect(e.staker)
                            .draftOffer(
                                otherApplicationId,
                                otherApplication.amount,
                                otherApplication.duration,
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

                        let loan = await p.loanDesk.loans(otherLoanId);
                        await skipEvmTime(loan.duration.add(loan.gracePeriod).toNumber());

                        await p.loanDesk.connect(e.staker).defaultLoan(otherLoanId);

                        await expect(
                            p.loanDesk
                                .connect(e.staker)
                                .draftOffer(
                                    applicationId,
                                    application.amount,
                                    application.duration,
                                    gracePeriod,
                                    0,
                                    installments,
                                    apr,
                                ),
                        ).to.be.revertedWith('LoanDesk: pool cannot offer this loan at this time');
                    });

                    it('Offering a loan when the pool is paused should fail', async function () {
                        await p.loanDesk.connect(e.governance).pause();
                        await expect(
                            p.loanDesk
                                .connect(e.staker)
                                .draftOffer(
                                    applicationId,
                                    application.amount,
                                    application.duration,
                                    gracePeriod,
                                    0,
                                    installments,
                                    apr,
                                ),
                        ).to.be.revertedWith('Pausable: paused');
                    });

                    it('Offering a loan when the pool is closed should fail', async function () {
                        await p.loanDesk.connect(e.staker).close();
                        await expect(
                            p.loanDesk
                                .connect(e.staker)
                                .draftOffer(
                                    applicationId,
                                    application.amount,
                                    application.duration,
                                    gracePeriod,
                                    0,
                                    installments,
                                    apr,
                                ),
                        ).to.be.revertedWith('SaplingStakerContext: closed');
                    });

                    it('Offering a nonexistent loan should fail', async function () {
                        await expect(
                            p.loanDesk
                                .connect(e.staker)
                                .draftOffer(
                                    applicationId.add(1),
                                    application.amount,
                                    application.duration,
                                    gracePeriod,
                                    0,
                                    installments,
                                    apr,
                                ),
                        ).to.be.revertedWith('LoanDesk: not found');
                    });

                    it('Offering a loan as the protocol should fail', async function () {
                        await expect(
                            p.loanDesk
                                .connect(e.treasury)
                                .draftOffer(
                                    applicationId,
                                    application.amount,
                                    application.duration,
                                    gracePeriod,
                                    0,
                                    installments,
                                    apr,
                                ),
                        ).to.be.revertedWith('SaplingStakerContext: unauthorized');
                    });

                    it('Offering a loan as the governance should fail', async function () {
                        await expect(
                            p.loanDesk
                                .connect(e.governance)
                                .draftOffer(
                                    applicationId,
                                    application.amount,
                                    application.duration,
                                    gracePeriod,
                                    0,
                                    installments,
                                    apr,
                                ),
                        ).to.be.revertedWith('SaplingStakerContext: unauthorized');
                    });

                    it('Offering a loan as a lender should fail', async function () {
                        await expect(
                            p.loanDesk
                                .connect(lender1)
                                .draftOffer(
                                    applicationId,
                                    application.amount,
                                    application.duration,
                                    gracePeriod,
                                    0,
                                    installments,
                                    apr,
                                ),
                        ).to.be.revertedWith('SaplingStakerContext: unauthorized');
                    });

                    it('Offering a loan as the borrower should fail', async function () {
                        await expect(
                            p.loanDesk
                                .connect(borrower1)
                                .draftOffer(
                                    applicationId,
                                    application.amount,
                                    application.duration,
                                    gracePeriod,
                                    0,
                                    installments,
                                    apr,
                                ),
                        ).to.be.revertedWith('SaplingStakerContext: unauthorized');
                    });

                    it('Offering a loan from an unrelated address should fail', async function () {
                        await expect(
                            p.loanDesk
                                .connect(e.users[0])
                                .draftOffer(
                                    applicationId,
                                    application.amount,
                                    application.duration,
                                    gracePeriod,
                                    0,
                                    installments,
                                    apr,
                                ),
                        ).to.be.revertedWith('SaplingStakerContext: unauthorized');
                    });
                });
            });

            describe('Actions on a Loan Offer', function () {
                after(async function () {
                    await rollback(evmSnapshotIds);
                });

                before(async function () {
                    await snapshot(evmSnapshotIds);

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

                describe('Update', function () {
                    it('Staker can update loan offers', async function () {
                        let offer = await p.loanDesk.loanOffers(applicationId);

                        await expect(
                            p.loanDesk
                                .connect(e.staker)
                                .updateDraftOffer(
                                    offer.applicationId,
                                    offer.amount,
                                    offer.duration,
                                    offer.gracePeriod,
                                    offer.installmentAmount,
                                    offer.installments,
                                    offer.apr * 2,
                                ),
                        ).to.be.not.reverted;
                    });

                    it('Staker can decrease the principal in draft loan offers', async function () {
                        const poolLiquidityBefore = await p.pool.liquidity();
                        let offer = await p.loanDesk.loanOffers(applicationId);

                        const amountDelta = 100 * TOKEN_MULTIPLIER;
                        assertHardhatInvariant((await p.pool.canOffer(amountDelta)) === true, null);
                        let newOfferedAmount = offer.amount.sub(amountDelta);

                        await expect(
                            p.loanDesk
                                .connect(e.staker)
                                .updateDraftOffer(
                                    offer.applicationId,
                                    newOfferedAmount,
                                    offer.duration,
                                    offer.gracePeriod,
                                    offer.installmentAmount,
                                    offer.installments,
                                    offer.apr,
                                ),
                        ).to.be.not.reverted;

                        expect(await p.pool.liquidity()).to.equal(poolLiquidityBefore.add(amountDelta));
                    });

                    it('Staker can increase the principal in draft loan offers', async function () {
                        const poolLiquidityBefore = await p.pool.liquidity();
                        let offer = await p.loanDesk.loanOffers(applicationId);

                        const amountDelta = 100 * TOKEN_MULTIPLIER;
                        assertHardhatInvariant((await p.pool.canOffer(amountDelta)) === true, null);
                        let newOfferedAmount = offer.amount.add(amountDelta);

                        await expect(
                            p.loanDesk
                                .connect(e.staker)
                                .updateDraftOffer(
                                    offer.applicationId,
                                    newOfferedAmount,
                                    offer.duration,
                                    offer.gracePeriod,
                                    offer.installmentAmount,
                                    offer.installments,
                                    offer.apr,
                                ),
                        ).to.be.not.reverted;

                        expect(await p.pool.liquidity()).to.equal(poolLiquidityBefore.sub(amountDelta));
                    });

                    it('Staker cannot increase the principal beyond available liquidity', async function () {
                        const strategyLiquidity = await p.pool.strategyLiquidity();
                        let offer = await p.loanDesk.loanOffers(applicationId);

                        const amountDelta = strategyLiquidity.add(1);
                        let newOfferedAmount = offer.amount.add(amountDelta);

                        await expect(
                            p.loanDesk
                                .connect(e.staker)
                                .updateDraftOffer(
                                    offer.applicationId,
                                    newOfferedAmount,
                                    offer.duration,
                                    offer.gracePeriod,
                                    offer.installmentAmount,
                                    offer.installments,
                                    offer.apr,
                                ),
                        ).to.be.revertedWith('LoanDesk: lending pool cannot offer this loan at this time');
                    });
                });

                describe('Cancel', function () {
                    it('Staker can cancel', async function () {
                        await p.loanDesk.connect(e.staker).cancelLoan(applicationId);
                        expect((await p.loanDesk.loanApplications(applicationId)).status).to.equal(
                            LoanApplicationStatus.CANCELLED,
                        );
                    });

                    it('Staker can cancel locked offers', async function () {
                        await p.loanDesk.connect(e.staker).lockDraftOffer(applicationId);
                        expect((await p.loanDesk.loanApplications(applicationId)).status).to.equal(
                            LoanApplicationStatus.OFFER_DRAFT_LOCKED,
                        );

                        await p.loanDesk.connect(e.staker).cancelLoan(applicationId);
                        expect((await p.loanDesk.loanApplications(applicationId)).status).to.equal(
                            LoanApplicationStatus.CANCELLED,
                        );
                    });

                    it('Staker can cancel while other loans are present (Updating weighted avg loan APR', async function () {
                        let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
                        let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);
                        let requestLoanTx = await p.loanDesk
                            .connect(borrower2)
                            .requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
                        let otherApplicationId = await p.loanDesk.recentApplicationIdOf(borrower2.address);

                        let otherApplication = await p.loanDesk.loanApplications(otherApplicationId);
                        await p.loanDesk
                            .connect(e.staker)
                            .draftOffer(
                                otherApplicationId,
                                otherApplication.amount,
                                otherApplication.duration,
                                gracePeriod,
                                0,
                                installments,
                                apr,
                            );

                        await p.loanDesk.connect(e.staker).cancelLoan(applicationId);
                        expect((await p.loanDesk.loanApplications(applicationId)).status).to.equal(
                            LoanApplicationStatus.CANCELLED,
                        );
                    });

                    describe('Rejection scenarios', function () {
                        it('Cancelling a loan that is borrowed should fail', async function () {
                            await p.loanDesk.connect(e.staker).lockDraftOffer(applicationId);
                            await skipEvmTime(2 * 24 * 60 * 60 + 1);
                            await p.loanDesk.connect(e.staker).offerLoan(applicationId);
                            await p.loanDesk.connect(borrower1).borrow(applicationId);
                            await expect(p.loanDesk.connect(e.staker).cancelLoan(applicationId)).to.be.revertedWith(
                                'LoanDesk: invalid status',
                            );
                        });

                        it('Cancelling a nonexistent loan should fail', async function () {
                            await expect(
                                p.loanDesk.connect(e.staker).cancelLoan(applicationId.add(1)),
                            ).to.be.revertedWith('LoanDesk: not found');
                        });

                        it('Cancelling a loan as the protocol should fail', async function () {
                            await expect(p.loanDesk.connect(e.treasury).cancelLoan(applicationId)).to.be.revertedWith(
                                'LoanDesk: unauthorized',
                            );
                        });

                        it('Cancelling a loan as the governance should fail', async function () {
                            await expect(p.loanDesk.connect(e.governance).cancelLoan(applicationId)).to.be.revertedWith(
                                'LoanDesk: unauthorized',
                            );
                        });

                        it('Cancelling a loan as a lender should fail', async function () {
                            await expect(p.loanDesk.connect(lender1).cancelLoan(applicationId)).to.be.revertedWith(
                                'LoanDesk: unauthorized',
                            );
                        });

                        it('Cancelling a loan as the borrower should fail', async function () {
                            await expect(p.loanDesk.connect(borrower1).cancelLoan(applicationId)).to.be.revertedWith(
                                'LoanDesk: unauthorized',
                            );
                        });

                        it('Cancelling a loan from an unrelated address should fail', async function () {
                            await expect(p.loanDesk.connect(e.users[0]).cancelLoan(applicationId)).to.be.revertedWith(
                                'LoanDesk: unauthorized',
                            );
                        });
                    });
                });

                describe('Locking', function () {
                    it('Staker can lock a draft offer', async function () {
                        await p.loanDesk.connect(e.staker).lockDraftOffer(applicationId);
                        expect((await p.loanDesk.loanApplications(applicationId)).status).to.equal(
                            LoanApplicationStatus.OFFER_DRAFT_LOCKED,
                        );
                    });

                    it('Can make an active offer on a locked offer after a voting period', async function () {
                        await p.loanDesk.connect(e.staker).lockDraftOffer(applicationId);
                        await skipEvmTime(2 * 24 * 60 * 60 + 1);
                        await expect(p.loanDesk.connect(e.staker).offerLoan(applicationId)).to.be.not.reverted;

                        expect((await p.loanDesk.loanApplications(applicationId)).status).to.equal(
                            LoanApplicationStatus.OFFER_MADE,
                        );
                    });

                    it('Cannot make an active offer on a locked offer before the voting period', async function () {
                        await p.loanDesk.connect(e.staker).lockDraftOffer(applicationId);
                        await expect(p.loanDesk.connect(e.staker).offerLoan(applicationId)).to.be.revertedWith(
                            'LoanDesk: voting lock period is in effect',
                        );
                    });

                    it('Lender governance can cancel a locked offer within voting period', async function () {
                        await p.loanDesk.connect(e.staker).lockDraftOffer(applicationId);
                        await expect(p.loanDesk.connect(e.lenderGovernance).cancelLoan(applicationId)).to.be.not
                            .reverted;

                        expect((await p.loanDesk.loanApplications(applicationId)).status).to.equal(
                            LoanApplicationStatus.CANCELLED,
                        );
                    });

                    it('Lender governance cannot cancel a locked offer after the voting period', async function () {
                        await p.loanDesk.connect(e.staker).lockDraftOffer(applicationId);
                        await skipEvmTime(2 * 24 * 60 * 60 + 1);
                        await expect(
                            p.loanDesk.connect(e.lenderGovernance).cancelLoan(applicationId),
                        ).to.be.revertedWith('LoanDesk: unauthorized');
                    });

                    describe('Rejection scenarios', function () {
                        it('Locking a loan that is not in OFFER_DRAFTED status should fail', async function () {
                            await p.loanDesk.connect(e.staker).lockDraftOffer(applicationId);
                            await expect(p.loanDesk.connect(e.staker).lockDraftOffer(applicationId)).to.be.revertedWith(
                                'LoanDesk: invalid status',
                            );
                        });

                        it('Locking a nonexistent loan should fail', async function () {
                            await expect(
                                p.loanDesk.connect(e.staker).lockDraftOffer(applicationId.add(1)),
                            ).to.be.revertedWith('LoanDesk: not found');
                        });

                        it('Locking a loan as the protocol should fail', async function () {
                            await expect(
                                p.loanDesk.connect(e.treasury).lockDraftOffer(applicationId),
                            ).to.be.revertedWith('SaplingStakerContext: unauthorized');
                        });

                        it('Locking a loan as the governance should fail', async function () {
                            await expect(
                                p.loanDesk.connect(e.governance).lockDraftOffer(applicationId),
                            ).to.be.revertedWith('SaplingStakerContext: unauthorized');
                        });

                        it('Locking a loan as a lender should fail', async function () {
                            await expect(p.loanDesk.connect(lender1).lockDraftOffer(applicationId)).to.be.revertedWith(
                                'SaplingStakerContext: unauthorized',
                            );
                        });

                        it('Locking a loan as the borrower should fail', async function () {
                            await expect(
                                p.loanDesk.connect(borrower1).lockDraftOffer(applicationId),
                            ).to.be.revertedWith('SaplingStakerContext: unauthorized');
                        });

                        it('Locking a loan from an unrelated address should fail', async function () {
                            await expect(
                                p.loanDesk.connect(e.users[0]).lockDraftOffer(applicationId),
                            ).to.be.revertedWith('SaplingStakerContext: unauthorized');
                        });
                    });
                });
            });

            describe('Deny', function () {
                it('Staker can deny loans', async function () {
                    await p.loanDesk.connect(e.staker).denyLoan(applicationId);
                    expect((await p.loanDesk.loanApplications(applicationId)).status).to.equal(
                        LoanApplicationStatus.DENIED,
                    );
                });

                it('Borrowers can request another loan after the previous request is no longer pending', async function () {
                    await p.loanDesk.connect(e.staker).denyLoan(applicationId);
                    await expect(
                        p.loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST),
                    ).to.be.not.reverted;
                });

                describe('Rejection scenarios', function () {
                    it('Denying a loan that is not in APPLIED status should fail', async function () {
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
                        await expect(p.loanDesk.connect(e.staker).denyLoan(applicationId)).to.be.revertedWith(
                            'LoanDesk: invalid status',
                        );
                    });

                    it('Denying a nonexistent loan should fail', async function () {
                        await expect(p.loanDesk.connect(e.staker).denyLoan(applicationId.add(1))).to.be.revertedWith(
                            'LoanDesk: not found',
                        );
                    });

                    it('Denying a loan as the protocol should fail', async function () {
                        await expect(p.loanDesk.connect(e.treasury).denyLoan(applicationId)).to.be.revertedWith(
                            'SaplingStakerContext: unauthorized',
                        );
                    });

                    it('Denying a loan as the governance should fail', async function () {
                        await expect(p.loanDesk.connect(e.governance).denyLoan(applicationId)).to.be.revertedWith(
                            'SaplingStakerContext: unauthorized',
                        );
                    });

                    it('Denying a loan as a lender should fail', async function () {
                        await expect(p.loanDesk.connect(lender1).denyLoan(applicationId)).to.be.revertedWith(
                            'SaplingStakerContext: unauthorized',
                        );
                    });

                    it('Denying a loan as the borrower should fail', async function () {
                        await expect(p.loanDesk.connect(borrower1).denyLoan(applicationId)).to.be.revertedWith(
                            'SaplingStakerContext: unauthorized',
                        );
                    });

                    it('Denying a loan from an unrelated address should fail', async function () {
                        await expect(p.loanDesk.connect(e.users[0]).denyLoan(applicationId)).to.be.revertedWith(
                            'SaplingStakerContext: unauthorized',
                        );
                    });
                });
            });
        });
    });
});
