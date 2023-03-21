const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { ethers, upgrades } = require('hardhat');
const { assertHardhatInvariant } = require('hardhat/internal/core/errors');
const { TOKEN_DECIMALS, TOKEN_MULTIPLIER, NIL_UUID, NIL_DIGEST} = require("./utils/constants");
const { POOL_1_LENDER_GOVERNANCE_ROLE, initAccessControl } = require("./utils/roles");
const { mintAndApprove } = require("./utils/helpers");
const { snapshot, rollback, skipEvmTime } = require("./utils/evmControl");

let evmSnapshotIds = [];

describe('Loan Desk', function () {

    let coreAccessControl;

    let LoanDeskCF;
    let lendingPool;
    let liquidityToken;
    let loanDesk;
    let saplingMath;

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
        [deployer, governance, lenderGovernance, protocol, staker, ...addresses] = await ethers.getSigners();

        let CoreAccessControlCF = await ethers.getContractFactory('CoreAccessControl');
        coreAccessControl = await CoreAccessControlCF.deploy();

        await initAccessControl(coreAccessControl, deployer, governance, lenderGovernance.address);

        let SaplingLendingPoolCF = await ethers.getContractFactory('SaplingLendingPool');
        LoanDeskCF = await ethers.getContractFactory('LoanDesk');

        liquidityToken = await (
            await ethers.getContractFactory('PoolToken')
        ).deploy('Test USDC', 'TestUSDC', TOKEN_DECIMALS);

        let poolToken = await (
            await ethers.getContractFactory('PoolToken')
        ).deploy('Sapling Test Lending Pool Token', 'SLPT', TOKEN_DECIMALS);

        lendingPool = await upgrades.deployProxy(SaplingLendingPoolCF, [
            poolToken.address,
            liquidityToken.address,
            coreAccessControl.address,
            protocol.address,
            staker.address
        ]);
        await lendingPool.deployed();

        loanDesk = await upgrades.deployProxy(LoanDeskCF, [
            lendingPool.address,
            liquidityToken.address,
            coreAccessControl.address,
            staker.address,
            POOL_1_LENDER_GOVERNANCE_ROLE,
        ]);
        await loanDesk.deployed();

        await poolToken.connect(deployer).transferOwnership(lendingPool.address);
        await lendingPool.connect(governance).setLoanDesk(loanDesk.address);

        saplingMath = await (await ethers.getContractFactory('SaplingMath')).deploy();

        let initialMintAmount = 10 ** TOKEN_DECIMALS;
        await mintAndApprove(liquidityToken, deployer, staker, lendingPool.address, initialMintAmount);
        await lendingPool.connect(staker).initialMint();

        await lendingPool.connect(staker).open();
        await loanDesk.connect(staker).open();
    });

    describe('Deployment', function () {
        it('Can deploy', async function () {
            await expect(
                upgrades.deployProxy(LoanDeskCF, [
                    lendingPool.address,
                    liquidityToken.address,
                    coreAccessControl.address,
                    staker.address,
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
            lender1 = addresses[1];
            lender2 = addresses[2];
            borrower1 = addresses[3];
            borrower2 = addresses[4];

            PERCENT_DECIMALS = await saplingMath.PERCENT_DECIMALS();

            loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
            loanDuration = BigNumber.from(365).mul(24 * 60 * 60);
        });

        describe('Initial State', function () {
            it('Initial balances are correct', async function () {
                expect(await loanDesk.lentFunds()).to.equal(0);
                expect(await liquidityToken.balanceOf(loanDesk.address)).to.equal(0);
            });

            it('Loan APR is correct', async function () {
                let minValue = 0 * 10 ** PERCENT_DECIMALS;
                let maxValue = 100 * 10 ** PERCENT_DECIMALS;
                let defaultValue = 30 * 10 ** PERCENT_DECIMALS;

                expect(await saplingMath.SAFE_MIN_APR()).to.equal(minValue);
                expect((await loanDesk.loanTemplate()).apr)
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
                expect((await loanDesk.loanTemplate()).gracePeriod)
                    .to.equal(defaultValue)
                    .and.gte(minValue)
                    .and.lte(maxValue);
            });
        });

        describe('Setting pool parameters', function () {
            describe('Loan APR', function () {
                it('Staker can set a template loan APR', async function () {
                    let currentValue = (await loanDesk.loanTemplate()).apr;
                    let minValue = await saplingMath.SAFE_MIN_APR();
                    let maxValue = 100 * 10 ** PERCENT_DECIMALS;

                    let newValue = 40 * 10 ** PERCENT_DECIMALS;
                    assertHardhatInvariant(newValue != currentValue && minValue <= newValue && newValue <= maxValue);

                    await loanDesk.connect(staker).setTemplateLoanAPR(newValue);
                    expect((await loanDesk.loanTemplate()).apr).to.equal(newValue);
                });

                it('Loan APR can be set while the pool is paused', async function () {
                    let currentValue = (await loanDesk.loanTemplate()).apr;
                    let minValue = await saplingMath.SAFE_MIN_APR();
                    let maxValue = 100 * 10 ** PERCENT_DECIMALS;

                    let newValue = 40 * 10 ** PERCENT_DECIMALS;
                    assertHardhatInvariant(newValue != currentValue && minValue <= newValue && newValue <= maxValue);

                    await loanDesk.connect(governance).pause();

                    await expect(loanDesk.connect(staker).setTemplateLoanAPR(newValue)).to.be.not.reverted;
                });

                describe('Rejection scenarios', function () {
                    it('Loan APR cannot be set to a value less than the allowed minimum', async function () {
                        let minValue = await saplingMath.SAFE_MIN_APR();
                        if (minValue > 0) {
                            await expect(loanDesk.connect(staker).setTemplateLoanAPR(minValue - 1)).to.be.reverted;
                        }
                    });

                    it('Loan APR cannot be set to a value greater than the allowed maximum', async function () {
                        let maxValue = 100 * 10 ** PERCENT_DECIMALS;
                        await expect(loanDesk.connect(staker).setTemplateLoanAPR(maxValue + 1)).to.be.reverted;
                    });

                    it('A non-staker cannot set the loan APR', async function () {
                        let currentValue = (await loanDesk.loanTemplate()).apr;
                        let minValue = await saplingMath.SAFE_MIN_APR();
                        let maxValue = 100 * 10 ** PERCENT_DECIMALS;

                        let newValue = 40 * 10 ** PERCENT_DECIMALS;
                        assertHardhatInvariant(newValue != currentValue && minValue <= newValue && newValue <= maxValue);

                        await expect(loanDesk.connect(governance).setTemplateLoanAPR(newValue)).to.be.reverted;
                    });
                });
            });

            describe('Minimum loan amount', function () {
                it('Staker can set a minimum loan amount', async function () {
                    let currentValue = (await loanDesk.loanTemplate()).minAmount;
                    let newValue = currentValue.add(1);

                    await loanDesk.connect(staker).setMinLoanAmount(newValue);
                    expect((await loanDesk.loanTemplate()).minAmount).to.equal(newValue);
                });

                it('Minimum loan amount can be set while the pool is paused', async function () {
                    let currentValue = (await loanDesk.loanTemplate()).minAmount;
                    let newValue = currentValue.add(1);

                    await loanDesk.connect(governance).pause();

                    await expect(loanDesk.connect(staker).setMinLoanAmount(newValue)).to.be.not.reverted;
                });

                describe('Rejection scenarios', function () {
                    it('Minimum loan amount cannot be set to a value less than the allowed minimum', async function () {
                        let minValue = await saplingMath.SAFE_MIN_AMOUNT();
                        await expect(loanDesk.connect(staker).setMinLoanAmount(minValue.sub(1))).to.be.reverted;
                    });

                    it('A non-staker cannot set the loan APR', async function () {
                        let currentValue = (await loanDesk.loanTemplate()).minAmount;
                        let newValue = currentValue.add(1);

                        await expect(loanDesk.connect(governance).setMinLoanAmount(newValue)).to.be.reverted;
                    });
                });
            });

            describe('Minimum loan duration', function () {
                it('Staker can set a template minimum loan duration', async function () {
                    let currentValue = (await loanDesk.loanTemplate()).minDuration;
                    let maxValue = (await loanDesk.loanTemplate()).maxDuration;

                    let newValue = currentValue.add(1);
                    assertHardhatInvariant(newValue.lte(maxValue));

                    await loanDesk.connect(staker).setMinLoanDuration(newValue);
                    expect((await loanDesk.loanTemplate()).minDuration).to.equal(newValue);
                });

                it('Minimum loan duration can be set while the pool is paused', async function () {
                    let currentValue = (await loanDesk.loanTemplate()).minDuration;
                    let maxValue = (await loanDesk.loanTemplate()).maxDuration;

                    let newValue = currentValue.add(1);
                    assertHardhatInvariant(newValue.lte(maxValue));

                    await loanDesk.connect(governance).pause();

                    await expect(loanDesk.connect(staker).setMinLoanDuration(newValue)).to.be.not.reverted;
                });

                describe('Rejection scenarios', function () {
                    it('Minimum loan duration cannot be set to a value less than the allowed minimum', async function () {
                        let minValue = await saplingMath.SAFE_MIN_DURATION();
                        if (minValue > 0) {
                            await expect(loanDesk.connect(staker).setMinLoanDuration(minValue.sub(1))).to.be.reverted;
                        }
                    });

                    it('Minimum loan duration cannot be set to a value greater than the allowed maximum', async function () {
                        let maxValue = (await loanDesk.loanTemplate()).maxDuration;
                        await expect(loanDesk.connect(staker).setMinLoanDuration(maxValue.add(1))).to.be.reverted;
                    });

                    it('A non-staker cannot set the minimum loan duration', async function () {
                        let currentValue = (await loanDesk.loanTemplate()).minDuration;
                        let maxValue = (await loanDesk.loanTemplate()).maxDuration;

                        let newValue = currentValue.add(1);
                        assertHardhatInvariant(newValue.lte(maxValue));

                        await expect(loanDesk.connect(governance).setMinLoanDuration(newValue)).to.be.reverted;
                    });
                });
            });

            describe('Maximum loan duration', function () {
                it('Staker can set a template maximum loan duration', async function () {
                    let currentValue = (await loanDesk.loanTemplate()).maxDuration;
                    let minValue = (await loanDesk.loanTemplate()).minDuration;
                    let maxValue = await saplingMath.SAFE_MAX_DURATION();

                    let newValue = currentValue.sub(1);
                    assertHardhatInvariant(minValue.lte(newValue) && newValue.lte(maxValue));

                    await loanDesk.connect(staker).setMaxLoanDuration(newValue);
                    expect((await loanDesk.loanTemplate()).maxDuration).to.equal(newValue);
                });

                it('Maximum loan duration can be set while the pool is paused', async function () {
                    let currentValue = (await loanDesk.loanTemplate()).maxDuration;
                    let minValue = (await loanDesk.loanTemplate()).minDuration;
                    let maxValue = await saplingMath.SAFE_MAX_DURATION();

                    let newValue = currentValue.sub(1);
                    assertHardhatInvariant(minValue.lte(newValue) && newValue.lte(maxValue));

                    await loanDesk.connect(governance).pause();

                    await expect(loanDesk.connect(staker).setMaxLoanDuration(newValue)).to.be.not.reverted;
                });

                describe('Rejection scenarios', function () {
                    it('Maximum loan duration cannot be set to a value less than the allowed minimum', async function () {
                        let minValue = (await loanDesk.loanTemplate()).minDuration;
                        if (minValue > 0) {
                            await expect(loanDesk.connect(staker).setMaxLoanDuration(minValue.sub(1))).to.be.reverted;
                        }
                    });

                    it('Maximum loan duration cannot be set to a value greater than the allowed maximum', async function () {
                        let maxValue = await saplingMath.SAFE_MAX_DURATION();
                        await expect(loanDesk.connect(staker).setMaxLoanDuration(maxValue.add(1))).to.be.reverted;
                    });

                    it('A non-staker cannot set the maximum loan duration', async function () {
                        let currentValue = (await loanDesk.loanTemplate()).maxDuration;
                        let minValue = (await loanDesk.loanTemplate()).minDuration;
                        let maxValue = await saplingMath.SAFE_MAX_DURATION();

                        let newValue = currentValue.sub(1);
                        assertHardhatInvariant(minValue.lte(newValue) && newValue.lte(maxValue));

                        await expect(loanDesk.connect(governance).setMaxLoanDuration(newValue)).to.be.reverted;
                    });
                });
            });

            describe('Loan grace period', function () {
                it('Staker can set a template loan grace period', async function () {
                    let currentValue = (await loanDesk.loanTemplate()).gracePeriod;
                    let minValue = await saplingMath.MIN_LOAN_GRACE_PERIOD();
                    let maxValue = await saplingMath.MAX_LOAN_GRACE_PERIOD();

                    let newValue = currentValue.add(1);
                    assertHardhatInvariant(minValue.lte(newValue) && newValue.lte(maxValue));

                    await loanDesk.connect(staker).setTemplateLoanGracePeriod(newValue);
                    expect((await loanDesk.loanTemplate()).gracePeriod).to.equal(newValue);
                });

                it('Loan grace period can be set while the pool is paused', async function () {
                    let currentValue = (await loanDesk.loanTemplate()).gracePeriod;
                    let minValue = await saplingMath.MIN_LOAN_GRACE_PERIOD();
                    let maxValue = await saplingMath.MAX_LOAN_GRACE_PERIOD();

                    let newValue = currentValue.add(1);
                    assertHardhatInvariant(minValue.lte(newValue) && newValue.lte(maxValue));

                    await loanDesk.connect(governance).pause();

                    await expect(loanDesk.connect(staker).setTemplateLoanGracePeriod(newValue)).to.be.not.reverted;
                });

                describe('Rejection scenarios', function () {
                    it('Loan grace period cannot be set to a value less than the allowed minimum', async function () {
                        let minValue = await saplingMath.MIN_LOAN_GRACE_PERIOD();
                        if (minValue > 0) {
                            await expect(loanDesk.connect(staker).setTemplateLoanGracePeriod(minValue.sub(1))).to.be
                                .reverted;
                        }
                    });

                    it('Loan grace period cannot be set to a value greater than the allowed maximum', async function () {
                        let maxValue = await saplingMath.MAX_LOAN_GRACE_PERIOD();
                        await expect(loanDesk.connect(staker).setTemplateLoanGracePeriod(maxValue.add(1))).to.be
                            .reverted;
                    });

                    it('A non-staker cannot set the loan grace period', async function () {
                        let currentValue = (await loanDesk.loanTemplate()).gracePeriod;
                        let minValue = await saplingMath.MIN_LOAN_GRACE_PERIOD();
                        let maxValue = await saplingMath.MAX_LOAN_GRACE_PERIOD();

                        let newValue = currentValue.add(1);
                        assertHardhatInvariant(minValue.lte(newValue) && newValue.lte(maxValue));

                        await expect(loanDesk.connect(governance).setTemplateLoanGracePeriod(newValue)).to.be.reverted;
                    });
                });
            });
        });

        describe('Loan Request', function () {
            it('Borrower can request a loan', async function () {
                let requestLoanTx = await loanDesk
                    .connect(borrower1)
                    .requestLoan(
                        loanAmount,
                        loanDuration,
                        NIL_UUID,
                        NIL_DIGEST,
                    );
                let applicationId = (await requestLoanTx.wait()).events.filter((e) => e.event === 'LoanRequested')[0]
                    .args.applicationId;

                let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

                let loanApplication = await loanDesk.loanApplications(applicationId);

                expect(loanApplication.id).to.equal(applicationId);
                expect(loanApplication.borrower).to.equal(borrower1.address);
                expect(loanApplication.amount).to.equal(loanAmount);
                expect(loanApplication.duration).to.equal(loanDuration);
                expect(loanApplication.status).to.equal(LoanApplicationStatus.APPLIED);
            });

            it('Can view most recent applicationId by address', async function () {
                let requestLoanTx = await loanDesk
                    .connect(borrower1)
                    .requestLoan(
                        loanAmount,
                        loanDuration,
                        NIL_UUID,
                        NIL_DIGEST,
                    );
                let applicationId = (await requestLoanTx.wait()).events.filter((e) => e.event === 'LoanRequested')[0]
                    .args.applicationId;
                expect(await loanDesk.recentApplicationIdOf(borrower1.address)).to.equal(applicationId);
            });

            describe('Rejection scenarios', function () {
                it('Requesting a loan with an amount less than the minimum should fail', async function () {
                    let minAmount = (await loanDesk.loanTemplate()).minAmount;
                    await expect(
                        loanDesk
                            .connect(borrower1)
                            .requestLoan(
                                minAmount.sub(1),
                                loanDuration,
                                NIL_UUID,
                                NIL_DIGEST,
                            ),
                    ).to.be.reverted;
                });

                it('Requesting a loan with a duration less than the minimum should fail', async function () {
                    let minDuration = (await loanDesk.loanTemplate()).minDuration;
                    await expect(
                        loanDesk
                            .connect(borrower1)
                            .requestLoan(
                                loanAmount,
                                minDuration.sub(1),
                                NIL_UUID,
                                NIL_DIGEST,
                            ),
                    ).to.be.reverted;
                });

                it('Requesting a loan with a duration greater than the maximum should fail', async function () {
                    let maxDuration = (await loanDesk.loanTemplate()).maxDuration;
                    await expect(
                        loanDesk
                            .connect(borrower1)
                            .requestLoan(
                                loanAmount,
                                maxDuration.add(1),
                                NIL_UUID,
                                NIL_DIGEST,
                            ),
                    ).to.be.reverted;
                });

                it('Requesting a loan should fail while another application from the same borrower is pending approval', async function () {
                    await loanDesk
                        .connect(borrower1)
                        .requestLoan(
                            loanAmount,
                            loanDuration,
                            NIL_UUID,
                            NIL_DIGEST,
                        );
                    await expect(
                        loanDesk
                            .connect(borrower1)
                            .requestLoan(
                                loanAmount,
                                loanDuration,
                                NIL_UUID,
                                NIL_DIGEST,
                            ),
                    ).to.be.reverted;
                });

                it('Requesting a loan when the loan desk is paused should fail', async function () {
                    await loanDesk.connect(governance).pause();
                    await expect(
                        loanDesk
                            .connect(borrower1)
                            .requestLoan(
                                loanAmount,
                                loanDuration,
                                NIL_UUID,
                                NIL_DIGEST,
                            ),
                    ).to.be.reverted;
                });

                it('Requesting a loan when the loan desk is closed should fail', async function () {
                    await loanDesk.connect(staker).close();
                    await expect(
                        loanDesk
                            .connect(borrower1)
                            .requestLoan(
                                loanAmount,
                                loanDuration,
                                NIL_UUID,
                                NIL_DIGEST,
                            ),
                    ).to.be.reverted;
                });

                it('Requesting a loan as the staker should fail', async function () {
                    await expect(
                        loanDesk
                            .connect(staker)
                            .requestLoan(
                                loanAmount,
                                loanDuration,
                                NIL_UUID,
                                NIL_DIGEST,
                            ),
                    ).to.be.reverted;
                });

                it('Requesting a loan as the governance should fail', async function () {
                    await expect(
                        loanDesk
                            .connect(governance)
                            .requestLoan(
                                loanAmount,
                                loanDuration,
                                NIL_UUID,
                                NIL_DIGEST,
                            ),
                    ).to.be.reverted;
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

                gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                installments = 1;
                apr = (await loanDesk.loanTemplate()).apr;

                await loanDesk
                    .connect(borrower1)
                    .requestLoan(
                        loanAmount,
                        loanDuration,
                        NIL_UUID,
                        NIL_DIGEST,
                    );
                applicationId = await loanDesk.recentApplicationIdOf(borrower1.address);
                application = await loanDesk.loanApplications(applicationId);

                let stakeAmount = BigNumber.from(2000).mul(TOKEN_MULTIPLIER);
                let depositAmount = BigNumber.from(10000).mul(TOKEN_MULTIPLIER);

                await mintAndApprove(liquidityToken, deployer, staker, lendingPool.address, stakeAmount);
                await lendingPool.connect(staker).stake(stakeAmount);

                await mintAndApprove(liquidityToken, deployer, lender1, lendingPool.address, depositAmount);
                await lendingPool.connect(lender1).deposit(depositAmount);
            });

            describe('Offer', function () {
                it('Staker make loan offer drafts', async function () {
                    let offeredFunds = await liquidityToken.balanceOf(loanDesk.address);
                    expect(await lendingPool.canOffer(offeredFunds.add(application.amount))).to.equal(true);

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
                    let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

                    expect((await loanDesk.loanApplications(applicationId)).status).to.equal(
                        LoanApplicationStatus.OFFER_DRAFTED,
                    );
                });

                describe('Rejection scenarios', function () {
                    it('Making a draft offer with installment number less than 1 should fail', async function () {
                        await expect(loanDesk
                        .connect(staker)
                        .draftOffer(
                            applicationId,
                            application.amount,
                            application.duration,
                            gracePeriod,
                            0,
                            0,
                            apr,
                        )).to.be.revertedWith('LoanDesk: invalid number of installments');
                    });

                    it('Making a draft offer with installment number greater than the number of days in the duration should fail', async function () {
                        await expect(loanDesk
                        .connect(staker)
                        .draftOffer(
                            applicationId,
                            application.amount,
                            application.duration,
                            gracePeriod,
                            0,
                            application.duration.div(86400).add(1),
                            apr,
                        )).to.be.revertedWith('LoanDesk: invalid number of installments');
                    });

                    it('Offering a loan that is not in APPLIED status should fail', async function () {
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
                        await expect(
                            loanDesk
                                .connect(staker)
                                .draftOffer(
                                    applicationId,
                                    application.amount,
                                    application.duration,
                                    gracePeriod,
                                    0,
                                    installments,
                                    apr,
                                ),
                        ).to.be.reverted;
                    });

                    it('Offering a loan with an amount greater than available liquidity should fail', async function () {
                        let rawLiquidity = await liquidityToken.balanceOf(lendingPool.address);
                        let poolFunds = (await lendingPool.poolFunds());
                        let targetLiquidityPercent = (await lendingPool.config()).targetLiquidityPercent;
                        let ONE_HUNDRED_PERCENT = await saplingMath.HUNDRED_PERCENT();

                        let amountBorrowable = rawLiquidity.sub(
                            poolFunds.mul(targetLiquidityPercent).div(ONE_HUNDRED_PERCENT),
                        );
                        let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);

                        await loanDesk
                            .connect(borrower2)
                            .requestLoan(
                                amountBorrowable.add(1),
                                loanDuration,
                                NIL_UUID,
                                NIL_DIGEST,
                            );
                        let otherApplicationId = await loanDesk.recentApplicationIdOf(borrower2.address);
                        let otherApplication = await loanDesk.loanApplications(otherApplicationId);

                        await expect(
                            loanDesk
                                .connect(staker)
                                .draftOffer(
                                    otherApplicationId,
                                    otherApplication.amount,
                                    otherApplication.duration,
                                    gracePeriod,
                                    0,
                                    installments,
                                    apr,
                                ),
                        ).to.be.reverted;
                    });

                    it('Offering a loan while pool stake is insufficient should fail', async function () {
                        let amountStaked = await lendingPool.balanceStaked();

                        // request a loan with amount equal to 75% of the current stake and default it
                        let loanAmount = amountStaked.mul(75).div(100);
                        let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);

                        await loanDesk
                            .connect(borrower2)
                            .requestLoan(
                                loanAmount,
                                loanDuration,
                                NIL_UUID,
                                NIL_DIGEST,
                            );
                        let otherApplicationId = await loanDesk.recentApplicationIdOf(borrower2.address);
                        let otherApplication = await loanDesk.loanApplications(otherApplicationId);

                        await loanDesk
                            .connect(staker)
                            .draftOffer(
                                otherApplicationId,
                                otherApplication.amount,
                                otherApplication.duration,
                                gracePeriod,
                                0,
                                installments,
                                apr,
                            );
                        await loanDesk.connect(staker).lockDraftOffer(otherApplicationId);
                        await skipEvmTime(2*24*60*60 + 1);
                await loanDesk.connect(staker).offerLoan(otherApplicationId);
                        let tx = await loanDesk.connect(borrower2).borrow(otherApplicationId);
                        let otherLoanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0]
                            .args.loanId;

                        let loan = await loanDesk.loans(otherLoanId);
                        await skipEvmTime(loan.duration.add(loan.gracePeriod).toNumber());

                        await loanDesk.connect(staker).defaultLoan(otherLoanId);

                        await expect(
                            loanDesk
                                .connect(staker)
                                .draftOffer(
                                    applicationId,
                                    application.amount,
                                    application.duration,
                                    gracePeriod,
                                    0,
                                    installments,
                                    apr,
                                ),
                        ).to.be.reverted;
                    });

                    it('Offering a loan when the pool is paused should fail', async function () {
                        await loanDesk.connect(governance).pause();
                        await expect(
                            loanDesk
                                .connect(staker)
                                .draftOffer(
                                    applicationId,
                                    application.amount,
                                    application.duration,
                                    gracePeriod,
                                    0,
                                    installments,
                                    apr,
                                ),
                        ).to.be.reverted;
                    });

                    it('Offering a loan when the pool is closed should fail', async function () {
                        await loanDesk.connect(staker).close();
                        await expect(
                            loanDesk
                                .connect(staker)
                                .draftOffer(
                                    applicationId,
                                    application.amount,
                                    application.duration,
                                    gracePeriod,
                                    0,
                                    installments,
                                    apr,
                                ),
                        ).to.be.reverted;
                    });

                    it('Offering a nonexistent loan should fail', async function () {
                        await expect(
                            loanDesk
                                .connect(staker)
                                .draftOffer(
                                    applicationId.add(1),
                                    application.amount,
                                    application.duration,
                                    gracePeriod,
                                    0,
                                    installments,
                                    apr,
                                ),
                        ).to.be.reverted;
                    });

                    it('Offering a loan as the protocol should fail', async function () {
                        await expect(
                            loanDesk
                                .connect(protocol)
                                .draftOffer(
                                    applicationId,
                                    application.amount,
                                    application.duration,
                                    gracePeriod,
                                    0,
                                    installments,
                                    apr,
                                ),
                        ).to.be.reverted;
                    });

                    it('Offering a loan as the governance should fail', async function () {
                        await expect(
                            loanDesk
                                .connect(governance)
                                .draftOffer(
                                    applicationId,
                                    application.amount,
                                    application.duration,
                                    gracePeriod,
                                    0,
                                    installments,
                                    apr,
                                ),
                        ).to.be.reverted;
                    });

                    it('Offering a loan as a lender should fail', async function () {
                        await expect(
                            loanDesk
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
                        ).to.be.reverted;
                    });

                    it('Offering a loan as the borrower should fail', async function () {
                        await expect(
                            loanDesk
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
                        ).to.be.reverted;
                    });

                    it('Offering a loan from an unrelated address should fail', async function () {
                        await expect(
                            loanDesk
                                .connect(addresses[0])
                                .draftOffer(
                                    applicationId,
                                    application.amount,
                                    application.duration,
                                    gracePeriod,
                                    0,
                                    installments,
                                    apr,
                                ),
                        ).to.be.reverted;
                    });
                });
            });

            describe('Actions on a Loan Offer', function () {
                after(async function () {
                    await rollback(evmSnapshotIds);
                });

                before(async function () {
                    await snapshot(evmSnapshotIds);

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

                describe('Update', function () {
                    it('Staker can update loan offers', async function () {
                        let offeredFunds = await liquidityToken.balanceOf(loanDesk.address);
                        let offer = await loanDesk.loanOffers(applicationId);

                        let newOfferedAmount = offer.amount.div(2);
                        expect(await lendingPool.canOffer(offeredFunds.sub(offer.amount).add(newOfferedAmount)))
                            .to.equal(true);

                        await expect(loanDesk.connect(staker).updateDraftOffer(
                                offer.applicationId,
                                newOfferedAmount,
                                offer.duration,
                                offer.gracePeriod,
                                offer.installmentAmount,
                                offer.installments,
                                offer.apr,
                            )).to.be.not.reverted;
                    });
                });

                describe('Cancel', function () {
                    it('Staker can cancel', async function () {
                        await loanDesk.connect(staker).cancelLoan(applicationId);
                        expect((await loanDesk.loanApplications(applicationId)).status).to.equal(
                            LoanApplicationStatus.CANCELLED,
                        );
                    });

                    it('Staker can cancel while other loans are present (Updating weighted avg loan APR', async function () {
                        let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
                        let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);
                        let requestLoanTx = await loanDesk
                            .connect(borrower2)
                            .requestLoan(
                                loanAmount,
                                loanDuration,
                                NIL_UUID,
                                NIL_DIGEST,
                            );
                        let otherApplicationId = await loanDesk.recentApplicationIdOf(borrower2.address)

                        let otherApplication = await loanDesk.loanApplications(otherApplicationId);
                        await loanDesk
                            .connect(staker)
                            .draftOffer(
                                otherApplicationId,
                                otherApplication.amount,
                                otherApplication.duration,
                                gracePeriod,
                                0,
                                installments,
                                apr,
                            );

                        await loanDesk.connect(staker).cancelLoan(applicationId);
                        expect((await loanDesk.loanApplications(applicationId)).status).to.equal(
                            LoanApplicationStatus.CANCELLED,
                        );
                    });

                    describe('Rejection scenarios', function () {
                        it('Cancelling a loan that is not in APPROVED status should fail', async function () {
                            await loanDesk.connect(staker).lockDraftOffer(applicationId);
                            await skipEvmTime(2*24*60*60 + 1);
                await loanDesk.connect(staker).offerLoan(applicationId);
                            await loanDesk.connect(borrower1).borrow(applicationId);
                            await expect(loanDesk.connect(staker).cancelLoan(applicationId)).to.be.reverted;
                        });

                        it('Cancelling a nonexistent loan should fail', async function () {
                            await expect(loanDesk.connect(staker).cancelLoan(applicationId.add(1))).to.be.reverted;
                        });

                        it('Cancelling a loan as the protocol should fail', async function () {
                            await expect(loanDesk.connect(protocol).cancelLoan(applicationId)).to.be.reverted;
                        });

                        it('Cancelling a loan as the governance should fail', async function () {
                            await expect(loanDesk.connect(governance).cancelLoan(applicationId)).to.be.reverted;
                        });

                        it('Cancelling a loan as a lender should fail', async function () {
                            await expect(loanDesk.connect(lender1).cancelLoan(applicationId)).to.be.reverted;
                        });

                        it('Cancelling a loan as the borrower should fail', async function () {
                            await expect(loanDesk.connect(borrower1).cancelLoan(applicationId)).to.be.reverted;
                        });

                        it('Cancelling a loan from an unrelated address should fail', async function () {
                            await expect(loanDesk.connect(addresses[0]).cancelLoan(applicationId)).to.be.reverted;
                        });
                    });
                });
            });

            describe('Deny', function () {
                it('Staker can deny loans', async function () {
                    await loanDesk.connect(staker).denyLoan(applicationId);
                    expect((await loanDesk.loanApplications(applicationId)).status).to.equal(
                        LoanApplicationStatus.DENIED,
                    );
                });

                it('Borrowers can request another loan after the previous request is no longer pending', async function () {
                    await loanDesk.connect(staker).denyLoan(applicationId);
                    await expect(loanDesk.connect(borrower1).requestLoan(
                            loanAmount,
                            loanDuration,
                            NIL_UUID,
                            NIL_DIGEST,
                        )).to.be.not.reverted;
                });

                describe('Rejection scenarios', function () {
                    it('Denying a loan that is not in APPLIED status should fail', async function () {
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
                        await expect(loanDesk.connect(staker).denyLoan(applicationId)).to.be.reverted;
                    });

                    it('Denying a nonexistent loan should fail', async function () {
                        await expect(loanDesk.connect(staker).denyLoan(applicationId.add(1))).to.be.reverted;
                    });

                    it('Denying a loan as the protocol should fail', async function () {
                        await expect(loanDesk.connect(protocol).denyLoan(applicationId)).to.be.reverted;
                    });

                    it('Denying a loan as the governance should fail', async function () {
                        await expect(loanDesk.connect(governance).denyLoan(applicationId)).to.be.reverted;
                    });

                    it('Denying a loan as a lender should fail', async function () {
                        await expect(loanDesk.connect(lender1).denyLoan(applicationId)).to.be.reverted;
                    });

                    it('Denying a loan as the borrower should fail', async function () {
                        await expect(loanDesk.connect(borrower1).denyLoan(applicationId)).to.be.reverted;
                    });

                    it('Denying a loan from an unrelated address should fail', async function () {
                        await expect(loanDesk.connect(addresses[0]).denyLoan(applicationId)).to.be.reverted;
                    });
                });
            });
        });
    });
});
