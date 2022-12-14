const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { ethers, upgrades } = require('hardhat');
const { assertHardhatInvariant } = require('hardhat/internal/core/errors');

let evmSnapshotIds = [];

async function snapshot() {
    let id = await hre.network.provider.send('evm_snapshot');
    evmSnapshotIds.push(id);
}

async function rollback() {
    await hre.network.provider.send('evm_revert', [evmSnapshotIds.pop()]);
}

describe('Loan Desk', function () {
    const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
    const TOKEN_DECIMALS = 6;

    const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
    const GOVERNANCE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("GOVERNANCE_ROLE"));
    const TREASURY_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("TREASURY_ROLE"));
    const PAUSER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("PAUSER_ROLE"));
    const POOL_1_MANAGER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("POOL_1_MANAGER_ROLE"));

    let coreAccessControl;

    let LoanDeskCF;
    let lendingPool;
    let liquidityToken;
    let loanDesk;
    let saplingMath;
    let limits;

    let deployer;
    let governance;
    let protocol;
    let manager;
    let addresses;

    beforeEach(async function () {
        await snapshot();
    });

    afterEach(async function () {
        await rollback();
    });

    before(async function () {
        [deployer, governance, protocol, manager, ...addresses] = await ethers.getSigners();

        let CoreAccessControlCF = await ethers.getContractFactory('CoreAccessControl');
        coreAccessControl = await CoreAccessControlCF.deploy();

        await coreAccessControl.connect(deployer).grantRole(DEFAULT_ADMIN_ROLE, governance.address);
        await coreAccessControl.connect(deployer).renounceRole(DEFAULT_ADMIN_ROLE, deployer.address);

        await coreAccessControl.connect(governance).grantRole(GOVERNANCE_ROLE, governance.address);
        await coreAccessControl.connect(governance).grantRole(TREASURY_ROLE, protocol.address);
        await coreAccessControl.connect(governance).grantRole(PAUSER_ROLE, governance.address);

        await coreAccessControl.connect(governance).listRole("POOL_1_MANAGER_ROLE", 3);
        await coreAccessControl.connect(governance).grantRole(POOL_1_MANAGER_ROLE, manager.address);

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
            POOL_1_MANAGER_ROLE,
        ]);
        await lendingPool.deployed();

        loanDesk = await upgrades.deployProxy(LoanDeskCF, [
            lendingPool.address,
            coreAccessControl.address,
            POOL_1_MANAGER_ROLE,
            TOKEN_DECIMALS,
        ]);
        await loanDesk.deployed();

        await poolToken.connect(deployer).transferOwnership(lendingPool.address);
        await lendingPool.connect(governance).setLoanDesk(loanDesk.address);

        saplingMath = await (await ethers.getContractFactory('SaplingMath')).deploy();
        limits = await (await ethers.getContractFactory('Limits')).deploy();

        await lendingPool.connect(manager).open();
        await loanDesk.connect(manager).open();
    });

    describe('Deployment', function () {
        it('Can deploy', async function () {
            await expect(
                upgrades.deployProxy(LoanDeskCF, [
                    lendingPool.address,
                    coreAccessControl.address,
                    POOL_1_MANAGER_ROLE,
                    TOKEN_DECIMALS,
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
            OFFER_MADE: 3,
            OFFER_ACCEPTED: 4,
            OFFER_CANCELLED: 5,
        };

        let PERCENT_DECIMALS;
        let TOKEN_MULTIPLIER;

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
            TOKEN_MULTIPLIER = BigNumber.from(10).pow(TOKEN_DECIMALS);

            loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
            loanDuration = BigNumber.from(365).mul(24 * 60 * 60);
        });

        describe('Initial State', function () {
            it('Loan APR is correct', async function () {
                let minValue = 0 * 10 ** PERCENT_DECIMALS;
                let maxValue = 100 * 10 ** PERCENT_DECIMALS;
                let defaultValue = 30 * 10 ** PERCENT_DECIMALS;

                expect(await limits.SAFE_MIN_APR()).to.equal(minValue);
                expect((await loanDesk.loanTemplate()).apr)
                    .to.equal(defaultValue)
                    .and.gte(minValue)
                    .and.lte(maxValue);
            });

            it('Loan grace period is correct', async function () {
                let minValue = BigNumber.from(3 * 24 * 60 * 60);
                let maxValue = BigNumber.from(365 * 24 * 60 * 60);
                let defaultValue = BigNumber.from(60 * 24 * 60 * 60);

                expect(await limits.MIN_LOAN_GRACE_PERIOD()).to.equal(minValue);
                expect(await limits.MAX_LOAN_GRACE_PERIOD()).to.equal(maxValue);
                expect((await loanDesk.loanTemplate()).gracePeriod)
                    .to.equal(defaultValue)
                    .and.gte(minValue)
                    .and.lte(maxValue);
            });
        });

        describe('Setting pool parameters', function () {
            describe('Loan APR', function () {
                it('Manager can set a template loan APR', async function () {
                    let currentValue = (await loanDesk.loanTemplate()).apr;
                    let minValue = await limits.SAFE_MIN_APR();
                    let maxValue = 100 * 10 ** PERCENT_DECIMALS;

                    let newValue = 40 * 10 ** PERCENT_DECIMALS;
                    assertHardhatInvariant(newValue != currentValue && minValue <= newValue && newValue <= maxValue);

                    await loanDesk.connect(manager).setTemplateLoanAPR(newValue);
                    expect((await loanDesk.loanTemplate()).apr).to.equal(newValue);
                });

                it('Loan APR can be set while the pool is paused', async function () {
                    let currentValue = (await loanDesk.loanTemplate()).apr;
                    let minValue = await limits.SAFE_MIN_APR();
                    let maxValue = 100 * 10 ** PERCENT_DECIMALS;

                    let newValue = 40 * 10 ** PERCENT_DECIMALS;
                    assertHardhatInvariant(newValue != currentValue && minValue <= newValue && newValue <= maxValue);

                    await loanDesk.connect(governance).pause();

                    await expect(loanDesk.connect(manager).setTemplateLoanAPR(newValue)).to.be.not.reverted;
                });

                describe('Rejection scenarios', function () {
                    it('Loan APR cannot be set to a value less than the allowed minimum', async function () {
                        let minValue = await limits.SAFE_MIN_APR();
                        if (minValue > 0) {
                            await expect(loanDesk.connect(manager).setTemplateLoanAPR(minValue - 1)).to.be.reverted;
                        }
                    });

                    it('Loan APR cannot be set to a value greater than the allowed maximum', async function () {
                        let maxValue = 100 * 10 ** PERCENT_DECIMALS;
                        await expect(loanDesk.connect(manager).setTemplateLoanAPR(maxValue + 1)).to.be.reverted;
                    });

                    it('A non-manager cannot set the loan APR', async function () {
                        let currentValue = (await loanDesk.loanTemplate()).apr;
                        let minValue = await limits.SAFE_MIN_APR();
                        let maxValue = 100 * 10 ** PERCENT_DECIMALS;

                        let newValue = 40 * 10 ** PERCENT_DECIMALS;
                        assertHardhatInvariant(newValue != currentValue && minValue <= newValue && newValue <= maxValue);

                        await expect(loanDesk.connect(governance).setTemplateLoanAPR(newValue)).to.be.reverted;
                    });
                });
            });

            describe('Minimum loan amount', function () {
                it('Manager can set a minimum loan amount', async function () {
                    let currentValue = (await loanDesk.loanTemplate()).minAmount;
                    let newValue = currentValue.add(1);

                    await loanDesk.connect(manager).setMinLoanAmount(newValue);
                    expect((await loanDesk.loanTemplate()).minAmount).to.equal(newValue);
                });

                it('Minimum loan amount can be set while the pool is paused', async function () {
                    let currentValue = (await loanDesk.loanTemplate()).minAmount;
                    let newValue = currentValue.add(1);

                    await loanDesk.connect(governance).pause();

                    await expect(loanDesk.connect(manager).setMinLoanAmount(newValue)).to.be.not.reverted;
                });

                describe('Rejection scenarios', function () {
                    it('Minimum loan amount cannot be set to a value less than the allowed minimum', async function () {
                        let minValue = await limits.SAFE_MIN_AMOUNT();
                        await expect(loanDesk.connect(manager).setMinLoanAmount(minValue.sub(1))).to.be.reverted;
                    });

                    it('A non-manager cannot set the loan APR', async function () {
                        let currentValue = (await loanDesk.loanTemplate()).minAmount;
                        let newValue = currentValue.add(1);

                        await expect(loanDesk.connect(governance).setMinLoanAmount(newValue)).to.be.reverted;
                    });
                });
            });

            describe('Minimum loan duration', function () {
                it('Manager can set a template minimum loan duration', async function () {
                    let currentValue = (await loanDesk.loanTemplate()).minDuration;
                    let maxValue = (await loanDesk.loanTemplate()).maxDuration;

                    let newValue = currentValue.add(1);
                    assertHardhatInvariant(newValue.lte(maxValue));

                    await loanDesk.connect(manager).setMinLoanDuration(newValue);
                    expect((await loanDesk.loanTemplate()).minDuration).to.equal(newValue);
                });

                it('Minimum loan duration can be set while the pool is paused', async function () {
                    let currentValue = (await loanDesk.loanTemplate()).minDuration;
                    let maxValue = (await loanDesk.loanTemplate()).maxDuration;

                    let newValue = currentValue.add(1);
                    assertHardhatInvariant(newValue.lte(maxValue));

                    await loanDesk.connect(governance).pause();

                    await expect(loanDesk.connect(manager).setMinLoanDuration(newValue)).to.be.not.reverted;
                });

                describe('Rejection scenarios', function () {
                    it('Minimum loan duration cannot be set to a value less than the allowed minimum', async function () {
                        let minValue = await limits.SAFE_MIN_DURATION();
                        if (minValue > 0) {
                            await expect(loanDesk.connect(manager).setMinLoanDuration(minValue.sub(1))).to.be.reverted;
                        }
                    });

                    it('Minimum loan duration cannot be set to a value greater than the allowed maximum', async function () {
                        let maxValue = (await loanDesk.loanTemplate()).maxDuration;
                        await expect(loanDesk.connect(manager).setMinLoanDuration(maxValue.add(1))).to.be.reverted;
                    });

                    it('A non-manager cannot set the minimum loan duration', async function () {
                        let currentValue = (await loanDesk.loanTemplate()).minDuration;
                        let maxValue = (await loanDesk.loanTemplate()).maxDuration;

                        let newValue = currentValue.add(1);
                        assertHardhatInvariant(newValue.lte(maxValue));

                        await expect(loanDesk.connect(governance).setMinLoanDuration(newValue)).to.be.reverted;
                    });
                });
            });

            describe('Maximum loan duration', function () {
                it('Manager can set a template maximum loan duration', async function () {
                    let currentValue = (await loanDesk.loanTemplate()).maxDuration;
                    let minValue = (await loanDesk.loanTemplate()).minDuration;
                    let maxValue = await limits.SAFE_MAX_DURATION();

                    let newValue = currentValue.sub(1);
                    assertHardhatInvariant(minValue.lte(newValue) && newValue.lte(maxValue));

                    await loanDesk.connect(manager).setMaxLoanDuration(newValue);
                    expect((await loanDesk.loanTemplate()).maxDuration).to.equal(newValue);
                });

                it('Maximum loan duration can be set while the pool is paused', async function () {
                    let currentValue = (await loanDesk.loanTemplate()).maxDuration;
                    let minValue = (await loanDesk.loanTemplate()).minDuration;
                    let maxValue = await limits.SAFE_MAX_DURATION();

                    let newValue = currentValue.sub(1);
                    assertHardhatInvariant(minValue.lte(newValue) && newValue.lte(maxValue));

                    await loanDesk.connect(governance).pause();

                    await expect(loanDesk.connect(manager).setMaxLoanDuration(newValue)).to.be.not.reverted;
                });

                describe('Rejection scenarios', function () {
                    it('Maximum loan duration cannot be set to a value less than the allowed minimum', async function () {
                        let minValue = (await loanDesk.loanTemplate()).minDuration;
                        if (minValue > 0) {
                            await expect(loanDesk.connect(manager).setMaxLoanDuration(minValue.sub(1))).to.be.reverted;
                        }
                    });

                    it('Maximum loan duration cannot be set to a value greater than the allowed maximum', async function () {
                        let maxValue = await limits.SAFE_MAX_DURATION();
                        await expect(loanDesk.connect(manager).setMaxLoanDuration(maxValue.add(1))).to.be.reverted;
                    });

                    it('A non-manager cannot set the maximum loan duration', async function () {
                        let currentValue = (await loanDesk.loanTemplate()).maxDuration;
                        let minValue = (await loanDesk.loanTemplate()).minDuration;
                        let maxValue = await limits.SAFE_MAX_DURATION();

                        let newValue = currentValue.sub(1);
                        assertHardhatInvariant(minValue.lte(newValue) && newValue.lte(maxValue));

                        await expect(loanDesk.connect(governance).setMaxLoanDuration(newValue)).to.be.reverted;
                    });
                });
            });

            describe('Loan grace period', function () {
                it('Manager can set a template loan grace period', async function () {
                    let currentValue = (await loanDesk.loanTemplate()).gracePeriod;
                    let minValue = await limits.MIN_LOAN_GRACE_PERIOD();
                    let maxValue = await limits.MAX_LOAN_GRACE_PERIOD();

                    let newValue = currentValue.add(1);
                    assertHardhatInvariant(minValue.lte(newValue) && newValue.lte(maxValue));

                    await loanDesk.connect(manager).setTemplateLoanGracePeriod(newValue);
                    expect((await loanDesk.loanTemplate()).gracePeriod).to.equal(newValue);
                });

                it('Loan grace period can be set while the pool is paused', async function () {
                    let currentValue = (await loanDesk.loanTemplate()).gracePeriod;
                    let minValue = await limits.MIN_LOAN_GRACE_PERIOD();
                    let maxValue = await limits.MAX_LOAN_GRACE_PERIOD();

                    let newValue = currentValue.add(1);
                    assertHardhatInvariant(minValue.lte(newValue) && newValue.lte(maxValue));

                    await loanDesk.connect(governance).pause();

                    await expect(loanDesk.connect(manager).setTemplateLoanGracePeriod(newValue)).to.be.not.reverted;
                });

                describe('Rejection scenarios', function () {
                    it('Loan grace period cannot be set to a value less than the allowed minimum', async function () {
                        let minValue = await limits.MIN_LOAN_GRACE_PERIOD();
                        if (minValue > 0) {
                            await expect(loanDesk.connect(manager).setTemplateLoanGracePeriod(minValue.sub(1))).to.be
                                .reverted;
                        }
                    });

                    it('Loan grace period cannot be set to a value greater than the allowed maximum', async function () {
                        let maxValue = await limits.MAX_LOAN_GRACE_PERIOD();
                        await expect(loanDesk.connect(manager).setTemplateLoanGracePeriod(maxValue.add(1))).to.be
                            .reverted;
                    });

                    it('A non-manager cannot set the loan grace period', async function () {
                        let currentValue = (await loanDesk.loanTemplate()).gracePeriod;
                        let minValue = await limits.MIN_LOAN_GRACE_PERIOD();
                        let maxValue = await limits.MAX_LOAN_GRACE_PERIOD();

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
                        'a937074e-85a7-42a9-b858-9795d9471759',
                        '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
                    );
                let applicationId = (await requestLoanTx.wait()).events.filter((e) => e.event === 'LoanRequested')[0]
                    .args.applicationId;

                let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

                let loanApplication = await loanDesk.loanApplications(applicationId);

                expect(loanApplication.id).to.equal(applicationId);
                expect(loanApplication.borrower).to.equal(borrower1.address);
                expect(loanApplication.amount).to.equal(loanAmount);
                expect(loanApplication.duration).to.equal(loanDuration);
                expect(loanApplication.requestedTime).to.equal(blockTimestamp);
                expect(loanApplication.status).to.equal(LoanApplicationStatus.APPLIED);
            });

            it('Can view most recent applicationId by address', async function () {
                let requestLoanTx = await loanDesk
                    .connect(borrower1)
                    .requestLoan(
                        loanAmount,
                        loanDuration,
                        'a937074e-85a7-42a9-b858-9795d9471759',
                        '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
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
                                'a937074e-85a7-42a9-b858-9795d9471759',
                                '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
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
                                'a937074e-85a7-42a9-b858-9795d9471759',
                                '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
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
                                'a937074e-85a7-42a9-b858-9795d9471759',
                                '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
                            ),
                    ).to.be.reverted;
                });

                it('Requesting a loan should fail while another application from the same borrower is pending approval', async function () {
                    await loanDesk
                        .connect(borrower1)
                        .requestLoan(
                            loanAmount,
                            loanDuration,
                            'a937074e-85a7-42a9-b858-9795d9471759',
                            '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
                        );
                    await expect(
                        loanDesk
                            .connect(borrower1)
                            .requestLoan(
                                loanAmount,
                                loanDuration,
                                'a937074e-85a7-42a9-b858-9795d9471759',
                                '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
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
                                'a937074e-85a7-42a9-b858-9795d9471759',
                                '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
                            ),
                    ).to.be.reverted;
                });

                it('Requesting a loan when the loan desk is closed should fail', async function () {
                    await loanDesk.connect(manager).close();
                    await expect(
                        loanDesk
                            .connect(borrower1)
                            .requestLoan(
                                loanAmount,
                                loanDuration,
                                'a937074e-85a7-42a9-b858-9795d9471759',
                                '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
                            ),
                    ).to.be.reverted;
                });

                it('Requesting a loan as the manager should fail', async function () {
                    await expect(
                        loanDesk
                            .connect(manager)
                            .requestLoan(
                                loanAmount,
                                loanDuration,
                                'a937074e-85a7-42a9-b858-9795d9471759',
                                '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
                            ),
                    ).to.be.reverted;
                });

                it('Requesting a loan as the protocol should fail', async function () {
                    await expect(
                        loanDesk
                            .connect(protocol)
                            .requestLoan(
                                loanAmount,
                                loanDuration,
                                'a937074e-85a7-42a9-b858-9795d9471759',
                                '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
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
                                'a937074e-85a7-42a9-b858-9795d9471759',
                                '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
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
                await rollback();
            });

            before(async function () {
                await snapshot();

                gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                installments = 1;
                apr = (await loanDesk.loanTemplate()).apr;

                await loanDesk
                    .connect(borrower1)
                    .requestLoan(
                        loanAmount,
                        loanDuration,
                        'a937074e-85a7-42a9-b858-9795d9471759',
                        '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
                    );
                applicationId = await loanDesk.recentApplicationIdOf(borrower1.address);
                application = await loanDesk.loanApplications(applicationId);

                let stakeAmount = BigNumber.from(2000).mul(TOKEN_MULTIPLIER);
                let depositAmount = BigNumber.from(10000).mul(TOKEN_MULTIPLIER);

                await liquidityToken.connect(deployer).mint(manager.address, stakeAmount);
                await liquidityToken.connect(manager).approve(lendingPool.address, stakeAmount);
                await lendingPool.connect(manager).stake(stakeAmount);

                await liquidityToken.connect(deployer).mint(lender1.address, depositAmount);
                await liquidityToken.connect(lender1).approve(lendingPool.address, depositAmount);
                await lendingPool.connect(lender1).deposit(depositAmount);
            });

            describe('Offer', function () {
                it('Manager can offer loans', async function () {
                    let offeredFunds = await loanDesk.offeredFunds();
                    expect(await lendingPool.canOffer(offeredFunds.add(application.amount))).to.equal(true);

                    await loanDesk
                        .connect(manager)
                        .offerLoan(
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
                        LoanApplicationStatus.OFFER_MADE,
                    );
                    expect((await loanDesk.loanOffers(applicationId)).offeredTime).to.equal(blockTimestamp);
                });

                describe('Rejection scenarios', function () {
                    it('Offering a loan with installment number less than 1 should fail', async function () {
                        await expect(loanDesk
                        .connect(manager)
                        .offerLoan(
                            applicationId,
                            application.amount,
                            application.duration,
                            gracePeriod,
                            0,
                            0,
                            apr,
                        )).to.be.revertedWith('LoanDesk: invalid number of installments');
                    });

                    it('Offering a loan with installment number greater than the number of days in the duration should fail', async function () {
                        await expect(loanDesk
                        .connect(manager)
                        .offerLoan(
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
                            .connect(manager)
                            .offerLoan(
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
                                .connect(manager)
                                .offerLoan(
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
                        let rawLiquidity = (await lendingPool.balance()).rawLiquidity;
                        let poolFunds = (await lendingPool.balance()).poolFunds;
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
                                'a937074e-85a7-42a9-b858-9795d9471759',
                                '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
                            );
                        let otherApplicationId = await loanDesk.recentApplicationIdOf(borrower2.address);
                        let otherApplication = await loanDesk.loanApplications(otherApplicationId);

                        await expect(
                            loanDesk
                                .connect(manager)
                                .offerLoan(
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
                                'a937074e-85a7-42a9-b858-9795d9471759',
                                '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
                            );
                        let otherApplicationId = await loanDesk.recentApplicationIdOf(borrower2.address);
                        let otherApplication = await loanDesk.loanApplications(otherApplicationId);

                        await loanDesk
                            .connect(manager)
                            .offerLoan(
                                otherApplicationId,
                                otherApplication.amount,
                                otherApplication.duration,
                                gracePeriod,
                                0,
                                installments,
                                apr,
                            );

                        await loanDesk.connect(borrower2).borrow(otherApplicationId);

                        let otherLoanId = await loanDesk.recentLoanIdOf(borrower2.address);
                        let loan = await loanDesk.loans(otherLoanId);
                        await ethers.provider.send('evm_increaseTime', [
                            loan.duration.add(loan.gracePeriod).toNumber(),
                        ]);
                        await ethers.provider.send('evm_mine');

                        await loanDesk.connect(manager).defaultLoan(otherLoanId);

                        await expect(
                            loanDesk
                                .connect(manager)
                                .offerLoan(
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

                    /*
                    it ("Offering a loan when lending is paused should fail", async function () {
                        await lendingPool.connect(manager).pauseLending();
                        await expect(loanDesk.connect(manager).offerLoan(applicationId, application.amount, application.duration, gracePeriod, 0, installments, apr)).to.be.reverted;
                    });
                    */

                    it('Offering a loan when the pool is paused should fail', async function () {
                        await loanDesk.connect(governance).pause();
                        await expect(
                            loanDesk
                                .connect(manager)
                                .offerLoan(
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
                        await loanDesk.connect(manager).close();
                        await expect(
                            loanDesk
                                .connect(manager)
                                .offerLoan(
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
                                .connect(manager)
                                .offerLoan(
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
                                .offerLoan(
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
                                .offerLoan(
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
                                .offerLoan(
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
                                .offerLoan(
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
                                .offerLoan(
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
                    await rollback();
                });

                before(async function () {
                    await snapshot();

                    await loanDesk
                        .connect(manager)
                        .offerLoan(
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
                    it('Manager can update loan offers', async function () {
                        let offeredFunds = await loanDesk.offeredFunds();
                        let offer = await loanDesk.loanOffers(applicationId);

                        let newOfferedAmount = offer.amount.div(2);
                        expect(await lendingPool.canOffer(offeredFunds.sub(offer.amount).add(newOfferedAmount)))
                            .to.equal(true);

                        await expect(loanDesk.connect(manager).updateOffer(
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
                    it('Manager can cancel', async function () {
                        await loanDesk.connect(manager).cancelLoan(applicationId);
                        expect((await loanDesk.loanApplications(applicationId)).status).to.equal(
                            LoanApplicationStatus.OFFER_CANCELLED,
                        );
                    });

                    it('Manager can cancel while other loans are present (Updating weighted avg loan APR', async function () {
                        let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
                        let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);
                        let requestLoanTx = await loanDesk
                            .connect(borrower2)
                            .requestLoan(
                                loanAmount,
                                loanDuration,
                                'a937074e-85a7-42a9-b858-9795d9471759',
                                '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
                            );
                        let otherApplicationId = await loanDesk.recentApplicationIdOf(borrower2.address)

                        let otherApplication = await loanDesk.loanApplications(otherApplicationId);
                        await loanDesk
                            .connect(manager)
                            .offerLoan(
                                otherApplicationId,
                                otherApplication.amount,
                                otherApplication.duration,
                                gracePeriod,
                                0,
                                installments,
                                apr,
                            );

                        await loanDesk.connect(manager).cancelLoan(applicationId);
                        expect((await loanDesk.loanApplications(applicationId)).status).to.equal(
                            LoanApplicationStatus.OFFER_CANCELLED,
                        );
                    });

                    describe('Rejection scenarios', function () {
                        it('Cancelling a loan that is not in APPROVED status should fail', async function () {
                            await loanDesk.connect(borrower1).borrow(applicationId);
                            await expect(loanDesk.connect(manager).cancelLoan(applicationId)).to.be.reverted;
                        });

                        it('Cancelling a nonexistent loan should fail', async function () {
                            await expect(loanDesk.connect(manager).cancelLoan(applicationId.add(1))).to.be.reverted;
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
                it('manager can deny loans', async function () {
                    await loanDesk.connect(manager).denyLoan(applicationId);
                    expect((await loanDesk.loanApplications(applicationId)).status).to.equal(
                        LoanApplicationStatus.DENIED,
                    );
                });

                it('Borrowers can request another loan after the previous request is no longer pending', async function () {
                    await loanDesk.connect(manager).denyLoan(applicationId);
                    await expect(loanDesk.connect(borrower1).requestLoan(
                            loanAmount,
                            loanDuration,
                            'a937074e-85a7-42a9-b858-9795d9471759',
                            '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
                        )).to.be.not.reverted;
                });

                describe('Rejection scenarios', function () {
                    it('Denying a loan that is not in APPLIED status should fail', async function () {
                        await loanDesk
                            .connect(manager)
                            .offerLoan(
                                applicationId,
                                application.amount,
                                application.duration,
                                gracePeriod,
                                0,
                                installments,
                                apr,
                            );
                        await expect(loanDesk.connect(manager).denyLoan(applicationId)).to.be.reverted;
                    });

                    it('Denying a nonexistent loan should fail', async function () {
                        await expect(loanDesk.connect(manager).denyLoan(applicationId.add(1))).to.be.reverted;
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
