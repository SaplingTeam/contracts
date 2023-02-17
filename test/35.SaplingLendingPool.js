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
    let id = evmSnapshotIds.pop();
    await hre.network.provider.send('evm_revert', [id]);
}

describe('Sapling Lending Pool', function () {
    const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
    const TOKEN_DECIMALS = 6;

    const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
    const GOVERNANCE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("GOVERNANCE_ROLE"));
    const TREASURY_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("TREASURY_ROLE"));
    const PAUSER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("PAUSER_ROLE"));
    const POOL_1_LENDER_GOVERNANCE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("POOL_1_LENDER_GOVERNANCE_ROLE"));

    let coreAccessControl;

    let SaplingLendingPoolCF;
    let liquidityToken;
    let poolToken;
    let loanDesk;
    let saplingMath;

    let deployer;
    let governance;
    let lenderGovernance;
    let protocol;
    let staker;
    let addresses;

    beforeEach(async function () {
        await snapshot();
    });

    afterEach(async function () {
        await rollback();
    });

    before(async function () {
        [deployer, governance, lenderGovernance, protocol, staker, ...addresses] = await ethers.getSigners();

        let CoreAccessControlCF = await ethers.getContractFactory('CoreAccessControl');
        coreAccessControl = await CoreAccessControlCF.deploy();

        await coreAccessControl.connect(deployer).grantRole(DEFAULT_ADMIN_ROLE, governance.address);
        await coreAccessControl.connect(deployer).renounceRole(DEFAULT_ADMIN_ROLE, deployer.address);

        await coreAccessControl.connect(governance).grantRole(GOVERNANCE_ROLE, governance.address);
        await coreAccessControl.connect(governance).grantRole(TREASURY_ROLE, protocol.address);
        await coreAccessControl.connect(governance).grantRole(PAUSER_ROLE, governance.address);

        await coreAccessControl.connect(governance).grantRole(POOL_1_LENDER_GOVERNANCE_ROLE, lenderGovernance.address);

        SaplingLendingPoolCF = await ethers.getContractFactory('SaplingLendingPool');
        let LoanDeskCF = await ethers.getContractFactory('LoanDesk');

        liquidityToken = await (
            await ethers.getContractFactory('PoolToken')
        ).deploy('Test USDC', 'TestUSDC', TOKEN_DECIMALS);

        poolToken = await (
            await ethers.getContractFactory('PoolToken')
        ).deploy('Sapling Test Lending Pool Token', 'SLPT', TOKEN_DECIMALS);

        lendingPool = await upgrades.deployProxy(SaplingLendingPoolCF, [
            poolToken.address,
            liquidityToken.address,
            coreAccessControl.address,
            staker.address
        ]);
        await lendingPool.deployed();

        loanDesk = await upgrades.deployProxy(LoanDeskCF, [
            lendingPool.address,
            coreAccessControl.address,
            staker.address,
            POOL_1_LENDER_GOVERNANCE_ROLE,
            TOKEN_DECIMALS,
        ]);
        await loanDesk.deployed();

        await poolToken.connect(deployer).transferOwnership(lendingPool.address);
        await lendingPool.connect(governance).setLoanDesk(loanDesk.address);

        saplingMath = await (await ethers.getContractFactory('SaplingMath')).deploy();

        await lendingPool.connect(staker).open();
        await loanDesk.connect(staker).open();
    });

    describe('Deployment', function () {
        it('Can deploy', async function () {
            await expect(
                upgrades.deployProxy(SaplingLendingPoolCF, [
                    poolToken.address,
                    liquidityToken.address,
                    coreAccessControl.address,
                    staker.address
                ]),
            ).to.be.not.reverted;
        });

        describe('Rejection Scenarios', function () {});
    });

    describe('Initial state', function () {
        it('Loan count is correct', async function () {
            expect(await loanDesk.loansCount()).to.equal(0);
        });

        it('Empty pool to stake ratio is good', async function () {
            expect(await lendingPool.maintainsStakeRatio()).to.equal(true);
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
        let TOKEN_MULTIPLIER;
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
            PERCENT_DECIMALS = await saplingMath.PERCENT_DECIMALS();
            TOKEN_MULTIPLIER = BigNumber.from(10).pow(TOKEN_DECIMALS);
            ONE_HUNDRED_PERCENT = await saplingMath.HUNDRED_PERCENT();
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

            await liquidityToken.connect(deployer).mint(staker.address, stakeAmount);
            await liquidityToken.connect(staker).approve(lendingPool.address, stakeAmount);
            await lendingPool.connect(staker).stake(stakeAmount);

            await liquidityToken.connect(deployer).mint(lender1.address, depositAmount);
            await liquidityToken.connect(lender1).approve(lendingPool.address, depositAmount);
            await lendingPool.connect(lender1).deposit(depositAmount);
        });

        describe('Initial state', function () {
            it('Initial balances are correct', async function () {
                let borrowedFunds = (await lendingPool.balances()).strategizedFunds;
                expect(borrowedFunds).to.equal(0);
            });
        });

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
                    await loanDesk
                        .connect(borrower1)
                        .requestLoan(
                            loanAmount,
                            loanDuration,
                            '0xa937074e-85a7-42a9-b858-9795d9471759',
                            '0x6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
                        );
                    let applicationId = await loanDesk.recentApplicationIdOf(borrower1.address);
                    let gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                    let installments = 1;
                    let apr = (await loanDesk.loanTemplate()).apr;
                    await loanDesk
                        .connect(staker)
                        .draftOffer(applicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);
                    await loanDesk.connect(staker).lockDraftOffer(applicationId);
                    await ethers.provider.send('evm_increaseTime', [2*24*60*60 + 1]);
                await ethers.provider.send('evm_mine');
                await loanDesk.connect(staker).offerLoan(applicationId);
                    await loanDesk.connect(borrower1).borrow(applicationId);

                    await expect(lendingPool.connect(staker).close()).to.be.reverted;
                });
            });
        });

        describe('Borrow', function () {
            let applicationId;

            after(async function () {
                await rollback();
            });

            before(async function () {
                await snapshot();

                gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                installments = 1;
                apr = (await loanDesk.loanTemplate()).apr;

                let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
                let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);
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
                await ethers.provider.send('evm_increaseTime', [2*24*60*60 + 1]);
                await ethers.provider.send('evm_mine');
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
                await rollback();
            });

            before(async function () {
                await snapshot();

                await loanDesk
                    .connect(borrower1)
                    .requestLoan(
                        loanAmount,
                        loanDuration,
                        'a937074e-85a7-42a9-b858-9795d9471759',
                        '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
                    );
                let applicationId = await loanDesk.recentApplicationIdOf(borrower1.address);
                let gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                let installments = 1;
                let apr = (await loanDesk.loanTemplate()).apr;
                await loanDesk
                    .connect(staker)
                    .draftOffer(applicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);
                await loanDesk.connect(staker).lockDraftOffer(applicationId);
                await ethers.provider.send('evm_increaseTime', [2*24*60*60 + 1]);
                await ethers.provider.send('evm_mine');
                await loanDesk.connect(staker).offerLoan(applicationId);
                let tx = await loanDesk.connect(borrower1).borrow(applicationId);
                loanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0].args.loanId;
            });

            describe('Repay', function () {
                it('Borrower can do a partial payment', async function () {
                    let loan = await loanDesk.loans(loanId);

                    await ethers.provider.send('evm_increaseTime', [loan.duration.toNumber()]);
                    await ethers.provider.send('evm_mine');

                    let paymentAmount = (await loanDesk.loanBalanceDue(loanId)).div(2);

                    await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount);
                    await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                    await expect(loanDesk.connect(borrower1).repay(loanId, paymentAmount)).to.changeTokenBalances(
                        liquidityToken,
                        [borrower1.address, lendingPool.address],
                        [-paymentAmount, paymentAmount],
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

                    await ethers.provider.send('evm_increaseTime', [loan.duration.toNumber() - 60]);
                    await ethers.provider.send('evm_mine');

                    let paymentAmount = await loanDesk.loanBalanceDue(loanId);

                    await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount);
                    await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                    await expect(loanDesk.connect(borrower1).repay(loanId, paymentAmount)).to.changeTokenBalances(
                        liquidityToken,
                        [borrower1.address, lendingPool.address],
                        [-paymentAmount, paymentAmount],
                    );
                    let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

                    let loanDetail = await loanDesk.loanDetails(loanId);
                    expect(loanDetail.totalAmountRepaid).to.equal(paymentAmount);
                    expect((await loanDesk.loans(loanId)).status).to.equal(LoanStatus.REPAID);
                });

                it('3rd party can do a partial payment on behalf of the borrower', async function () {
                    let loan = await loanDesk.loans(loanId);

                    await ethers.provider.send('evm_increaseTime', [loan.duration.toNumber()]);
                    await ethers.provider.send('evm_mine');

                    let paymentAmount = (await loanDesk.loanBalanceDue(loanId)).div(2);

                    await liquidityToken.connect(deployer).mint(lender3.address, paymentAmount);
                    await liquidityToken.connect(lender3).approve(lendingPool.address, paymentAmount);
                    await expect(
                        loanDesk.connect(lender3).repayOnBehalf(loanId, paymentAmount, borrower1.address),
                    ).to.changeTokenBalances(
                        liquidityToken,
                        [lender3.address, lendingPool.address],
                        [-paymentAmount, paymentAmount],
                    );
                    let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

                    loan = await loanDesk.loans(loanId);
                    let loanDetail = await loanDesk.loanDetails(loanId);
                    expect(loanDetail.totalAmountRepaid).to.equal(paymentAmount);
                    expect(loan.status).to.equal(LoanStatus.OUTSTANDING);
                });

                it('3rd party can do full payments on behalf of the borrower', async function () {
                    let loan = await loanDesk.loans(loanId);

                    await ethers.provider.send('evm_increaseTime', [loan.duration.toNumber() - 60]);
                    await ethers.provider.send('evm_mine');

                    let paymentAmount = await loanDesk.loanBalanceDue(loanId);

                    await liquidityToken.connect(deployer).mint(lender3.address, paymentAmount);
                    await liquidityToken.connect(lender3).approve(lendingPool.address, paymentAmount);
                    await expect(
                        loanDesk.connect(lender3).repayOnBehalf(loanId, paymentAmount, borrower1.address),
                    ).to.changeTokenBalances(
                        liquidityToken,
                        [lender3.address, lendingPool.address],
                        [-paymentAmount, paymentAmount],
                    );
                    let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

                    let loanDetail = await loanDesk.loanDetails(loanId);
                    expect(loanDetail.totalAmountRepaid).to.equal(paymentAmount);
                    expect((await loanDesk.loans(loanId)).status).to.equal(LoanStatus.REPAID);
                });

                it('Repaying a loan will allocate protocol fees to the protocol', async function () {
                    let balanceBefore = (await lendingPool.balances()).protocolRevenue;
                    let loan = await loanDesk.loans(loanId);

                    await ethers.provider.send('evm_increaseTime', [loan.duration.toNumber()]);
                    await ethers.provider.send('evm_mine');

                    let paymentAmount = await loanDesk.loanBalanceDue(loanId);
                    await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount);
                    await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                    await loanDesk.connect(borrower1).repay(loanId, paymentAmount);

                    let loanDetail = await loanDesk.loanDetails(loanId);
                    let protocolEarningPercent = (await lendingPool.config()).protocolFeePercent;
                    let ONE_HUNDRED_PERCENT = await saplingMath.HUNDRED_PERCENT();

                    let expectedProtocolFee = loanDetail.interestPaid
                        .mul(protocolEarningPercent)
                        .div(ONE_HUNDRED_PERCENT);
                    expect((await lendingPool.balances()).protocolRevenue).to.equal(
                        balanceBefore.add(expectedProtocolFee),
                    );
                });

                it('Repaying a loan will allocate protocol fees to the staker', async function () {
                    let balanceBefore = (await lendingPool.balances()).stakerEarnings;
                    let loan = await loanDesk.loans(loanId);

                    await ethers.provider.send('evm_increaseTime', [loan.duration.toNumber()]);
                    await ethers.provider.send('evm_mine');

                    let paymentAmount = await loanDesk.loanBalanceDue(loanId);

                    let protocolEarningPercent = (await lendingPool.config()).protocolFeePercent;
                    let ONE_HUNDRED_PERCENT = await saplingMath.HUNDRED_PERCENT();

                    let stakedShares = (await lendingPool.balances()).stakedShares;
                    let totalPoolShares = await poolToken.totalSupply();
                    let stakerExcessLeverageComponent = ((await lendingPool.config()).stakerEarnFactor) - ONE_HUNDRED_PERCENT;

                    let currentStakePercent = stakedShares.mul(ONE_HUNDRED_PERCENT).div(totalPoolShares);
                    let stakerEarningsPercent = currentStakePercent
                        .mul(stakerExcessLeverageComponent)
                        .div(ONE_HUNDRED_PERCENT);

                    await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount);
                    await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                    await loanDesk.connect(borrower1).repay(loanId, paymentAmount);

                    let loanDetail = await loanDesk.loanDetails(loanId);

                    let expectedProtocolFee = loanDetail.interestPaid
                        .mul(protocolEarningPercent)
                        .div(ONE_HUNDRED_PERCENT);

                    let stakerEarnedInterest = loanDetail.interestPaid
                        .sub(expectedProtocolFee)
                        .mul(stakerEarningsPercent)
                        .div(stakerEarningsPercent.add(ONE_HUNDRED_PERCENT));

                    expect((await lendingPool.balances()).stakerEarnings).to.equal(
                        balanceBefore.add(stakerEarnedInterest),
                    );
                });

                it('Overpaying a loan should only charge up to total amount due', async function () {
                    await ethers.provider.send('evm_increaseTime', [60]);
                    await ethers.provider.send('evm_mine');

                    let loanBalanceDue = await loanDesk.loanBalanceDue(loanId);
                    let paymentAmount = loanBalanceDue.add(BigNumber.from(500).mul(TOKEN_MULTIPLIER));

                    await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount);
                    await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                    await expect(loanDesk.connect(borrower1).repay(loanId, paymentAmount)).to.changeTokenBalances(
                        liquidityToken,
                        [borrower1.address, lendingPool.address],
                        [-loanBalanceDue, loanBalanceDue],
                    );
                });

                it('Borrower can do a payment with amount less than the required minimum but equal to outstanding balance', async function () {
                    let loan = await loanDesk.loans(loanId);

                    await ethers.provider.send('evm_increaseTime', [loan.duration.toNumber()-60]);
                    await ethers.provider.send('evm_mine');

                    let paymentAmount2 = TOKEN_MULTIPLIER.mul(1).sub(1);
                    let paymentAmount1 = (await loanDesk.loanBalanceDue(loanId)).sub(paymentAmount2);

                    await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount1.add(paymentAmount2));
                    await liquidityToken
                        .connect(borrower1)
                        .approve(lendingPool.address, paymentAmount1.add(paymentAmount2));
                    await loanDesk.connect(borrower1).repay(loanId, paymentAmount1);

                    await expect(loanDesk.connect(borrower1).repay(loanId, paymentAmount2)).to.be.not.reverted;

                    await ethers.provider.send('evm_mine');

                    loan = await loanDesk.loans(loanId);
                    expect(loan.status).to.equal(LoanStatus.REPAID);
                });

                describe('Rejection scenarios', function () {
                    it('Repaying a less than minimum payment amount on a loan with a greater outstanding balance should fail', async function () {
                        let paymentAmount = TOKEN_MULTIPLIER.mul(1).sub(1);
                        let balanceDue = await loanDesk.loanBalanceDue(loanId);

                        assertHardhatInvariant(balanceDue.gt(paymentAmount));

                        await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount);
                        await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                        await expect(loanDesk.connect(protocol).repay(loanId, paymentAmount)).to.be.reverted;
                    });

                    it('Repaying a loan that is not in OUTSTANDING status should fail', async function () {
                        await ethers.provider.send('evm_increaseTime', [60]);
                        await ethers.provider.send('evm_mine');

                        let paymentAmount = await loanDesk.loanBalanceDue(loanId);

                        await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount);
                        await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                        await loanDesk.connect(borrower1).repay(loanId, paymentAmount);
                        expect((await loanDesk.loans(loanId)).status).to.equal(LoanStatus.REPAID);

                        await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount);
                        await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                        await expect(loanDesk.connect(borrower1).repay(loanId, paymentAmount)).to.be.reverted;
                    });

                    it('Repaying a nonexistent loan should fail', async function () {
                        await liquidityToken.connect(deployer).mint(borrower1.address, loanAmount);
                        await liquidityToken.connect(borrower1).approve(lendingPool.address, loanAmount);
                        await expect(loanDesk.connect(borrower1).repay(loanId.add(1), loanAmount)).to.be.reverted;
                    });

                    it('Repaying a loan as the protocol should fail', async function () {
                        let paymentAmount = BigNumber.from(100).mul(TOKEN_MULTIPLIER);
                        await liquidityToken.connect(deployer).mint(protocol.address, paymentAmount);
                        await liquidityToken.connect(protocol).approve(lendingPool.address, paymentAmount);
                        await expect(loanDesk.connect(protocol).repay(loanId, paymentAmount)).to.be.reverted;
                    });

                    it('Repaying a loan as the governance should fail', async function () {
                        let paymentAmount = BigNumber.from(100).mul(TOKEN_MULTIPLIER);
                        await liquidityToken.connect(deployer).mint(governance.address, paymentAmount);
                        await liquidityToken.connect(governance).approve(lendingPool.address, paymentAmount);
                        await expect(loanDesk.connect(governance).repay(loanId, paymentAmount)).to.be.reverted;
                    });

                    it('Repaying a loan from an unrelated address should fail', async function () {
                        let paymentAmount = BigNumber.from(100).mul(TOKEN_MULTIPLIER);
                        await liquidityToken.connect(deployer).mint(addresses[0].address, paymentAmount);
                        await liquidityToken.connect(addresses[0]).approve(lendingPool.address, paymentAmount);
                        await expect(loanDesk.connect(addresses[0]).repay(loanId, paymentAmount)).to.be.reverted;
                    });

                    it('Repaying a loan on behalf of a wrong borrower should fail', async function () {
                        await liquidityToken.connect(deployer).mint(lender3.address, loanAmount);
                        await liquidityToken.connect(lender3).approve(lendingPool.address, loanAmount);
                        await expect(loanDesk.connect(lender3).repayOnBehalf(loanId, loanAmount, borrower2.address))
                            .to.be.reverted;
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
                        await rollback();
                    });

                    before(async function () {
                        await snapshot();

                        let loan = await loanDesk.loans(loanId);
                        await ethers.provider.send('evm_increaseTime', [
                            loan.duration.add(loan.gracePeriod).add(1).toNumber(),
                        ]);
                        await ethers.provider.send('evm_mine');
                    });

                    it('Staker can default a partially repaid loan', async function () {
                        let paymentAmount = (await loanDesk.loanBalanceDue(loanId)).div(2);
                        await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                        await loanDesk.connect(borrower1).repay(loanId, paymentAmount);

                        let poolFundsBefore = (await lendingPool.balances()).poolFunds;
                        let stakedBalanceBefore = await lendingPool.balanceStaked();

                        expect(await loanDesk.canDefault(loanId)).to.equal(true);
                        await loanDesk.connect(staker).defaultLoan(loanId);

                        loan = await loanDesk.loans(loanId);
                        let loanDetail = await loanDesk.loanDetails(loanId);
                        let lossAmount = loan.amount.sub(loanDetail.principalAmountRepaid);

                        expect(loan.status).to.equal(LoanStatus.DEFAULTED);
                        expect((await lendingPool.balances()).poolFunds).to.equal(poolFundsBefore.sub(lossAmount));
                        expect(await lendingPool.balanceStaked()).to.gte(stakedBalanceBefore.sub(lossAmount).sub(5))
                            .and.to.lte(stakedBalanceBefore.sub(lossAmount).add(5));
                    });

                    it('Staker can default a loan that has no payments made', async function () {
                        let poolFundsBefore = (await lendingPool.balances()).poolFunds;
                        let stakedBalanceBefore = await lendingPool.balanceStaked();

                        expect(await loanDesk.canDefault(loanId)).to.equal(true);
                        await loanDesk.connect(staker).defaultLoan(loanId);

                        loan = await loanDesk.loans(loanId);
                        let loanDetail = await loanDesk.loanDetails(loanId);
                        let lossAmount = loan.amount.sub(loanDetail.principalAmountRepaid);

                        expect(loan.status).to.equal(LoanStatus.DEFAULTED);
                        expect((await lendingPool.balances()).poolFunds).to.equal(poolFundsBefore.sub(lossAmount));
                        expect(await lendingPool.balanceStaked()).to.equal(stakedBalanceBefore.sub(lossAmount));
                    });

                    it('Staker can default a loan with an loss amount equal to the stakers stake', async function () {
                        let loanAmount = await lendingPool.balanceStaked();
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
                        let gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                        let installments = 1;
                        let apr = (await loanDesk.loanTemplate()).apr;
                        await loanDesk
                            .connect(staker)
                            .draftOffer(otherApplicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);
                        await loanDesk.connect(staker).lockDraftOffer(otherApplicationId);
                        await ethers.provider.send('evm_increaseTime', [2*24*60*60 + 1]);
                await ethers.provider.send('evm_mine');
                await loanDesk.connect(staker).offerLoan(otherApplicationId);
                        let tx = await loanDesk.connect(borrower2).borrow(otherApplicationId);
                        let otherLoanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0]
                            .args.loanId;

                        await ethers.provider.send('evm_increaseTime', [
                            loanDuration.add(gracePeriod).add(1).toNumber(),
                        ]);
                        await ethers.provider.send('evm_mine');

                        let poolFundsBefore = (await lendingPool.balances()).poolFunds;

                        expect(await loanDesk.canDefault(otherLoanId)).to.equal(true);
                        await loanDesk.connect(staker).defaultLoan(otherLoanId);

                        let loan = await loanDesk.loans(otherLoanId);
                        let loanDetail = await loanDesk.loanDetails(otherLoanId);
                        let lossAmount = loan.amount.sub(loanDetail.principalAmountRepaid);
                        expect(loan.status).to.equal(LoanStatus.DEFAULTED);
                        expect((await lendingPool.balances()).poolFunds).to.equal(poolFundsBefore.sub(lossAmount));
                        expect(await lendingPool.balanceStaked()).to.equal(0);
                    });

                    it('Staker can default a loan with an loss amount greater than the stakers stake', async function () {
                        let loanAmount = (await lendingPool.balanceStaked()).mul(2);
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
                        let gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                        let installments = 1;
                        let apr = (await loanDesk.loanTemplate()).apr;
                        await loanDesk
                            .connect(staker)
                            .draftOffer(otherApplicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);
                        await loanDesk.connect(staker).lockDraftOffer(otherApplicationId);
                        await ethers.provider.send('evm_increaseTime', [2*24*60*60 + 1]);
                await ethers.provider.send('evm_mine');
                await loanDesk.connect(staker).offerLoan(otherApplicationId);
                        let tx = await loanDesk.connect(borrower2).borrow(otherApplicationId);
                        let otherLoanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0]
                            .args.loanId;

                        await ethers.provider.send('evm_increaseTime', [
                            loanDuration.add(gracePeriod).add(1).toNumber(),
                        ]);
                        await ethers.provider.send('evm_mine');

                        let poolFundsBefore = (await lendingPool.balances()).poolFunds;

                        expect(await loanDesk.canDefault(otherLoanId)).to.equal(true);
                        await loanDesk.connect(staker).defaultLoan(otherLoanId);

                        let loan = await loanDesk.loans(otherLoanId);
                        let loanDetail = await loanDesk.loanDetails(otherLoanId);
                        let lossAmount = loan.amount.sub(loanDetail.principalAmountRepaid);
                        expect(loan.status).to.equal(LoanStatus.DEFAULTED);
                        expect((await lendingPool.balances()).poolFunds).to.equal(poolFundsBefore.sub(lossAmount));
                        expect(await lendingPool.balanceStaked()).to.equal(0);
                    });

                    it('Staker can default a loan with a missed installment', async function () {
                        await loanDesk
                            .connect(borrower2)
                            .requestLoan(
                                loanAmount,
                                loanDuration,
                                'a937074e-85a7-42a9-b858-9795d9471759',
                                '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
                            );

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
                        await ethers.provider.send('evm_increaseTime', [2*24*60*60 + 1]);
                await ethers.provider.send('evm_mine');
                await loanDesk.connect(staker).offerLoan(applicationId2);
                        let tx = await loanDesk.connect(borrower2).borrow(applicationId2);
                        let loanId2 = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0].args.loanId;

                        await ethers.provider.send('evm_increaseTime', [loanDuration.div(installments).add(gracePeriod).add(1).toNumber()]);
                        await ethers.provider.send('evm_mine');

                        expect(await loanDesk.canDefault(loanId2)).to.equal(true);
                        await expect(loanDesk.connect(staker).defaultLoan(loanId2)).to.be.not.reverted;
                    });

                    describe('Rejection scenarios', function () {
                        it('Defaulting a loan that is not in OUTSTANDING status should fail', async function () {
                            let paymentAmount = await loanDesk.loanBalanceDue(loanId);
                            await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount);
                            await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                            await loanDesk.connect(borrower1).repay(loanId, paymentAmount);
                            loan = await loanDesk.loans(loanId);
                            assertHardhatInvariant(loan.status === LoanStatus.REPAID);

                            await expect(loanDesk.canDefault(loanId)).to.be.revertedWith("LoanDesk: invalid status");
                            await expect(loanDesk.connect(staker).defaultLoan(loanId)).to.be.reverted;
                        });

                        it('Defaulting a nonexistent loan should fail', async function () {
                            await expect(loanDesk.canDefault(loanId.add(1))).to.be.revertedWith("LoanDesk: not found");
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
