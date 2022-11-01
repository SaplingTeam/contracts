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

describe('Sapling Lending Pool)', function () {
    const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
    const TOKEN_DECIMALS = 6;

    let SaplingLendingPoolCF;
    let liquidityToken;
    let poolToken;
    let loanDesk;

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
            deployer.address,
            protocol.address,
            manager.address,
        ]);
        await lendingPool.deployed();

        loanDesk = await upgrades.deployProxy(LoanDeskCF, [
            lendingPool.address,
            governance.address,
            protocol.address,
            manager.address,
            TOKEN_DECIMALS,
        ]);
        await loanDesk.deployed();

        await poolToken.connect(deployer).transferOwnership(lendingPool.address);
        await lendingPool.connect(deployer).setLoanDesk(loanDesk.address);
        await lendingPool.connect(deployer).transferGovernance(governance.address);
    });

    describe('Deployment', function () {
        it('Can deploy', async function () {
            await expect(
                upgrades.deployProxy(SaplingLendingPoolCF, [
                    poolToken.address,
                    liquidityToken.address,
                    deployer.address,
                    protocol.address,
                    manager.address,
                ]),
            ).to.be.not.reverted;
        });

        describe('Rejection Scenarios', function () {});
    });

    describe('Initial state', function () {
        it('Loan count is correct', async function () {
            expect(await lendingPool.loansCount()).to.equal(0);
        });

        it('Empty pool to stake ratio is good', async function () {
            expect(await lendingPool.poolCanLend()).to.equal(true);
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
            PERCENT_DECIMALS = await lendingPool.percentDecimals();
            TOKEN_MULTIPLIER = BigNumber.from(10).pow(TOKEN_DECIMALS);
            ONE_HUNDRED_PERCENT = await lendingPool.oneHundredPercent();
            exitFeePercent = (await lendingPool.poolConfig()).exitFeePercent;

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

            await liquidityToken.connect(deployer).mint(manager.address, stakeAmount);
            await liquidityToken.connect(manager).approve(lendingPool.address, stakeAmount);
            await lendingPool.connect(manager).stake(stakeAmount);

            await liquidityToken.connect(deployer).mint(lender1.address, depositAmount);
            await liquidityToken.connect(lender1).approve(lendingPool.address, depositAmount);
            await lendingPool.connect(lender1).deposit(depositAmount);
        });

        describe('Initial state', function () {
            it('Initial balances are correct', async function () {
                expect(await lendingPool.borrowedFunds()).to.equal(0);
            });
        });

        describe('Setting pool parameters', function () {
            describe('Loan Desk', function () {});
        });

        describe('Close Pool', function () {
            it('Manager can close the pool', async function () {
                await lendingPool.connect(manager).close();
                expect(await lendingPool.closed()).to.equal(true);
            });

            describe('Rejection scenarios', function () {
                it('Closing the pool with a non-zero borrowed amount should fail', async function () {
                    await loanDesk
                        .connect(borrower1)
                        .requestLoan(
                            loanAmount,
                            loanDuration,
                            'a937074e-85a7-42a9-b858-9795d9471759',
                            '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
                        );
                    let applicationId = (await loanDesk.borrowerStats(borrower1.address)).recentApplicationId;
                    let gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                    let installments = 1;
                    let apr = (await loanDesk.loanTemplate()).apr;
                    await loanDesk
                        .connect(manager)
                        .offerLoan(applicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);
                    await lendingPool.connect(borrower1).borrow(applicationId);

                    await expect(lendingPool.connect(manager).close()).to.be.reverted;
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
                applicationId = (await loanDesk.borrowerStats(borrower1.address)).recentApplicationId;
                application = await loanDesk.loanApplications(applicationId);
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

            it('Borrowers can borrow', async function () {
                let balanceBefore = await liquidityToken.balanceOf(borrower1.address);

                await lendingPool.connect(borrower1).borrow(applicationId);
                let loanId = (await lendingPool.borrowerStats(borrower1.address)).recentLoanId;

                let loan = await lendingPool.loans(loanId);
                expect(loan.status).to.equal(LoanStatus.OUTSTANDING);

                expect(await liquidityToken.balanceOf(borrower1.address)).to.equal(balanceBefore.add(loan.amount));
            });

            describe('Rejection scenarios', function () {
                it('Borrowing a loan that is not in APPROVED status should fail', async function () {
                    await loanDesk.connect(manager).cancelLoan(applicationId);
                    await expect(lendingPool.connect(borrower1).borrow(applicationId)).to.be.reverted;
                });

                it('Borrowing a loan when the pool is paused should fail', async function () {
                    await lendingPool.connect(governance).pause();
                    await expect(lendingPool.connect(borrower1).borrow(applicationId)).to.be.reverted;
                });

                it('Borrowing a nonexistent loan should fail', async function () {
                    await expect(lendingPool.connect(lender1).borrow(applicationId.add(1))).to.be.reverted;
                });

                it('Borrowing a loan as the protocol should fail', async function () {
                    await expect(lendingPool.connect(protocol).borrow(applicationId)).to.be.reverted;
                });

                it('Borrowing a loan as the governance should fail', async function () {
                    await expect(lendingPool.connect(governance).borrow(applicationId)).to.be.reverted;
                });

                it('Borrowing a loan as a lender should fail', async function () {
                    await expect(lendingPool.connect(lender1).borrow(applicationId)).to.be.reverted;
                });

                it('Borrowing a loan from an unrelated address should fail', async function () {
                    await expect(lendingPool.connect(addresses[0]).borrow(applicationId)).to.be.reverted;
                });
            });

            describe('Borrower Statistics', function () {
                it('Borrowing a loan increases amount borrowed', async function () {
                    let prevAmountBorrowed = (await lendingPool.borrowerStats(borrower1.address)).amountBorrowed;

                    await lendingPool.connect(borrower1).borrow(applicationId);
                    let loanId = (await lendingPool.borrowerStats(borrower1.address)).recentLoanId;

                    let loan = await lendingPool.loans(loanId);
                    let stat = await lendingPool.borrowerStats(borrower1.address);
                    expect(stat.amountBorrowed).to.equal(prevAmountBorrowed.add(loan.amount));
                });

                it('Borrowing a loan increments outstanding loan count', async function () {
                    let prevStat = await lendingPool.borrowerStats(borrower1.address);

                    await lendingPool.connect(borrower1).borrow(applicationId);

                    let stat = await lendingPool.borrowerStats(borrower1.address);
                    expect(stat.countOutstanding).to.equal(prevStat.countOutstanding.add(1));
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
                let applicationId = (await loanDesk.borrowerStats(borrower1.address)).recentApplicationId;
                let gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                let installments = 1;
                let apr = (await loanDesk.loanTemplate()).apr;
                await loanDesk
                    .connect(manager)
                    .offerLoan(applicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);

                await lendingPool.connect(borrower1).borrow(applicationId);
                loanId = (await lendingPool.borrowerStats(borrower1.address)).recentLoanId;
            });

            describe('Repay', function () {
                it('Borrower can do a partial payment', async function () {
                    let loan = await lendingPool.loans(loanId);

                    await ethers.provider.send('evm_increaseTime', [loan.duration.toNumber()]);
                    await ethers.provider.send('evm_mine');

                    let paymentAmount = (await lendingPool.loanBalanceDue(loanId)).div(2);

                    await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount);
                    await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                    await expect(lendingPool.connect(borrower1).repay(loanId, paymentAmount)).to.changeTokenBalances(
                        liquidityToken,
                        [borrower1.address, lendingPool.address],
                        [-paymentAmount, paymentAmount],
                    );

                    let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

                    loan = await lendingPool.loans(loanId);
                    let loanDetail = await lendingPool.loanDetails(loanId);
                    expect(loanDetail.totalAmountRepaid).to.equal(paymentAmount);
                    expect(loanDetail.lastPaymentTime).to.equal(blockTimestamp);
                    expect(loan.status).to.equal(LoanStatus.OUTSTANDING);
                });

                it('Borrower can do full payments', async function () {
                    let balanceBefore = await liquidityToken.balanceOf(borrower1.address);
                    let loan = await lendingPool.loans(loanId);

                    await ethers.provider.send('evm_increaseTime', [loan.duration.toNumber()]);
                    await ethers.provider.send('evm_mine');

                    let paymentAmount = await lendingPool.loanBalanceDue(loanId);

                    await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount);
                    await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                    await expect(lendingPool.connect(borrower1).repay(loanId, paymentAmount)).to.changeTokenBalances(
                        liquidityToken,
                        [borrower1.address, lendingPool.address],
                        [-paymentAmount, paymentAmount],
                    );
                    let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

                    let loanDetail = await lendingPool.loanDetails(loanId);
                    expect(loanDetail.totalAmountRepaid).to.equal(paymentAmount);
                    expect(loanDetail.lastPaymentTime).to.equal(blockTimestamp);
                    expect((await lendingPool.loans(loanId)).status).to.equal(LoanStatus.REPAID);
                });

                it('3rd party can do a partial payment on behalf of the borrower', async function () {
                    let loan = await lendingPool.loans(loanId);

                    await ethers.provider.send('evm_increaseTime', [loan.duration.toNumber()]);
                    await ethers.provider.send('evm_mine');

                    let paymentAmount = (await lendingPool.loanBalanceDue(loanId)).div(2);

                    await liquidityToken.connect(deployer).mint(lender3.address, paymentAmount);
                    await liquidityToken.connect(lender3).approve(lendingPool.address, paymentAmount);
                    await expect(
                        lendingPool.connect(lender3).repayOnBehalf(loanId, paymentAmount, borrower1.address),
                    ).to.changeTokenBalances(
                        liquidityToken,
                        [lender3.address, lendingPool.address],
                        [-paymentAmount, paymentAmount],
                    );
                    let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

                    loan = await lendingPool.loans(loanId);
                    let loanDetail = await lendingPool.loanDetails(loanId);
                    expect(loanDetail.totalAmountRepaid).to.equal(paymentAmount);
                    expect(loanDetail.lastPaymentTime).to.equal(blockTimestamp);
                    expect(loan.status).to.equal(LoanStatus.OUTSTANDING);
                });

                it('3rd party can do full payments on behalf of the borrower', async function () {
                    let loan = await lendingPool.loans(loanId);

                    await ethers.provider.send('evm_increaseTime', [loan.duration.toNumber()]);
                    await ethers.provider.send('evm_mine');

                    let paymentAmount = await lendingPool.loanBalanceDue(loanId);

                    await liquidityToken.connect(deployer).mint(lender3.address, paymentAmount);
                    await liquidityToken.connect(lender3).approve(lendingPool.address, paymentAmount);
                    await expect(
                        lendingPool.connect(lender3).repayOnBehalf(loanId, paymentAmount, borrower1.address),
                    ).to.changeTokenBalances(
                        liquidityToken,
                        [lender3.address, lendingPool.address],
                        [-paymentAmount, paymentAmount],
                    );
                    let blockTimestamp = await (await ethers.provider.getBlock()).timestamp;

                    let loanDetail = await lendingPool.loanDetails(loanId);
                    expect(loanDetail.totalAmountRepaid).to.equal(paymentAmount);
                    expect(loanDetail.lastPaymentTime).to.equal(blockTimestamp);
                    expect((await lendingPool.loans(loanId)).status).to.equal(LoanStatus.REPAID);
                });

                it('Repaying a loan will allocate protocol fees to the protocol', async function () {
                    let balanceBefore = await lendingPool.revenueBalanceOf(protocol.address);
                    let loan = await lendingPool.loans(loanId);

                    await ethers.provider.send('evm_increaseTime', [loan.duration.toNumber()]);
                    await ethers.provider.send('evm_mine');

                    let paymentAmount = await lendingPool.loanBalanceDue(loanId);
                    await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount);
                    await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                    await lendingPool.connect(borrower1).repay(loanId, paymentAmount);

                    let loanDetail = await lendingPool.loanDetails(loanId);
                    let protocolEarningPercent = (await lendingPool.poolConfig()).protocolFeePercent;
                    let ONE_HUNDRED_PERCENT = await lendingPool.oneHundredPercent();

                    let expectedProtocolFee = loanDetail.interestPaid
                        .mul(protocolEarningPercent)
                        .div(ONE_HUNDRED_PERCENT);
                    expect(await lendingPool.revenueBalanceOf(protocol.address)).to.equal(
                        balanceBefore.add(expectedProtocolFee),
                    );
                });

                it('Repaying a loan will allocate protocol fees to the manager', async function () {
                    let balanceBefore = await lendingPool.revenueBalanceOf(manager.address);
                    let loan = await lendingPool.loans(loanId);

                    await ethers.provider.send('evm_increaseTime', [loan.duration.toNumber()]);
                    await ethers.provider.send('evm_mine');

                    let paymentAmount = await lendingPool.loanBalanceDue(loanId);

                    let protocolEarningPercent = (await lendingPool.poolConfig()).protocolFeePercent;
                    let ONE_HUNDRED_PERCENT = await lendingPool.oneHundredPercent();

                    let stakedShares = (await lendingPool.poolBalance()).stakedShares;
                    let totalPoolShares = await poolToken.totalSupply();
                    let managerExcessLeverageComponent = ((await lendingPool.poolConfig()).managerEarnFactor) - ONE_HUNDRED_PERCENT;

                    let currentStakePercent = stakedShares.mul(ONE_HUNDRED_PERCENT).div(totalPoolShares);
                    let managerEarningsPercent = currentStakePercent
                        .mul(managerExcessLeverageComponent)
                        .div(ONE_HUNDRED_PERCENT);

                    await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount);
                    await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                    await lendingPool.connect(borrower1).repay(loanId, paymentAmount);

                    let loanDetail = await lendingPool.loanDetails(loanId);

                    let expectedProtocolFee = loanDetail.interestPaid
                        .mul(protocolEarningPercent)
                        .div(ONE_HUNDRED_PERCENT);

                    let managerEarnedInterest = loanDetail.interestPaid
                        .sub(expectedProtocolFee)
                        .mul(managerEarningsPercent)
                        .div(managerEarningsPercent.add(ONE_HUNDRED_PERCENT));

                    expect(await lendingPool.revenueBalanceOf(manager.address)).to.equal(
                        balanceBefore.add(managerEarnedInterest),
                    );
                });

                it('Overpaying a loan should only charge up to total amount due', async function () {
                    let loanBalanceDue = await lendingPool.loanBalanceDue(loanId);
                    let paymentAmount = loanBalanceDue.add(BigNumber.from(500).mul(TOKEN_MULTIPLIER));

                    await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount);
                    await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                    await expect(lendingPool.connect(borrower1).repay(loanId, paymentAmount)).to.changeTokenBalances(
                        liquidityToken,
                        [borrower1.address, lendingPool.address],
                        [-loanBalanceDue, loanBalanceDue],
                    );
                });

                it('Borrower can do a payment with amount less than the required minimum but equal to outstanding balance', async function () {
                    let loan = await lendingPool.loans(loanId);

                    await ethers.provider.send('evm_increaseTime', [loan.duration.toNumber()]);
                    await ethers.provider.send('evm_mine');

                    let paymentAmount2 = TOKEN_MULTIPLIER.mul(1).sub(1);
                    let paymentAmount1 = (await lendingPool.loanBalanceDue(loanId)).sub(paymentAmount2);

                    await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount1.add(paymentAmount2));
                    await liquidityToken
                        .connect(borrower1)
                        .approve(lendingPool.address, paymentAmount1.add(paymentAmount2));
                    await lendingPool.connect(borrower1).repay(loanId, paymentAmount1);

                    await expect(lendingPool.connect(borrower1).repay(loanId, paymentAmount2)).to.be.not.reverted;

                    await ethers.provider.send('evm_mine');

                    loan = await lendingPool.loans(loanId);
                    expect(loan.status).to.equal(LoanStatus.REPAID);
                });

                describe('Rejection scenarios', function () {
                    it('Repaying a less than minimum payment amount on a loan with a greater outstanding balance should fail', async function () {
                        let paymentAmount = TOKEN_MULTIPLIER.mul(1).sub(1);
                        let balanceDue = await lendingPool.loanBalanceDue(loanId);

                        assertHardhatInvariant(balanceDue.gt(paymentAmount));

                        await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount);
                        await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                        await expect(lendingPool.connect(protocol).repay(loanId, paymentAmount)).to.be.reverted;
                    });

                    it('Repaying less than the outstanding balance on a loan with balance less than the minimum required should fail', async function () {
                        let loan = await lendingPool.loans(loanId);

                        await ethers.provider.send('evm_increaseTime', [loan.duration.toNumber()]);
                        await ethers.provider.send('evm_mine');

                        let paymentAmount2 = TOKEN_MULTIPLIER.mul(1).sub(1);
                        let paymentAmount1 = (await lendingPool.loanBalanceDue(loanId)).sub(paymentAmount2);

                        await liquidityToken
                            .connect(deployer)
                            .mint(borrower1.address, paymentAmount1.add(paymentAmount2));
                        await liquidityToken
                            .connect(borrower1)
                            .approve(lendingPool.address, paymentAmount1.add(paymentAmount2));
                        await lendingPool.connect(borrower1).repay(loanId, paymentAmount1);

                        await expect(lendingPool.connect(borrower1).repay(loanId, paymentAmount2.sub(1))).to.be
                            .reverted;
                    });

                    it('Repaying a loan that is not in OUTSTANDING status should fail', async function () {
                        let paymentAmount = await lendingPool.loanBalanceDue(loanId);

                        await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount);
                        await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                        await lendingPool.connect(borrower1).repay(loanId, paymentAmount);
                        expect((await lendingPool.loans(loanId)).status).to.equal(LoanStatus.REPAID);

                        await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount);
                        await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                        await expect(lendingPool.connect(borrower1).repay(loanId, paymentAmount)).to.be.reverted;
                    });

                    it('Repaying a nonexistent loan should fail', async function () {
                        await liquidityToken.connect(deployer).mint(borrower1.address, loanAmount);
                        await liquidityToken.connect(borrower1).approve(lendingPool.address, loanAmount);
                        await expect(lendingPool.connect(borrower1).repay(loanId.add(1), loanAmount)).to.be.reverted;
                    });

                    it('Repaying a loan as the protocol should fail', async function () {
                        let paymentAmount = BigNumber.from(100).mul(TOKEN_MULTIPLIER);
                        await liquidityToken.connect(deployer).mint(protocol.address, paymentAmount);
                        await liquidityToken.connect(protocol).approve(lendingPool.address, paymentAmount);
                        await expect(lendingPool.connect(protocol).repay(loanId, paymentAmount)).to.be.reverted;
                    });

                    it('Repaying a loan as the governance should fail', async function () {
                        let paymentAmount = BigNumber.from(100).mul(TOKEN_MULTIPLIER);
                        await liquidityToken.connect(deployer).mint(governance.address, paymentAmount);
                        await liquidityToken.connect(governance).approve(lendingPool.address, paymentAmount);
                        await expect(lendingPool.connect(governance).repay(loanId, paymentAmount)).to.be.reverted;
                    });

                    it('Repaying a loan from an unrelated address should fail', async function () {
                        let paymentAmount = BigNumber.from(100).mul(TOKEN_MULTIPLIER);
                        await liquidityToken.connect(deployer).mint(addresses[0].address, paymentAmount);
                        await liquidityToken.connect(addresses[0]).approve(lendingPool.address, paymentAmount);
                        await expect(lendingPool.connect(addresses[0]).repay(loanId, paymentAmount)).to.be.reverted;
                    });

                    it('Repaying a loan on behalf of a wrong borrower should fail', async function () {
                        await liquidityToken.connect(deployer).mint(lender3.address, loanAmount);
                        await liquidityToken.connect(lender3).approve(lendingPool.address, loanAmount);
                        await expect(lendingPool.connect(lender3).repayOnBehalf(loanId, loanAmount, borrower2.address))
                            .to.be.reverted;
                    });
                });

                describe('Borrower Statistics', function () {
                    describe('On Full Repay', function () {
                        let prevStat;
                        let prevLoanDetail;
                        let stat;
                        let loanDetail;

                        after(async function () {
                            await rollback();
                        });

                        before(async function () {
                            await snapshot();

                            await ethers.provider.send('evm_increaseTime', [365 * 24 * 60 * 60]);
                            await ethers.provider.send('evm_mine');

                            prevStat = await lendingPool.borrowerStats(borrower1.address);
                            let loanId = prevStat.recentLoanId;

                            prevLoanDetail = await lendingPool.loanDetails(loanId);
                            let paymentAmount = await lendingPool.loanBalanceDue(loanId);

                            await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount);
                            await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                            await lendingPool.connect(borrower1).repay(loanId, paymentAmount);

                            stat = await lendingPool.borrowerStats(borrower1.address);
                            loanDetail = await lendingPool.loanDetails(loanId);
                        });

                        it('Fully repaying a loan increments all time repay count', async function () {
                            expect(stat.countRepaid).to.equal(prevStat.countRepaid.add(1));
                        });

                        it('Fully repaying a loan decrements outstanding loan count', async function () {
                            expect(stat.countOutstanding).to.equal(prevStat.countOutstanding.sub(1));
                        });

                        it('Fully repaying a loan negates the effect of current loan amount on the statistics', async function () {
                            expect(stat.amountBorrowed).to.equal(
                                prevStat.amountBorrowed.sub(loanDetail.principalAmountRepaid),
                            );
                        });

                        it('Fully repaying a loan negates the effect of current paid base amount stat on the statistics', async function () {
                            expect(stat.amountBaseRepaid).to.equal(prevStat.amountBaseRepaid);
                        });

                        it('Fully repaying a loan negates the effect of current paid interest amount on the statistics', async function () {
                            expect(stat.amountInterestPaid).to.equal(prevStat.amountInterestPaid);
                        });
                    });

                    describe('On Partial Repay', function () {
                        let prevStat;
                        let prevLoanDetail;
                        let stat;
                        let loanDetail;

                        after(async function () {
                            await rollback();
                        });

                        before(async function () {
                            await snapshot();

                            await ethers.provider.send('evm_increaseTime', [183 * 24 * 60 * 60]);
                            await ethers.provider.send('evm_mine');

                            prevStat = await lendingPool.borrowerStats(borrower1.address);
                            let loanId = prevStat.recentLoanId;

                            prevLoanDetail = await lendingPool.loanDetails(loanId);
                            let paymentAmount = (await lendingPool.loanBalanceDue(loanId)).div(2);

                            await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                            await lendingPool.connect(borrower1).repay(loanId, paymentAmount);

                            stat = await lendingPool.borrowerStats(borrower1.address);
                            loanDetail = await lendingPool.loanDetails(loanId);
                        });

                        it('Partial loan payments do not change all time repaid loan count', async function () {
                            expect(stat.countRepaid).to.equal(prevStat.countRepaid);
                        });

                        it('Partial loan payments do not change all outstanding loan count', async function () {
                            expect(stat.countOutstanding).to.equal(prevStat.countOutstanding);
                        });

                        it('Partial loan payments do not change amount borrowed', async function () {
                            expect(stat.amountBorrowed).to.equal(prevStat.amountBorrowed);
                        });

                        it('Partial loan payments increase base amount repaid', async function () {
                            expect(stat.amountBaseRepaid).to.equal(
                                prevStat.amountBaseRepaid.add(loanDetail.principalAmountRepaid),
                            );
                        });

                        it('Partial loan payments increase paid interest amount', async function () {
                            expect(stat.amountInterestPaid).to.equal(loanDetail.interestPaid);
                        });
                    });
                });
            });

            describe('Default', function () {
                describe('Default before the grace period', function () {
                    describe('Rejection scenarios', function () {
                        it('Defaulting a loan before the grace period is up should fail', async function () {
                            await expect(lendingPool.connect(manager).defaultLoan(loanId)).to.be.reverted;
                        });
                    });
                });

                describe('Default after grace period', function () {
                    after(async function () {
                        await rollback();
                    });

                    before(async function () {
                        await snapshot();

                        let loan = await lendingPool.loans(loanId);
                        await ethers.provider.send('evm_increaseTime', [
                            loan.duration.add(loan.gracePeriod).add(1).toNumber(),
                        ]);
                        await ethers.provider.send('evm_mine');
                    });

                    it('Manager can default a partially repaid loan', async function () {
                        let paymentAmount = (await lendingPool.loanBalanceDue(loanId)).div(2);
                        await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                        await lendingPool.connect(borrower1).repay(loanId, paymentAmount);

                        let poolFundsBefore = (await lendingPool.poolBalance()).poolFunds;
                        let stakedBalanceBefore = await lendingPool.balanceStaked();

                        expect(await lendingPool.canDefault(loanId, manager.address)).to.equal(true);
                        await lendingPool.connect(manager).defaultLoan(loanId);

                        loan = await lendingPool.loans(loanId);
                        let loanDetail = await lendingPool.loanDetails(loanId);
                        let lossAmount = loan.amount.sub(loanDetail.principalAmountRepaid);

                        expect(loan.status).to.equal(LoanStatus.DEFAULTED);
                        expect((await lendingPool.poolBalance()).poolFunds).to.equal(poolFundsBefore.sub(lossAmount));
                        expect(await lendingPool.balanceStaked()).to.gte(stakedBalanceBefore.sub(lossAmount).sub(5))
                            .and.to.lte(stakedBalanceBefore.sub(lossAmount).add(5));
                    });

                    it('Manager can default a loan that has no payments made', async function () {
                        let poolFundsBefore = (await lendingPool.poolBalance()).poolFunds;
                        let stakedBalanceBefore = await lendingPool.balanceStaked();

                        expect(await lendingPool.canDefault(loanId, manager.address)).to.equal(true);
                        await lendingPool.connect(manager).defaultLoan(loanId);

                        loan = await lendingPool.loans(loanId);
                        let loanDetail = await lendingPool.loanDetails(loanId);
                        let lossAmount = loan.amount.sub(loanDetail.principalAmountRepaid);
                        expect(loan.status).to.equal(LoanStatus.DEFAULTED);
                        expect((await lendingPool.poolBalance()).poolFunds).to.equal(poolFundsBefore.sub(lossAmount));
                        expect(await lendingPool.balanceStaked()).to.equal(stakedBalanceBefore.sub(lossAmount));
                    });

                    it('Manager can default a loan with an loss amount equal to the managers stake', async function () {
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
                        let otherApplicationId = (await loanDesk.borrowerStats(borrower2.address)).recentApplicationId;
                        let gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                        let installments = 1;
                        let apr = (await loanDesk.loanTemplate()).apr;
                        await loanDesk
                            .connect(manager)
                            .offerLoan(otherApplicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);
                        await lendingPool.connect(borrower2).borrow(otherApplicationId);

                        await ethers.provider.send('evm_increaseTime', [
                            loanDuration.add(gracePeriod).add(1).toNumber(),
                        ]);
                        await ethers.provider.send('evm_mine');

                        let poolFundsBefore = (await lendingPool.poolBalance()).poolFunds;

                        let otherLoanId = (await lendingPool.borrowerStats(borrower2.address)).recentLoanId;

                        expect(await lendingPool.canDefault(otherLoanId, manager.address)).to.equal(true);
                        await lendingPool.connect(manager).defaultLoan(otherLoanId);

                        let loan = await lendingPool.loans(otherLoanId);
                        let loanDetail = await lendingPool.loanDetails(otherLoanId);
                        let lossAmount = loan.amount.sub(loanDetail.principalAmountRepaid);
                        expect(loan.status).to.equal(LoanStatus.DEFAULTED);
                        expect((await lendingPool.poolBalance()).poolFunds).to.equal(poolFundsBefore.sub(lossAmount));
                        expect(await lendingPool.balanceStaked()).to.equal(0);
                    });

                    it('Manager can default a loan with an loss amount greater than the managers stake', async function () {
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
                        let otherApplicationId = (await loanDesk.borrowerStats(borrower2.address)).recentApplicationId;
                        let gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                        let installments = 1;
                        let apr = (await loanDesk.loanTemplate()).apr;
                        await loanDesk
                            .connect(manager)
                            .offerLoan(otherApplicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);
                        await lendingPool.connect(borrower2).borrow(otherApplicationId);

                        await ethers.provider.send('evm_increaseTime', [
                            loanDuration.add(gracePeriod).add(1).toNumber(),
                        ]);
                        await ethers.provider.send('evm_mine');

                        let otherLoanId = (await lendingPool.borrowerStats(borrower2.address)).recentLoanId;
                        let poolFundsBefore = (await lendingPool.poolBalance()).poolFunds;

                        expect(await lendingPool.canDefault(otherLoanId, manager.address)).to.equal(true);
                        await lendingPool.connect(manager).defaultLoan(otherLoanId);

                        let loan = await lendingPool.loans(otherLoanId);
                        let loanDetail = await lendingPool.loanDetails(otherLoanId);
                        let lossAmount = loan.amount.sub(loanDetail.principalAmountRepaid);
                        expect(loan.status).to.equal(LoanStatus.DEFAULTED);
                        expect((await lendingPool.poolBalance()).poolFunds).to.equal(poolFundsBefore.sub(lossAmount));
                        expect(await lendingPool.balanceStaked()).to.equal(0);
                    });

                    it('Manager can default a loan with a missed installment', async function () {
                        await loanDesk
                            .connect(borrower2)
                            .requestLoan(
                                loanAmount,
                                loanDuration,
                                'a937074e-85a7-42a9-b858-9795d9471759',
                                '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
                            );

                        let applicationId2 = (await loanDesk.borrowerStats(borrower2.address)).recentApplicationId;
                        let gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                        let installments = 4;
                        let installmentAmount = BigNumber.from(250).mul(TOKEN_MULTIPLIER);
                        let apr = (await loanDesk.loanTemplate()).apr;
                        await loanDesk
                            .connect(manager)
                            .offerLoan(
                                applicationId2,
                                loanAmount,
                                loanDuration,
                                gracePeriod,
                                installmentAmount,
                                installments,
                                apr,
                            );

                        await lendingPool.connect(borrower2).borrow(applicationId2);
                        let loanId2 = (await lendingPool.borrowerStats(borrower2.address)).recentLoanId;

                        await ethers.provider.send('evm_increaseTime', [loanDuration.div(installments).add(gracePeriod).add(1).toNumber()]);
                        await ethers.provider.send('evm_mine');

                        expect(await lendingPool.canDefault(loanId2, manager.address)).to.equal(true);
                        await expect(lendingPool.connect(manager).defaultLoan(loanId2)).to.be.not.reverted;
                    });

                    describe('Rejection scenarios', function () {
                        it('Defaulting a loan that is not in OUTSTANDING status should fail', async function () {
                            let paymentAmount = await lendingPool.loanBalanceDue(loanId);
                            await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount);
                            await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                            await lendingPool.connect(borrower1).repay(loanId, paymentAmount);
                            loan = await lendingPool.loans(loanId);
                            assertHardhatInvariant(loan.status === LoanStatus.REPAID);

                            expect(await lendingPool.canDefault(loanId, manager.address)).to.equal(false);
                            await expect(lendingPool.connect(manager).defaultLoan(loanId)).to.be.reverted;
                        });

                        it('Defaulting a nonexistent loan should fail', async function () {
                            expect(await lendingPool.canDefault(loanId.add(1), manager.address)).to.equal(false);
                            await expect(lendingPool.connect(manager).defaultLoan(loanId.add(1))).to.be.reverted;
                        });

                        it('Defaulting a loan as the protocol should fail', async function () {
                            expect(await lendingPool.canDefault(loanId, protocol.address)).to.equal(false);
                            await expect(lendingPool.connect(protocol).defaultLoan(loanId)).to.be.reverted;
                        });

                        it('Defaulting a loan as the governance should fail', async function () {
                            expect(await lendingPool.canDefault(loanId, governance.address)).to.equal(false);
                            await expect(lendingPool.connect(governance).defaultLoan(loanId)).to.be.reverted;
                        });

                        it('Defaulting a loan as a lender should fail', async function () {
                            expect(await lendingPool.canDefault(loanId, lender1.address)).to.equal(false);
                            await expect(lendingPool.connect(lender1).defaultLoan(loanId)).to.be.reverted;
                        });

                        it('Defaulting a loan as the borrower should fail', async function () {
                            expect(await lendingPool.canDefault(loanId, borrower1.address)).to.equal(false);
                            await expect(lendingPool.connect(borrower1).defaultLoan(loanId)).to.be.reverted;
                        });

                        it('Defaulting a loan from an unrelated address should fail', async function () {
                            expect(await lendingPool.canDefault(loanId, addresses[0].address)).to.equal(false);
                            await expect(lendingPool.connect(addresses[0]).defaultLoan(loanId)).to.be.reverted;
                        });
                    });

                    describe('Defaulting a loan on inactive manager', function () {
                        after(async function () {
                            await rollback();
                        });

                        before(async function () {
                            await snapshot();

                            let inactivityPeriod = await lendingPool.MANAGER_INACTIVITY_GRACE_PERIOD();
                            let skipTime = Math.max(inactivityPeriod, 0) + 1;

                            let depositAmount = BigNumber.from(1).mul(TOKEN_MULTIPLIER).div(2);
                            await liquidityToken.connect(deployer).mint(lender2.address, depositAmount);
                            await liquidityToken.connect(lender2).approve(lendingPool.address, depositAmount);
                            await lendingPool.connect(lender2).deposit(depositAmount);

                            await ethers.provider.send('evm_increaseTime', [skipTime]);
                            await ethers.provider.send('evm_mine');
                        });

                        it('Protocol can default', async function () {
                            expect(await lendingPool.canDefault(loanId, protocol.address)).to.equal(true);
                            await expect(lendingPool.connect(protocol).defaultLoan(loanId)).to.be.not.reverted;
                        });

                        it('Governance can default', async function () {
                            expect(await lendingPool.canDefault(loanId, governance.address)).to.equal(true);
                            await expect(lendingPool.connect(governance).defaultLoan(loanId)).to.be.not.reverted;
                        });

                        describe('Rejection scenarios', function () {
                            it("A lender without sufficient balance can't default", async function () {
                                expect(await lendingPool.canDefault(loanId, lender2.address)).to.equal(false);
                                await expect(lendingPool.connect(lender2).defaultLoan(loanId)).to.be.reverted;
                            });

                            it("Borrower can't default", async function () {
                                expect(await lendingPool.canDefault(loanId, borrower1.address)).to.equal(false);
                                await expect(lendingPool.connect(borrower1).defaultLoan(loanId)).to.be.reverted;
                            });

                            it("An unrelated address can't default", async function () {
                                expect(await lendingPool.canDefault(loanId, addresses[0].address)).to.equal(false);
                                await expect(lendingPool.connect(addresses[0]).defaultLoan(loanId)).to.be.reverted;
                            });
                        });
                    });

                    describe('Borrower Statistics', function () {
                        describe('On Full Default', function () {
                            let loan;
                            let prevStat;
                            let stat;

                            after(async function () {
                                await rollback();
                            });

                            before(async function () {
                                await snapshot();

                                prevStat = await lendingPool.borrowerStats(borrower1.address);

                                let loanId = prevStat.recentLoanId;
                                loan = await lendingPool.loans(loanId);

                                await ethers.provider.send('evm_increaseTime', [
                                    loan.duration.add(loan.gracePeriod).toNumber(),
                                ]);
                                await ethers.provider.send('evm_mine');

                                await lendingPool.connect(manager).defaultLoan(loanId);

                                stat = await lendingPool.borrowerStats(borrower1.address);
                            });

                            it('Full default increments all time default count', async function () {
                                expect(stat.countDefaulted).to.equal(prevStat.countDefaulted.add(1));
                            });

                            it('Full default decrements outstanding loan count', async function () {
                                expect(stat.countOutstanding).to.equal(prevStat.countOutstanding.sub(1));
                            });

                            it('Full default removes loan amount from borrowed amount', async function () {
                                expect(stat.amountBorrowed).to.equal(prevStat.amountBorrowed.sub(loan.amount));
                            });

                            it('Full default does not change paid base amount', async function () {
                                expect(stat.amountBaseRepaid).to.equal(prevStat.amountBaseRepaid);
                            });

                            it('Full default does not change paid interest amount', async function () {
                                expect(stat.amountInterestPaid).to.equal(prevStat.amountInterestPaid);
                            });
                        });

                        describe('On Partial Default', function () {
                            let loan;
                            let prevStat;
                            let prevLoanDetail;
                            let stat;
                            let loanDetail;

                            after(async function () {
                                await rollback();
                            });

                            before(async function () {
                                await snapshot();

                                prevStat = await lendingPool.borrowerStats(borrower1.address);

                                let loanId = prevStat.recentLoanId;
                                loan = await lendingPool.loans(loanId);

                                await ethers.provider.send('evm_increaseTime', [
                                    loan.duration.add(loan.gracePeriod).toNumber(),
                                ]);
                                await ethers.provider.send('evm_mine');

                                let paymentAmount = (await lendingPool.loanBalanceDue(loanId)).div(2);
                                await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount);
                                await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                                await lendingPool.connect(borrower1).repay(loanId, paymentAmount);

                                prevStat = await lendingPool.borrowerStats(borrower1.address);
                                prevLoanDetail = await lendingPool.loanDetails(loanId);
                                await lendingPool.connect(manager).defaultLoan(loanId);

                                stat = await lendingPool.borrowerStats(borrower1.address);
                                loanDetail = await lendingPool.loanDetails(loanId);
                            });

                            it('Partial default increments all time default count', async function () {
                                expect(stat.countDefaulted).to.equal(prevStat.countDefaulted.add(1));
                            });

                            it('Partial default removes loan amount from borrowed amount', async function () {
                                expect(stat.countOutstanding).to.equal(prevStat.countOutstanding.sub(1));
                            });

                            it('Partial default removes loan amount from borrowed amount', async function () {
                                expect(stat.amountBorrowed).to.equal(prevStat.amountBorrowed.sub(loan.amount));
                            });

                            it('Partial default removes loan base amount paid from base amount paid', async function () {
                                expect(stat.amountBaseRepaid).to.equal(
                                    prevStat.amountBaseRepaid.sub(loanDetail.principalAmountRepaid),
                                );
                            });

                            it('Partial default removes loan interest amount paid from interest amount paid', async function () {
                                expect(stat.amountInterestPaid).to.equal(
                                    prevStat.amountInterestPaid.sub(loanDetail.interestPaid),
                                );
                            });
                        });
                    });
                });
            });

            describe('Close Loan', function () {
                after(async function () {
                    await rollback();
                });

                before(async function () {
                    await snapshot();

                    let newLoanAmount = BigNumber.from(4000).mul(TOKEN_MULTIPLIER);

                    await loanDesk
                        .connect(borrower2)
                        .requestLoan(
                            newLoanAmount,
                            loanDuration,
                            'a937074e-85a7-42a9-b858-9795d9471759',
                            '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
                        );
                    let applicationId = (await loanDesk.borrowerStats(borrower2.address)).recentApplicationId;
                    let gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                    let installments = 1;
                    let apr = (await loanDesk.loanTemplate()).apr;
                    await loanDesk
                        .connect(manager)
                        .offerLoan(applicationId, newLoanAmount, loanDuration, gracePeriod, 0, installments, apr);

                    await lendingPool.connect(borrower2).borrow(applicationId);
                    let loanId = (await lendingPool.borrowerStats(borrower2.address)).recentLoanId;

                    let loan = await lendingPool.loans(loanId);
                    await ethers.provider.send('evm_increaseTime', [
                        loan.duration.add(loan.gracePeriod).add(1).toNumber(),
                    ]);
                    await ethers.provider.send('evm_mine');
                });

                it('Closing a loan with loss less than the managers revenue', async function () {
                    let loanId = (await lendingPool.borrowerStats(borrower2.address)).recentLoanId;

                    let paymentAmount = BigNumber.from(5300).mul(TOKEN_MULTIPLIER);
                    await liquidityToken.connect(deployer).mint(borrower2.address, paymentAmount);
                    await liquidityToken.connect(borrower2).approve(lendingPool.address, paymentAmount);
                    await lendingPool.connect(borrower2).repay(loanId, paymentAmount);

                    loan = await lendingPool.loans(loanId);
                    let loanDetail = await lendingPool.loanDetails(loanId);
                    let lossAmount = loan.amount.sub(loanDetail.principalAmountRepaid);

                    let poolFundsBefore = (await lendingPool.poolBalance()).poolFunds;
                    let poolLiquidityBefore = (await lendingPool.poolBalance()).poolLiquidity;
                    let stakedBalanceBefore = await lendingPool.balanceStaked();
                    let managerRevenueBefore = await lendingPool.revenueBalanceOf(manager.address);

                    await lendingPool.connect(manager).closeLoan(loanId);

                    loan = await lendingPool.loans(loanId);
                    expect(loan.status).to.equal(LoanStatus.REPAID);

                    expect(await lendingPool.revenueBalanceOf(manager.address)).to.equal(managerRevenueBefore.sub(lossAmount));
                    expect(await lendingPool.balanceStaked()).to.equal(stakedBalanceBefore);
                    expect((await lendingPool.poolBalance()).poolLiquidity).to.equal(poolLiquidityBefore.add(lossAmount));
                    expect((await lendingPool.poolBalance()).poolFunds).to.equal(poolFundsBefore);
                });

                it('Closing a loan with loss more than the managers revenue but coverable with stake', async function () {
                    let loanId = (await lendingPool.borrowerStats(borrower2.address)).recentLoanId;

                    let paymentAmount = BigNumber.from(5200).mul(TOKEN_MULTIPLIER);
                    await liquidityToken.connect(deployer).mint(borrower2.address, paymentAmount);
                    await liquidityToken.connect(borrower2).approve(lendingPool.address, paymentAmount);
                    await lendingPool.connect(borrower2).repay(loanId, paymentAmount);

                    loan = await lendingPool.loans(loanId);
                    let loanDetail = await lendingPool.loanDetails(loanId);
                    let lossAmount = loan.amount.sub(loanDetail.principalAmountRepaid);

                    let poolFundsBefore = (await lendingPool.poolBalance()).poolFunds;
                    let poolLiquidityBefore = (await lendingPool.poolBalance()).poolLiquidity;
                    let stakedBalanceBefore = await lendingPool.balanceStaked();
                    let managerRevenueBefore = await lendingPool.revenueBalanceOf(manager.address);

                    await lendingPool.connect(manager).closeLoan(loanId);

                    loan = await lendingPool.loans(loanId);
                    expect(loan.status).to.equal(LoanStatus.REPAID);

                    console.log ();

                    expect(await lendingPool.revenueBalanceOf(manager.address)).to.equal(0);
                    expect(await lendingPool.balanceStaked() - stakedBalanceBefore.sub(lossAmount.sub(managerRevenueBefore)))
                        .to.lt(BigNumber.from(20).mul(TOKEN_MULTIPLIER)); //allow inconsistency due to double conversion using integer math
                    expect((await lendingPool.poolBalance()).poolLiquidity).to.equal(poolLiquidityBefore.add(lossAmount));
                    expect((await lendingPool.poolBalance()).poolFunds).to.equal(poolFundsBefore);
                });

                it('Closing a loan with loss more than the managers revenue and stake', async function () {
                    let loanId = (await lendingPool.borrowerStats(borrower2.address)).recentLoanId;

                    let paymentAmount = BigNumber.from(3000).mul(TOKEN_MULTIPLIER);
                    await liquidityToken.connect(deployer).mint(borrower2.address, paymentAmount);
                    await liquidityToken.connect(borrower2).approve(lendingPool.address, paymentAmount);
                    await lendingPool.connect(borrower2).repay(loanId, paymentAmount);

                    loan = await lendingPool.loans(loanId);
                    let loanDetail = await lendingPool.loanDetails(loanId);
                    let lossAmount = loan.amount.sub(loanDetail.principalAmountRepaid);

                    let poolFundsBefore = (await lendingPool.poolBalance()).poolFunds;
                    let poolLiquidityBefore = (await lendingPool.poolBalance()).poolLiquidity;
                    let stakedBalanceBefore = await lendingPool.balanceStaked();
                    let managerRevenueBefore = await lendingPool.revenueBalanceOf(manager.address);

                    await lendingPool.connect(manager).closeLoan(loanId);

                    loan = await lendingPool.loans(loanId);
                    expect(loan.status).to.equal(LoanStatus.REPAID);

                    expect(await lendingPool.revenueBalanceOf(manager.address)).to.equal(0);
                    expect(await lendingPool.balanceStaked()).to.equal(0);
                    expect((await lendingPool.poolBalance()).poolLiquidity).to.equal(poolLiquidityBefore.add(managerRevenueBefore.add(stakedBalanceBefore)));
                    expect((await lendingPool.poolBalance()).poolFunds).to.equal(poolFundsBefore.sub(lossAmount.sub(managerRevenueBefore.add(stakedBalanceBefore))));
                });

                describe('Rejection scenarios', function () {
                    it('Closing a loan that is not in OUTSTANDING status should fail', async function () {
                        let paymentAmount = await lendingPool.loanBalanceDue(loanId);
                        await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount);
                        await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                        await lendingPool.connect(borrower1).repay(loanId, paymentAmount);
                        loan = await lendingPool.loans(loanId);
                        assertHardhatInvariant(loan.status === LoanStatus.REPAID);

                        await expect(lendingPool.connect(manager).closeLoan(loanId)).to.be.reverted;
                    });

                    it('Closing a nonexistent loan should fail', async function () {
                        await expect(lendingPool.connect(manager).closeLoan(loanId.add(10))).to.be.reverted;
                    });

                    it('Closing a loan as the protocol should fail', async function () {
                        await expect(lendingPool.connect(protocol).closeLoan(loanId)).to.be.reverted;
                    });

                    it('Closing a loan as the governance should fail', async function () {
                        await expect(lendingPool.connect(governance).closeLoan(loanId)).to.be.reverted;
                    });

                    it('Closing a loan as a lender should fail', async function () {
                        await expect(lendingPool.connect(lender1).closeLoan(loanId)).to.be.reverted;
                    });

                    it('Closing a loan as the borrower should fail', async function () {
                        await expect(lendingPool.connect(borrower1).closeLoan(loanId)).to.be.reverted;
                    });

                    it('Closing a loan from an unrelated address should fail', async function () {
                        await expect(lendingPool.connect(addresses[0]).closeLoan(loanId)).to.be.reverted;
                    });
                });

                describe('Borrower Statistics', function () {
                    describe('On Loan Close', function () {
                        let loan;
                        let prevStat;
                        let prevLoanDetail;
                        let stat;
                        let loanDetail;

                        after(async function () {
                            await rollback();
                        });

                        before(async function () {
                            await snapshot();

                            prevStat = await lendingPool.borrowerStats(borrower1.address);

                            let loanId = prevStat.recentLoanId;
                            loan = await lendingPool.loans(loanId);

                            await ethers.provider.send('evm_increaseTime', [
                                loan.duration.add(loan.gracePeriod).toNumber(),
                            ]);
                            await ethers.provider.send('evm_mine');

                            let paymentAmount = (await lendingPool.loanBalanceDue(loanId)).div(2);
                            await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount);
                            await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                            await lendingPool.connect(borrower1).repay(loanId, paymentAmount);

                            prevStat = await lendingPool.borrowerStats(borrower1.address);
                            prevLoanDetail = await lendingPool.loanDetails(loanId);
                            await lendingPool.connect(manager).defaultLoan(loanId);

                            stat = await lendingPool.borrowerStats(borrower1.address);
                            loanDetail = await lendingPool.loanDetails(loanId);
                        });

                        it('Closing a loan increments all time repaid count', async function () {
                            expect(stat.countDefaulted).to.equal(prevStat.countRepaid.add(1));
                        });

                        it('Closing a loan removes loan amount from borrowed amount', async function () {
                            expect(stat.countOutstanding).to.equal(prevStat.countOutstanding.sub(1));
                        });

                        it('Closing a loan removes loan amount from borrowed amount', async function () {
                            expect(stat.amountBorrowed).to.equal(prevStat.amountBorrowed.sub(loan.amount));
                        });

                        it('Closing a loan removes loan base amount paid from base amount paid', async function () {
                            expect(stat.amountBaseRepaid).to.equal(
                                prevStat.amountBaseRepaid.sub(loanDetail.principalAmountRepaid),
                            );
                        });

                        it('Closing a loan removes loan interest amount paid from interest amount paid', async function () {
                            expect(stat.amountInterestPaid).to.equal(
                                prevStat.amountInterestPaid.sub(loanDetail.interestPaid),
                            );
                        });
                    });
                });
            });
        });
    });
});
