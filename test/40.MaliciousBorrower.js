const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { ethers, upgrades } = require('hardhat');
const { TOKEN_DECIMALS, TOKEN_MULTIPLIER, NIL_UUID, NIL_DIGEST } = require('./utils/constants');
const { POOL_1_LENDER_GOVERNANCE_ROLE, initAccessControl } = require('./utils/roles');
const { mintAndApprove } = require('./utils/helpers');
const { rollback, snapshot, skipEvmTime } = require('./utils/evmControl');

let evmSnapshotIds = [];

describe('Attack Sapling Lending Pool', function () {
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
            protocol.address,
            staker.address,
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
            let poolToken2 = await (
                await ethers.getContractFactory('PoolToken')
            ).deploy('Sapling Test Lending Pool Token', 'SLPT', TOKEN_DECIMALS);

            await expect(
                upgrades.deployProxy(SaplingLendingPoolCF, [
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
            let initialBalance = BigNumber.from(1e12).mul(TOKEN_MULTIPLIER);
            await liquidityToken.connect(deployer).mint(borrower1.address, initialBalance);
        });

        describe('Malicious Borrower', function () {
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
                await loanDesk.connect(staker).lockDraftOffer(applicationId);
                await skipEvmTime(2 * 24 * 60 * 60 + 1);
                await loanDesk.connect(staker).offerLoan(applicationId);
            });

            it('Revert If Borrow Twice Same Block', async function () {
                //get initial loans count to check only 1 loan object was created
                let prevLoansCount = await loanDesk.loansCount();

                let balanceBefore = await liquidityToken.balanceOf(borrower1.address);
                //turn of automining before write tx to keep the block open for the next call
                await ethers.provider.send('evm_setAutomine', [false]);
                await loanDesk.connect(borrower1).borrow(applicationId);
                let loanId = 1; //predict ID, automine is off

                //tun automining back on to prevent deadlock as expect() will hang until block is finalized
                await ethers.provider.send('evm_setAutomine', [true]);
                await expect(loanDesk.connect(borrower1).borrow(applicationId)).to.be.reverted;

                // check that only 1 new loan object was created
                expect(await loanDesk.loansCount()).to.equal(prevLoansCount.add(1));

                //get the loan after the block is mined, as the committed block
                let loan = await loanDesk.loans(loanId);

                expect(await liquidityToken.balanceOf(borrower1.address)).to.equal(balanceBefore.add(loan.amount));
            });

            it('Revert If Borrow Twice Slow', async function () {
                let balanceBefore = await liquidityToken.balanceOf(borrower1.address);
                let tx = await loanDesk.connect(borrower1).borrow(applicationId);
                let loanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0].args.loanId;
                let loan = await loanDesk.loans(loanId);
                await skipEvmTime(loan.duration.toNumber());
                await expect(loanDesk.connect(borrower1).borrow(applicationId)).to.be.reverted;
                expect(await liquidityToken.balanceOf(borrower1.address)).to.equal(balanceBefore.add(loan.amount));
            });

            it('Revert If Borrow Repay Borrow', async function () {
                let tx = await loanDesk.connect(borrower1).borrow(applicationId);
                let loanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0].args.loanId;
                let paymentAmount = await loanDesk.loanBalanceDue(loanId);
                await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                await loanDesk.connect(borrower1).repay(loanId, paymentAmount);
                await expect(loanDesk.connect(borrower1).borrow(applicationId)).to.be.reverted;
            });

            it('Revert If Borrow Repay Half Borrow', async function () {
                let tx = await loanDesk.connect(borrower1).borrow(applicationId);
                let loanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0].args.loanId;
                let paymentAmount = (await loanDesk.loanBalanceDue(loanId)).div(2);
                await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                await loanDesk.connect(borrower1).repay(loanId, paymentAmount);
                await expect(loanDesk.connect(borrower1).borrow(applicationId)).to.be.reverted;
            });

            it('Revert If Request Loan Twice', async function () {
                gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                installments = 1;
                apr = (await loanDesk.loanTemplate()).apr;
                let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
                let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);
                await expect(loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST)).to
                    .be.reverted;
            });

            it('Check Repayment Math', async function () {
                const quickFuzz = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 249];

                let tx = await loanDesk.connect(borrower1).borrow(applicationId);
                let loanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0].args.loanId;

                await skipEvmTime(60);

                let balanceSimulated = await loanDesk.loanBalanceDue(loanId);

                for (let i = 0; i < quickFuzz.length; i++) {
                    const multiAmount = BigNumber.from(quickFuzz[i]).mul(TOKEN_MULTIPLIER);
                    await liquidityToken.connect(borrower1).approve(lendingPool.address, multiAmount);
                    await loanDesk.connect(borrower1).repay(loanId, multiAmount);
                    let balanceOutstanding = await loanDesk.loanBalanceDue(loanId);
                    balanceSimulated = balanceSimulated.sub(multiAmount);
                    expect(balanceOutstanding).to.equal(balanceSimulated);
                }
            });
        });
    });
});
