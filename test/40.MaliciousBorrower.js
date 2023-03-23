const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { ethers, upgrades } = require('hardhat');
const { TOKEN_DECIMALS, TOKEN_MULTIPLIER, NIL_UUID, NIL_DIGEST } = require('./utils/constants');
const { mintAndApprove } = require('./utils/helpers');
const { rollback, snapshot, skipEvmTime } = require('./utils/evmControl');
const { deployEnv, deployProtocol } = require('./utils/deployer');

let evmSnapshotIds = [];

describe('Attack Sapling Lending Pool', function () {
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
            PERCENT_DECIMALS = await saplingMath.PERCENT_DECIMALS();
            ONE_HUNDRED_PERCENT = await saplingMath.HUNDRED_PERCENT();
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
            let initialBalance = BigNumber.from(1e12).mul(TOKEN_MULTIPLIER);
            await e.assetToken.connect(e.deployer).mint(borrower1.address, initialBalance);
        });

        describe('Malicious Borrower', function () {
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
                await p.loanDesk.connect(e.staker).lockDraftOffer(applicationId);
                await skipEvmTime(2 * 24 * 60 * 60 + 1);
                await p.loanDesk.connect(e.staker).offerLoan(applicationId);
            });

            it('Revert If Borrow Twice Same Block', async function () {
                //get initial loans count to check only 1 loan object was created
                let prevLoansCount = await p.loanDesk.loansCount();

                let balanceBefore = await e.assetToken.balanceOf(borrower1.address);
                //turn of automining before write tx to keep the block open for the next call
                await ethers.provider.send('evm_setAutomine', [false]);
                await p.loanDesk.connect(borrower1).borrow(applicationId);
                let loanId = 1; //predict ID, automine is off

                //tun automining back on to prevent deadlock as expect() will hang until block is finalized
                await ethers.provider.send('evm_setAutomine', [true]);
                await expect(p.loanDesk.connect(borrower1).borrow(applicationId)).to.be.revertedWith(
                    'LoanDesk: invalid status',
                );

                // check that only 1 new loan object was created
                expect(await p.loanDesk.loansCount()).to.equal(prevLoansCount.add(1));

                //get the loan after the block is mined, as the committed block
                let loan = await p.loanDesk.loans(loanId);

                expect(await e.assetToken.balanceOf(borrower1.address)).to.equal(balanceBefore.add(loan.amount));
            });

            it('Revert If Borrow Twice Slow', async function () {
                let balanceBefore = await e.assetToken.balanceOf(borrower1.address);
                let tx = await p.loanDesk.connect(borrower1).borrow(applicationId);
                let loanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0].args.loanId;
                let loan = await p.loanDesk.loans(loanId);
                await skipEvmTime(loan.duration.toNumber());
                await expect(p.loanDesk.connect(borrower1).borrow(applicationId)).to.be.revertedWith(
                    'LoanDesk: invalid status',
                );
                expect(await e.assetToken.balanceOf(borrower1.address)).to.equal(balanceBefore.add(loan.amount));
            });

            it('Revert If Borrow Repay Borrow', async function () {
                let tx = await p.loanDesk.connect(borrower1).borrow(applicationId);
                let loanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0].args.loanId;
                let paymentAmount = await p.loanDesk.loanBalanceDue(loanId);
                await e.assetToken.connect(borrower1).approve(p.pool.address, paymentAmount);
                await p.loanDesk.connect(borrower1).repay(loanId, paymentAmount);
                await expect(p.loanDesk.connect(borrower1).borrow(applicationId)).to.be.revertedWith(
                    'LoanDesk: invalid status',
                );
            });

            it('Revert If Borrow Repay Half Borrow', async function () {
                let tx = await p.loanDesk.connect(borrower1).borrow(applicationId);
                let loanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0].args.loanId;
                let paymentAmount = (await p.loanDesk.loanBalanceDue(loanId)).div(2);
                await e.assetToken.connect(borrower1).approve(p.pool.address, paymentAmount);
                await p.loanDesk.connect(borrower1).repay(loanId, paymentAmount);
                await expect(p.loanDesk.connect(borrower1).borrow(applicationId)).to.be.revertedWith(
                    'LoanDesk: invalid status',
                );
            });

            it('Revert If Request Loan Twice', async function () {
                gracePeriod = (await p.loanDesk.loanTemplate()).gracePeriod;
                installments = 1;
                apr = (await p.loanDesk.loanTemplate()).apr;
                let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
                let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);
                await expect(
                    p.loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST),
                ).to.be.revertedWith('LoanDesk: another loan application is pending');
            });

            it('Check Repayment Math', async function () {
                const quickFuzz = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 249];

                let tx = await p.loanDesk.connect(borrower1).borrow(applicationId);
                let loanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0].args.loanId;

                await skipEvmTime(60);

                let balanceSimulated = await p.loanDesk.loanBalanceDue(loanId);

                for (let i = 0; i < quickFuzz.length; i++) {
                    const multiAmount = BigNumber.from(quickFuzz[i]).mul(TOKEN_MULTIPLIER);
                    await e.assetToken.connect(borrower1).approve(p.pool.address, multiAmount);
                    await p.loanDesk.connect(borrower1).repay(loanId, multiAmount);
                    let balanceOutstanding = await p.loanDesk.loanBalanceDue(loanId);
                    balanceSimulated = balanceSimulated.sub(multiAmount);
                    expect(balanceOutstanding).to.equal(balanceSimulated);
                }
            });
        });
    });
});
