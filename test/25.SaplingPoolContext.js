const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { ethers, upgrades } = require('hardhat');
const { assertHardhatInvariant } = require('hardhat/internal/core/errors');
const { NULL_ADDRESS, TOKEN_DECIMALS, TOKEN_MULTIPLIER, NIL_UUID, NIL_DIGEST } = require('./utils/constants');
const { mintAndApprove } = require('./utils/helpers');
const { snapshot, rollback, skipEvmTime } = require('./utils/evmControl');
const { deployEnv, deployProtocol } = require('./utils/deployer');

let evmSnapshotIds = [];

describe('Sapling Pool Context (via SaplingLendingPool)', function () {
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

        describe('Rejection Scenarios', function () {
            it('Deploying with null liquidity token address should fail', async function () {
                let poolToken2 = await (
                    await ethers.getContractFactory('PoolToken')
                ).deploy('Sapling Test Lending Pool Token', 'SLPT', TOKEN_DECIMALS);

                await expect(
                    upgrades.deployProxy(await ethers.getContractFactory('SaplingLendingPool'), [
                        poolToken2.address,
                        NULL_ADDRESS,
                        p.accessControl.address,
                        e.treasury.address,
                        e.staker.address,
                    ]),
                ).to.be.reverted;
            });

            it('Deploying with null pool token address should fail', async function () {
                await expect(
                    upgrades.deployProxy(await ethers.getContractFactory('SaplingLendingPool'), [
                        NULL_ADDRESS,
                        e.assetToken.address,
                        p.accessControl.address,
                        e.treasury.address,
                        e.staker.address,
                    ]),
                ).to.be.reverted;
            });

            it('Deploying with a pool token with non-zero total supply should fail', async function () {
                let badPoolToken = await (
                    await ethers.getContractFactory('PoolToken')
                ).deploy('Sapling Test Lending Pool Token', 'SLPT', TOKEN_DECIMALS);

                await badPoolToken.connect(e.deployer).mint(e.users[0].address, 1);

                await expect(
                    upgrades.deployProxy(await ethers.getContractFactory('SaplingLendingPool'), [
                        badPoolToken.address,
                        e.assetToken.address,
                        p.accessControl.address,
                        e.treasury.address,
                        e.staker.address,
                    ]),
                ).to.be.reverted;
            });
        });
    });

    describe('Initial mint', function () {
        it('Staker can do initial mint on pool', async function () {
            await mintAndApprove(e.assetToken, e.deployer, e.staker, p.pool.address, 10 ** TOKEN_DECIMALS);
            await expect(p.pool.connect(e.staker).initialMint()).to.be.not.reverted;
        });

        describe('Rejection Scenarios', function () {
            it('Cannot initial mint twice', async function () {
                await mintAndApprove(e.assetToken, e.deployer, e.staker, p.pool.address, 10 ** TOKEN_DECIMALS);
                p.pool.connect(e.staker).initialMint();

                await mintAndApprove(e.assetToken, e.deployer, e.staker, p.pool.address, 10 ** TOKEN_DECIMALS);
                await expect(p.pool.connect(e.staker).initialMint()).to.be.reverted;
            });
        });
    });

    describe('Use Cases', function () {
        let PERCENT_DECIMALS;
        let ONE_HUNDRED_PERCENT;
        let exitFeePercent;

        let lender1;
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
            borrower1 = e.users[2];
            borrower2 = e.users[3];

            stakeAmount = BigNumber.from(2000).mul(TOKEN_MULTIPLIER);
            unstakeAmount = BigNumber.from(500).mul(TOKEN_MULTIPLIER);
            depositAmount = BigNumber.from(9000).mul(TOKEN_MULTIPLIER);
            withdrawAmount = BigNumber.from(3000).mul(TOKEN_MULTIPLIER);
            loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
            loanDuration = BigNumber.from(365).mul(24 * 60 * 60);

            await mintAndApprove(e.assetToken, e.deployer, e.staker, p.pool.address, 10 ** TOKEN_DECIMALS);
            await p.pool.connect(e.staker).initialMint();

            await p.pool.connect(e.staker).open();
            await p.loanDesk.connect(e.staker).open();

            await mintAndApprove(e.assetToken, e.deployer, e.staker, p.pool.address, stakeAmount);
            await mintAndApprove(e.assetToken, e.deployer, lender1, p.pool.address, depositAmount);
        });

        describe('Initial State', function () {
            it('Liquidity token address is correct', async function () {
                expect((await p.pool.tokenConfig()).liquidityToken).to.equal(e.assetToken.address);
            });

            it('Pool token address is correct', async function () {
                expect((await p.pool.tokenConfig()).poolToken).to.equal(p.poolToken.address);
            });

            it('Token decimals is correct', async function () {
                expect((await p.pool.tokenConfig()).decimals).to.equal(TOKEN_DECIMALS);
            });

            it('Target stake percent is correct', async function () {
                let minValue = 0 * 10 ** PERCENT_DECIMALS;
                let maxValue = 100 * 10 ** PERCENT_DECIMALS;
                let defaultValue = 10 * 10 ** PERCENT_DECIMALS;

                expect(ONE_HUNDRED_PERCENT).to.equal(maxValue);
                expect((await p.pool.config()).targetStakePercent)
                    .to.equal(defaultValue)
                    .and.gte(minValue)
                    .and.lte(maxValue);
            });

            it('Target liquidity percent is correct', async function () {
                let minValue = 0 * 10 ** PERCENT_DECIMALS;
                let maxValue = 100 * 10 ** PERCENT_DECIMALS;
                let defaultValue = 0 * 10 ** PERCENT_DECIMALS;

                expect(ONE_HUNDRED_PERCENT).to.equal(maxValue);
                expect((await p.pool.config()).targetLiquidityPercent)
                    .to.equal(defaultValue)
                    .and.gte(minValue)
                    .and.lte(maxValue);
            });

            it('Protocol fee percent is correct', async function () {
                let minValue = 0 * 10 ** PERCENT_DECIMALS;
                let maxValue = 50 * 10 ** PERCENT_DECIMALS;
                let defaultValue = 20 * 10 ** PERCENT_DECIMALS;

                expect(await saplingMath.MAX_PROTOCOL_FEE_PERCENT()).to.equal(maxValue);
                expect((await p.pool.config()).protocolFeePercent)
                    .to.equal(defaultValue)
                    .and.gte(minValue)
                    .and.lte(maxValue);
            });

            it("Staker's earn factor is correct", async function () {
                let minValue = 100 * 10 ** PERCENT_DECIMALS;
                let maxValue = 1000 * 10 ** PERCENT_DECIMALS;
                let defaultValue = 150 * 10 ** PERCENT_DECIMALS;

                expect((await p.pool.config()).stakerEarnFactorMax).to.equal(maxValue);
                expect((await p.pool.config()).stakerEarnFactor)
                    .to.equal(defaultValue)
                    .and.gte(minValue)
                    .and.lte(maxValue);
            });

            it('Exit fee is correct', async function () {
                expect(exitFeePercent).to.equal(0.5 * 10 ** PERCENT_DECIMALS);
            });

            it('Empty pool APY is correct', async function () {
                let apyBreakdown = await p.pool.currentAPY();
                expect(apyBreakdown.totalPoolAPY).to.equal(0);
                expect(apyBreakdown.protocolRevenueComponent).to.equal(0);
                expect(apyBreakdown.stakerEarningsComponent).to.equal(0);
                expect(apyBreakdown.lenderComponent).to.equal(0);
            });

            it('Initial balances are correct', async function () {
                expect(await p.poolToken.balanceOf(p.accessControl.address)).to.equal(10 ** TOKEN_DECIMALS);
                expect((await p.pool.balances()).stakedShares).to.equal(0);
                expect(await p.pool.poolFundsLimit()).to.equal(0);
                expect(await p.pool.poolFunds()).to.equal(10 ** TOKEN_DECIMALS);
                expect(await e.assetToken.balanceOf(p.pool.address)).to.equal(10 ** TOKEN_DECIMALS);
            });
        });

        describe('Setting pool parameters', function () {
            describe('Target stake percent', function () {
                it('Governance can set target stake percent', async function () {
                    let currentValue = (await p.pool.config()).targetStakePercent;
                    let maxValue = await saplingMath.HUNDRED_PERCENT();

                    let newValue = 50 * 10 ** PERCENT_DECIMALS;
                    assertHardhatInvariant(newValue != currentValue && newValue <= maxValue);

                    await p.pool.connect(e.governance).setTargetStakePercent(newValue);
                    expect((await p.pool.config()).targetStakePercent).to.equal(newValue);
                });

                describe('Rejection scenarios', function () {
                    it('Target stake percent cannot be set to a value greater than the allowed maximum', async function () {
                        let currentValue = (await p.pool.config()).targetStakePercent;
                        let maxValue = await saplingMath.HUNDRED_PERCENT();

                        await expect(p.pool.connect(e.governance).setTargetStakePercent(maxValue + 1)).to.be.reverted;
                    });

                    it('A non-governance cannot set target stake percent', async function () {
                        let currentValue = (await p.pool.config()).targetStakePercent;
                        let maxValue = await saplingMath.HUNDRED_PERCENT();

                        let newValue = 50 * 10 ** PERCENT_DECIMALS;
                        assertHardhatInvariant(newValue != currentValue && newValue <= maxValue);

                        await expect(p.pool.connect(e.staker).setTargetStakePercent(newValue)).to.be.reverted;
                    });
                });
            });

            describe('Target liquidity percent', function () {
                it('Staker can set target liquidity percent', async function () {
                    let currentValue = (await p.pool.config()).targetLiquidityPercent;
                    let maxValue = await saplingMath.HUNDRED_PERCENT();

                    let newValue = 50 * 10 ** PERCENT_DECIMALS;
                    assertHardhatInvariant(newValue != currentValue && newValue <= maxValue);

                    await p.pool.connect(e.staker).setTargetLiquidityPercent(newValue);
                    expect((await p.pool.config()).targetLiquidityPercent).to.equal(newValue);
                });

                describe('Rejection scenarios', function () {
                    it('Target liquidity percent cannot be set to a value greater than the allowed maximum', async function () {
                        let currentValue = (await p.pool.config()).targetLiquidityPercent;
                        let maxValue = await saplingMath.HUNDRED_PERCENT();

                        await expect(p.pool.connect(e.staker).setTargetLiquidityPercent(maxValue + 1)).to.be.reverted;
                    });

                    it('A non-staker cannot set target liquidity percent', async function () {
                        let currentValue = (await p.pool.config()).targetLiquidityPercent;
                        let maxValue = await saplingMath.HUNDRED_PERCENT();

                        let newValue = 50 * 10 ** PERCENT_DECIMALS;
                        assertHardhatInvariant(newValue != currentValue && newValue <= maxValue);

                        await expect(p.pool.connect(e.governance).setTargetLiquidityPercent(newValue)).to.be.reverted;
                    });
                });
            });

            describe('Protocol fee percent', function () {
                it('Governance can set protocol fee percent', async function () {
                    let currentValue = (await p.pool.config()).protocolFeePercent;
                    let maxValue = await saplingMath.MAX_PROTOCOL_FEE_PERCENT();

                    let newValue = 2 * 10 ** PERCENT_DECIMALS;
                    assertHardhatInvariant(newValue != currentValue && newValue <= maxValue);

                    await p.pool.connect(e.governance).setProtocolEarningPercent(newValue);
                    expect((await p.pool.config()).protocolFeePercent).to.equal(newValue);
                });

                describe('Rejection scenarios', function () {
                    it('Protocol fee percent cannot be set to a value greater than the allowed maximum', async function () {
                        let currentValue = (await p.pool.config()).protocolFeePercent;
                        let maxValue = await saplingMath.MAX_PROTOCOL_FEE_PERCENT();

                        await expect(p.pool.connect(e.governance).setProtocolEarningPercent(maxValue + 1)).to.be
                            .reverted;
                    });

                    it('A non-governance cannot set protocol fee percent', async function () {
                        let currentValue = (await p.pool.config()).protocolFeePercent;
                        let maxValue = await saplingMath.MAX_PROTOCOL_FEE_PERCENT();

                        let newValue = 2 * 10 ** PERCENT_DECIMALS;
                        assertHardhatInvariant(newValue != currentValue && newValue <= maxValue);

                        await expect(p.pool.connect(e.staker).setProtocolEarningPercent(newValue)).to.be.reverted;
                    });
                });
            });

            describe("Staker's earn factor", function () {
                it("Staker can set staker's earn factor", async function () {
                    let currentValue = (await p.pool.config()).stakerEarnFactor;
                    let minValue = await saplingMath.HUNDRED_PERCENT();
                    let maxValue = (await p.pool.config()).stakerEarnFactorMax;

                    let newValue = 125 * 10 ** PERCENT_DECIMALS;
                    assertHardhatInvariant(newValue != currentValue && minValue <= newValue && newValue <= maxValue);

                    await p.pool.connect(e.staker).setStakerEarnFactor(newValue);
                    expect((await p.pool.config()).stakerEarnFactor).to.equal(newValue);
                });

                it("Staker's earn factor can be set while the pool is paused", async function () {
                    let currentValue = (await p.pool.config()).stakerEarnFactor;
                    let minValue = await saplingMath.HUNDRED_PERCENT();
                    let maxValue = (await p.pool.config()).stakerEarnFactorMax;

                    let newValue = 125 * 10 ** PERCENT_DECIMALS;
                    assertHardhatInvariant(newValue != currentValue && minValue <= newValue && newValue <= maxValue);

                    await p.pool.connect(e.governance).pause();

                    await expect(p.pool.connect(e.staker).setStakerEarnFactor(newValue)).to.be.not.reverted;
                });

                describe('Rejection scenarios', function () {
                    it("Staker's earn factor cannot be set to a value less than the allowed minimum", async function () {
                        let minValue = await saplingMath.HUNDRED_PERCENT();
                        assertHardhatInvariant(minValue > 0);
                        await expect(p.pool.connect(e.staker).setStakerEarnFactor(minValue - 1)).to.be.reverted;
                    });

                    it("Staker's earn factor cannot be set to a value greater than the allowed maximum", async function () {
                        let maxValue = (await p.pool.config()).stakerEarnFactorMax;
                        await expect(p.pool.connect(e.staker).setStakerEarnFactor(maxValue + 1)).to.be.reverted;
                    });

                    it("A non-staker cannot set staker's earn factor", async function () {
                        let currentValue = (await p.pool.config()).stakerEarnFactor;
                        let minValue = await saplingMath.HUNDRED_PERCENT();
                        let maxValue = (await p.pool.config()).stakerEarnFactorMax;

                        let newValue = 125 * 10 ** PERCENT_DECIMALS;
                        assertHardhatInvariant(
                            newValue != currentValue && minValue <= newValue && newValue <= maxValue,
                        );

                        await expect(p.pool.connect(e.governance).setStakerEarnFactor(newValue)).to.be.reverted;
                    });
                });
            });

            describe("Maximum for Staker's earn factor", function () {
                it("Governance can set a maximum for staker's earn factor", async function () {
                    let currentValue = (await p.pool.config()).stakerEarnFactorMax;
                    let minValue = await saplingMath.HUNDRED_PERCENT();

                    let newValue = currentValue - 1;
                    assertHardhatInvariant(currentValue >= minValue);

                    await p.pool.connect(e.governance).setStakerEarnFactorMax(newValue);
                    expect((await p.pool.config()).stakerEarnFactorMax).to.equal(newValue);
                });

                it("Setting the maximum for staker's earn factor to less than current earn factor value will update the current earn factor", async function () {
                    let prevEarnFactor = (await p.pool.config()).stakerEarnFactor;
                    let currentValue = (await p.pool.config()).stakerEarnFactorMax;
                    let minValue = await saplingMath.HUNDRED_PERCENT();

                    let newValue = prevEarnFactor - 1;
                    assertHardhatInvariant(currentValue >= minValue);

                    await p.pool.connect(e.governance).setStakerEarnFactorMax(newValue);
                    expect((await p.pool.config()).stakerEarnFactorMax).to.equal(newValue);
                    expect((await p.pool.config()).stakerEarnFactor).to.equal(newValue);
                });

                describe('Rejection scenarios', function () {
                    it("Maximum for Staker's earn factor cannot be set to a value less than the allowed minimum", async function () {
                        let minValue = await saplingMath.HUNDRED_PERCENT();
                        assertHardhatInvariant(minValue > 0);
                        await expect(p.pool.connect(e.governance).setStakerEarnFactorMax(minValue - 1)).to.be.reverted;
                    });

                    it("A non-governance cannot set a maximum for staker's earn factor", async function () {
                        let currentValue = (await p.pool.config()).stakerEarnFactorMax;
                        let minValue = await saplingMath.HUNDRED_PERCENT();
                        let maxValue = (await p.pool.config()).stakerEarnFactorMax;

                        let newValue = 125 * 10 ** PERCENT_DECIMALS;
                        assertHardhatInvariant(
                            newValue != currentValue && minValue <= newValue && newValue <= maxValue,
                        );

                        await expect(p.pool.connect(e.staker).setStakerEarnFactorMax(newValue)).to.be.reverted;
                    });
                });
            });
        });

        describe('Close Pool', function () {
            it('Staker can close the pool', async function () {
                await p.pool.connect(e.staker).close();
                expect(await p.pool.closed()).to.equal(true);
            });

            describe('Rejection scenarios', function () {
                it('Closing the pool with a non-zero borrowed amount should fail', async function () {
                    let stakeAmount = BigNumber.from(2000).mul(TOKEN_MULTIPLIER);
                    let depositAmount = BigNumber.from(10000).mul(TOKEN_MULTIPLIER);

                    await mintAndApprove(e.assetToken, e.deployer, e.staker, p.pool.address, stakeAmount);
                    await p.pool.connect(e.staker).stake(stakeAmount);

                    await mintAndApprove(e.assetToken, e.deployer, lender1, p.pool.address, depositAmount);
                    await p.pool.connect(lender1).deposit(depositAmount);

                    let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
                    let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);
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

        describe('Staking', function () {
            after(async function () {
                await rollback(evmSnapshotIds);
            });

            before(async function () {
                await snapshot(evmSnapshotIds);

                await mintAndApprove(e.assetToken, e.deployer, e.staker, p.pool.address, stakeAmount);
            });

            it('Staker can stake', async function () {
                await expect(p.pool.connect(e.staker).stake(stakeAmount)).to.changeTokenBalances(
                    e.assetToken,
                    [e.staker.address, p.pool.address],
                    [-stakeAmount, stakeAmount],
                );
                expect(await p.pool.balanceStaked()).to.equal(stakeAmount);
            });

            it('Stake is reflected on pool liquidity', async function () {
                let prevLiquidity = await e.assetToken.balanceOf(p.pool.address);
                await p.pool.connect(e.staker).stake(stakeAmount);
                let liquidity = await e.assetToken.balanceOf(p.pool.address);

                expect(liquidity).to.equal(prevLiquidity.add(stakeAmount));
            });

            it('Stake is reflected on pool funds', async function () {
                let prevPoolFunds = await p.pool.poolFunds();
                await p.pool.connect(e.staker).stake(stakeAmount);
                let poolFunds = await p.pool.poolFunds();

                expect(poolFunds).to.equal(prevPoolFunds.add(stakeAmount));
            });

            it('Stake adjusts pool funds limit', async function () {
                let targetStakePercent = (await p.pool.config()).targetStakePercent;
                let oneHundredPercent = await saplingMath.HUNDRED_PERCENT();

                await p.pool.connect(e.staker).stake(stakeAmount);
                let limit = await p.pool.poolFundsLimit();

                expect(limit).to.equal(stakeAmount.mul(oneHundredPercent / targetStakePercent));
            });

            it('Staker cannot stake on a failed pool', async function () {
                await p.pool.connect(e.staker).stake(stakeAmount);

                let depositAmount = BigNumber.from(10000).mul(TOKEN_MULTIPLIER);
                await mintAndApprove(e.assetToken, e.deployer, lender1, p.pool.address, depositAmount);
                await p.pool.connect(lender1).deposit(depositAmount);

                let loanAmount = await p.pool.poolFunds();
                let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);

                let requestLoanTx = await p.loanDesk
                    .connect(borrower1)
                    .requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
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

                let loanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0].args.loanId;

                let loan = await p.loanDesk.loans(loanId);
                await skipEvmTime(loan.duration.add(loan.gracePeriod).toNumber());

                await p.loanDesk.connect(e.staker).defaultLoan(loanId);

                assertHardhatInvariant((await p.pool.balanceStaked()).eq(0));
                assertHardhatInvariant((await p.pool.poolFunds()).eq(0));

                await mintAndApprove(e.assetToken, e.deployer, e.staker, p.pool.address, stakeAmount);
                await expect(p.pool.connect(e.staker).stake(stakeAmount)).to.be.revertedWith(
                    'SaplingPoolContext: share price too low',
                );
            });

            describe('Rejection scenarios', function () {
                it('Staking a zero amount should fail', async function () {
                    await expect(p.pool.connect(e.staker).stake(0)).to.be.reverted;
                });

                it('Staking when the pool is paused should fail', async function () {
                    await p.pool.connect(e.governance).pause();
                    await expect(p.pool.connect(e.staker).stake(stakeAmount)).to.be.reverted;
                });

                it('Staking when the pool is closed should fail', async function () {
                    await p.pool.connect(e.staker).close();
                    await expect(p.pool.connect(e.staker).stake(stakeAmount)).to.be.reverted;
                });

                it('Staking as the protocol should fail', async function () {
                    await mintAndApprove(e.assetToken, e.deployer, e.treasury, p.pool.address, stakeAmount);
                    await expect(p.pool.connect(e.treasury).stake(stakeAmount)).to.be.reverted;
                });

                it('Staking as the governance should fail', async function () {
                    await mintAndApprove(e.assetToken, e.deployer, e.governance, p.pool.address, stakeAmount);
                    await expect(p.pool.connect(e.governance).stake(stakeAmount)).to.be.reverted;
                });

                it('Staking as a lender should fail', async function () {
                    await mintAndApprove(e.assetToken, e.deployer, lender1, p.pool.address, stakeAmount);
                    await expect(p.pool.connect(lender1).stake(stakeAmount)).to.be.reverted;
                });

                it('Staking as a borrower should fail', async function () {
                    let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
                    let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);
                    await p.loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);

                    await mintAndApprove(e.assetToken, e.deployer, borrower1, p.pool.address, stakeAmount);
                    await expect(p.pool.connect(borrower1).stake(stakeAmount)).to.be.reverted;
                });
            });
        });

        describe('Unstaking', function () {
            after(async function () {
                await rollback(evmSnapshotIds);
            });

            before(async function () {
                await snapshot(evmSnapshotIds);
                await p.pool.connect(e.staker).stake(stakeAmount);
                await p.pool.connect(lender1).deposit(depositAmount.sub(10 ** TOKEN_DECIMALS));
            });

            it('Staker can unstake', async function () {
                let exitFee = unstakeAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT);
                let exitFeeGain = exitFee
                    .mul(stakeAmount.sub(unstakeAmount))
                    .div(depositAmount.add(stakeAmount.sub(unstakeAmount)));
                let balanceDelta = unstakeAmount.sub(exitFee);

                let stakedBalance = await p.pool.balanceStaked();
                await expect(p.pool.connect(e.staker).unstake(unstakeAmount)).to.changeTokenBalances(
                    e.assetToken,
                    [e.staker.address, p.pool.address],
                    [balanceDelta, -balanceDelta],
                );

                expect(await p.pool.balanceStaked()).to.equal(stakedBalance.sub(unstakeAmount).add(exitFeeGain));
            });

            describe('Amount Unstakable', function () {
                it('Can view amount unstakable', async function () {
                    let expectedUnstakable = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);

                    expect(await p.pool.amountUnstakable()).to.equal(expectedUnstakable);
                });

                it('Amount unstakable is zero when pool is paused', async function () {
                    await p.pool.connect(e.governance).pause();
                    expect(await p.pool.amountUnstakable()).to.equal(0);
                });

                it('Amount unstakable is bound by pool liquidity', async function () {

                    let origUnstakable = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);

                    const loanAmount = (await p.pool.liquidity()).sub(BigNumber.from(500).mul(TOKEN_MULTIPLIER));
                    const loanDuration = BigNumber.from(365).mul(24 * 60 * 60);
                    await p.loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);

                    const applicationId = await p.loanDesk.recentApplicationIdOf(borrower1.address);
                    const application = await p.loanDesk.loanApplications(applicationId);
                    await p.loanDesk
                        .connect(e.staker)
                        .draftOffer(
                            applicationId,
                            application.amount,
                            application.duration,
                            (await p.loanDesk.loanTemplate()).gracePeriod,
                            0,
                            1,
                            (await p.loanDesk.loanTemplate()).apr,
                        );

                    const amountUnstakable = await p.pool.amountUnstakable();
                    expect(amountUnstakable).to.equal(await p.pool.liquidity());
                    expect(amountUnstakable).to.lt(origUnstakable);

                });
            });

            it('Staker can unstake full unstakable amount', async function () {
                let requestAmount = depositAmount.sub(10 ** TOKEN_DECIMALS);
                await p.pool.connect(lender1).requestWithdrawalAllowance(requestAmount);
                await skipEvmTime(61);

                await p.pool.connect(lender1).withdraw(requestAmount);

                let amount = await p.pool.amountUnstakable();
                let exitFee = amount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT);
                let balanceDelta = amount.sub(exitFee);

                await expect(p.pool.connect(e.staker).unstake(amount)).to.changeTokenBalances(
                    e.assetToken,
                    [e.staker.address, p.pool.address],
                    [balanceDelta, -balanceDelta],
                );
            });

            it('Unstaking is reflected on the pool contract balance', async function () {
                let prevBalance = await e.assetToken.balanceOf(p.pool.address);

                await p.pool.connect(e.staker).unstake(unstakeAmount);

                let balance = await e.assetToken.balanceOf(p.pool.address);

                expect(balance).to.equal(
                    prevBalance.sub(unstakeAmount).add(unstakeAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT)),
                );
            });

            it('Unstaking is reflected on pool liquidity', async function () {
                let prevLiquidity = await e.assetToken.balanceOf(p.pool.address);

                await p.pool.connect(e.staker).unstake(unstakeAmount);

                let liquidity = await e.assetToken.balanceOf(p.pool.address);

                expect(liquidity).to.equal(
                    prevLiquidity.sub(unstakeAmount).add(unstakeAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT)),
                );
            });

            it('Unstaking is reflected on pool funds', async function () {
                let prevPoolFunds = await p.pool.poolFunds();

                await p.pool.connect(e.staker).unstake(unstakeAmount);

                let poolFunds = await p.pool.poolFunds();

                expect(poolFunds).to.equal(
                    prevPoolFunds.sub(unstakeAmount).add(unstakeAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT)),
                );
            });

            describe('Rejection scenarios', function () {
                it('Unstaking a zero amount should fail', async function () {
                    await expect(p.pool.connect(e.staker).unstake(0)).to.be.reverted;
                });

                it('Unstaking an amount greater than unstakable should fail', async function () {
                    let amountUnstakable = await p.pool.amountUnstakable();
                    await expect(p.pool.connect(e.staker).unstake(amountUnstakable.add(1))).to.be.reverted;
                });

                it('Unstaking when the pool is paused should fail', async function () {
                    await p.pool.connect(e.governance).pause();
                    await expect(p.pool.connect(e.staker).unstake(unstakeAmount)).to.be.reverted;
                });

                it('Unstaking as the protocol should fail', async function () {
                    await expect(p.pool.connect(e.treasury).unstake(unstakeAmount)).to.be.reverted;
                });

                it('Unstaking as the governance should fail', async function () {
                    await expect(p.pool.connect(e.governance).unstake(unstakeAmount)).to.be.reverted;
                });

                it('Unstaking as a lender should fail', async function () {
                    await expect(p.pool.connect(lender1).unstake(unstakeAmount)).to.be.reverted;
                });

                it('Unstaking as a borrower should fail', async function () {
                    let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
                    let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);
                    await p.loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);

                    await expect(p.pool.connect(borrower1).unstake(unstakeAmount)).to.be.reverted;
                });
            });
        });

        describe('Deposits', function () {
            after(async function () {
                await rollback(evmSnapshotIds);
            });

            before(async function () {
                await snapshot(evmSnapshotIds);

                await p.pool.connect(e.staker).stake(stakeAmount);
            });

            it('Lender can deposit', async function () {
                await expect(p.pool.connect(lender1).deposit(depositAmount))
                    .to.changeTokenBalances(
                        e.assetToken,
                        [lender1.address, p.pool.address],
                        [-depositAmount, depositAmount],
                    )
                    .and.to.changeTokenBalance(p.pool, lender1.address, depositAmount);

                // expect(await saplingPoolContext.balanceOf(lender1.address)).to.equal(depositAmount);
            });

            it('Deposit is reflected on the pool contract balance', async function () {
                let prevBalance = await e.assetToken.balanceOf(p.pool.address);

                await mintAndApprove(e.assetToken, e.deployer, lender1, p.pool.address, depositAmount);
                await p.pool.connect(lender1).deposit(depositAmount);

                let balance = await e.assetToken.balanceOf(p.pool.address);
                expect(balance).to.equal(prevBalance.add(depositAmount));
            });

            it('Deposit is reflected on pool liquidity', async function () {
                let prevLiquidity = await e.assetToken.balanceOf(p.pool.address);

                await mintAndApprove(e.assetToken, e.deployer, lender1, p.pool.address, depositAmount);
                await p.pool.connect(lender1).deposit(depositAmount);

                let liquidity = await e.assetToken.balanceOf(p.pool.address);

                expect(liquidity).to.equal(prevLiquidity.add(depositAmount));
            });

            it('Deposit is reflected on pool funds', async function () {
                let prevPoolFunds = await p.pool.poolFunds();

                await mintAndApprove(e.assetToken, e.deployer, lender1, p.pool.address, depositAmount);
                await p.pool.connect(lender1).deposit(depositAmount);

                let poolFunds = await p.pool.poolFunds();

                expect(poolFunds).to.equal(prevPoolFunds.add(depositAmount));
            });

            describe('Amount depositable', function () {
                it('Can view amount depositable', async function () {
                    let targetStakePercent = (await p.pool.config()).targetStakePercent;
                    let ONE_HUNDRED_PERCENT = await saplingMath.HUNDRED_PERCENT();
                    let calculatedDepositable = stakeAmount
                        .mul(ONE_HUNDRED_PERCENT)
                        .div(targetStakePercent)
                        .sub(stakeAmount)
                        .sub(10 ** TOKEN_DECIMALS);

                    expect(await p.pool.amountDepositable()).to.equal(calculatedDepositable);
                });

                it('Amount depositable is zero when pool is paused', async function () {
                    await p.pool.connect(e.governance).pause();
                    expect(await p.pool.amountDepositable()).to.equal(0);
                });

                it('Amount depositable is zero when pool is closed', async function () {
                    await p.pool.connect(e.staker).close();
                    expect(await p.pool.amountDepositable()).to.equal(0);
                });

                it('Amount depositable is zero when pool is full', async function () {
                    let targetStakePercent = (await p.pool.config()).targetStakePercent;
                    let ONE_HUNDRED_PERCENT = await saplingMath.HUNDRED_PERCENT();
                    let calculatedDepositable = stakeAmount
                        .mul(ONE_HUNDRED_PERCENT)
                        .div(targetStakePercent)
                        .sub(stakeAmount)
                        .sub(10 ** TOKEN_DECIMALS);

                    await mintAndApprove(e.assetToken, e.deployer, lender1, p.pool.address, calculatedDepositable);
                    await p.pool.connect(lender1).deposit(calculatedDepositable);
                    expect(await p.pool.amountDepositable()).to.equal(0);
                });
            });

            describe('Rejection scenarios', function () {
                it('Depositing a zero amount should fail', async function () {
                    await mintAndApprove(e.assetToken, e.deployer, lender1, p.pool.address, depositAmount);
                    await expect(p.pool.connect(lender1).deposit(0)).to.be.reverted;
                });

                it('Depositing an amount greater than allowed should fail', async function () {
                    let amountDepositable = await p.pool.amountDepositable();

                    await mintAndApprove(e.assetToken, e.deployer, lender1, p.pool.address, amountDepositable.add(1));
                    await expect(p.pool.connect(lender1).deposit(amountDepositable.add(1))).to.be.reverted;
                });

                it('Depositing while having an active withdrawal request should fail', async function () {
                    let amountDepositable = await p.pool.amountDepositable();

                    await mintAndApprove(e.assetToken, e.deployer, lender1, p.pool.address, amountDepositable);

                    let depositAmount = amountDepositable.div(4);
                    let withdrawalAmount = depositAmount.div(2);
                    await p.pool.connect(lender1).deposit(depositAmount);
                    await p.pool.connect(lender1).requestWithdrawalAllowance(withdrawalAmount);

                    await expect(p.pool.connect(lender1).deposit(depositAmount)).to.be.revertedWith(
                        'SaplingPoolContext: deposit not allowed. Active withdrawal allowance found.',
                    );
                });

                it('Depositing when the pool is paused should fail', async function () {
                    await p.pool.connect(e.governance).pause();
                    await mintAndApprove(e.assetToken, e.deployer, lender1, p.pool.address, depositAmount);
                    await expect(p.pool.connect(lender1).deposit(depositAmount)).to.be.reverted;
                });

                it('Depositing when the pool is closed should fail', async function () {
                    await p.pool.connect(e.staker).close();
                    await mintAndApprove(e.assetToken, e.deployer, lender1, p.pool.address, depositAmount);
                    await expect(p.pool.connect(lender1).deposit(depositAmount)).to.be.reverted;
                });

                it('Depositing as the staker should fail', async function () {
                    await mintAndApprove(e.assetToken, e.deployer, e.staker, p.pool.address, depositAmount);
                    await expect(p.pool.connect(e.staker).deposit(depositAmount)).to.be.reverted;
                });

                it('Depositing as the governance should fail', async function () {
                    await mintAndApprove(e.assetToken, e.deployer, e.governance, p.pool.address, depositAmount);
                    await expect(p.pool.connect(e.governance).deposit(depositAmount)).to.be.reverted;
                });
            });
        });

        describe('Withdrawals', function () {
            after(async function () {
                await rollback(evmSnapshotIds);
            });

            before(async function () {
                await snapshot(evmSnapshotIds);

                await p.pool.connect(e.staker).stake(stakeAmount);
                await p.pool.connect(lender1).deposit(depositAmount);
            });

            it('Lenders can request withdrawal allowance', async function () {
                const requestAmount = (await p.pool.balanceOf(lender1.address)).div(2);
                assertHardhatInvariant(requestAmount.gt(0), 'This test requires a nonzero balance greater than 1');

                await p.pool.connect(lender1).requestWithdrawalAllowance(requestAmount);
                let requestBlockTimestamp = await (await ethers.provider.getBlock()).timestamp;

                const allowance = await p.pool.withdrawalAllowances(lender1.address);

                expect(allowance.amount).to.equal(requestAmount);
                expect(allowance.timeFrom).to.equal(requestBlockTimestamp + 60);
                expect(allowance.timeTo).to.equal(requestBlockTimestamp + 60 * 11);
            });

            it('Lender can withdraw', async function () {
                let tokenBalanceBefore = await e.assetToken.balanceOf(lender1.address);
                let poolBalanceBefore = await p.pool.balanceOf(lender1.address);

                let exitFee = withdrawAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT);
                let exitFeeGain = exitFee
                    .mul(depositAmount.sub(withdrawAmount))
                    .div(stakeAmount.add(depositAmount.sub(withdrawAmount)).add(10 ** TOKEN_DECIMALS));

                await p.pool.connect(lender1).requestWithdrawalAllowance(withdrawAmount);
                await skipEvmTime(61);

                await p.pool.connect(lender1).withdraw(withdrawAmount);
                expect(await p.pool.balanceOf(lender1.address)).to.equal(
                    poolBalanceBefore.sub(withdrawAmount).add(exitFeeGain),
                );

                expect(await e.assetToken.balanceOf(lender1.address)).to.equal(
                    tokenBalanceBefore.add(withdrawAmount).sub(exitFee),
                );
            });

            it('Withdrawal allowance is single use even if withdrawn less than requested', async function () {

                await p.pool.connect(lender1).requestWithdrawalAllowance(withdrawAmount);
                await skipEvmTime(61);

                await p.pool.connect(lender1).withdraw(withdrawAmount.div(2));

                const allowance = await p.pool.withdrawalAllowances(lender1.address);
                expect(allowance.amount).to.equal(0);
            });

            it('Withdraw is reflected on the pool contract balance', async function () {
                let prevBalance = await e.assetToken.balanceOf(p.pool.address);

                await p.pool.connect(lender1).requestWithdrawalAllowance(withdrawAmount);
                await skipEvmTime(61);

                await p.pool.connect(lender1).withdraw(withdrawAmount);

                let balance = await e.assetToken.balanceOf(p.pool.address);
                expect(balance).to.equal(
                    prevBalance.sub(withdrawAmount).add(withdrawAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT)),
                );
            });

            it('Withdraw is reflected on pool liquidity', async function () {
                let prevLiquidity = await e.assetToken.balanceOf(p.pool.address);

                await p.pool.connect(lender1).requestWithdrawalAllowance(withdrawAmount);
                await skipEvmTime(61);

                await p.pool.connect(lender1).withdraw(withdrawAmount);

                let liquidity = await e.assetToken.balanceOf(p.pool.address);

                expect(liquidity).to.equal(
                    prevLiquidity.sub(withdrawAmount).add(withdrawAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT)),
                );
            });

            it('Withdraw is reflected on pool funds', async function () {
                let prevPoolFunds = await p.pool.poolFunds();

                await p.pool.connect(lender1).requestWithdrawalAllowance(withdrawAmount);
                await skipEvmTime(61);

                await p.pool.connect(lender1).withdraw(withdrawAmount);

                let poolFunds = await p.pool.poolFunds();

                expect(poolFunds).to.equal(
                    prevPoolFunds.sub(withdrawAmount).add(withdrawAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT)),
                );
            });

            it('Withdrawal should charge an exit fee', async function () {
                let tokenBalanceBefore = await e.assetToken.balanceOf(lender1.address);

                let expectedWithdrawalFee = withdrawAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT);

                await p.pool.connect(lender1).requestWithdrawalAllowance(withdrawAmount);
                await skipEvmTime(61);

                await p.pool.connect(lender1).withdraw(withdrawAmount);

                expect(await e.assetToken.balanceOf(lender1.address)).to.equal(
                    tokenBalanceBefore.add(withdrawAmount.sub(expectedWithdrawalFee)),
                );
            });

            describe('Rejection scenarios', function () {
                it('Withdrawing a zero amount should fail', async function () {
                    await p.pool.connect(lender1).requestWithdrawalAllowance(withdrawAmount);
                    await skipEvmTime(61);

                    await expect(p.pool.connect(lender1).withdraw(0)).to.be.reverted;
                });

                it("Requesting a withdrawal allowance for amount greater than user's balance should fail", async function () {
                    const requestAmount = (await p.pool.balanceOf(lender1.address)).add(1);
                    await expect(p.pool.connect(lender1).requestWithdrawalAllowance(requestAmount)).to.be.revertedWith('SaplingPoolContext: amount exceeds account balance');
                });

                it('Withdrawing without an active allowance should fail', async function () {
                    await expect(p.pool.connect(lender1).withdraw(withdrawAmount)).to.be.reverted;
                });

                it('Withdrawing while too early for the allowance to take effect should fail', async function () {
                    await p.pool.connect(lender1).requestWithdrawalAllowance(withdrawAmount);
                    await expect(p.pool.connect(lender1).withdraw(withdrawAmount)).to.be.revertedWith('SaplingPoolContext: request is too early');
                });

                it('Withdrawing after the allowance has expired should fail', async function () {
                    await p.pool.connect(lender1).requestWithdrawalAllowance(withdrawAmount);
                    await skipEvmTime(60 * 11);
                    await expect(p.pool.connect(lender1).withdraw(withdrawAmount)).to.be.revertedWith('SaplingPoolContext: withdrawal allowance has expired');
                });

                it('Withdrawing an amount greater than in the allowance should fail', async function () {
                    let amount = (await p.pool.balanceOf(lender1.address)).div(2);

                    await p.pool.connect(lender1).requestWithdrawalAllowance(amount);
                    await skipEvmTime(61);
                    await expect(p.pool.connect(lender1).withdraw(amount.add(1))).to.be.revertedWith('SaplingPoolContext: insufficient withdrawal allowance amount');
                });

                it('Withdrawing an amount greater than available should fail', async function () {
                    let gracePeriod = (await p.loanDesk.loanTemplate()).gracePeriod;
                    let installments = 1;
                    let apr = (await p.loanDesk.loanTemplate()).apr;
                    let loanAmount = BigNumber.from(5000).mul(TOKEN_MULTIPLIER);
                    let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);

                    await p.loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
                    let otherApplicationId = await p.loanDesk.recentApplicationIdOf(borrower1.address);
                    await p.loanDesk
                        .connect(e.staker)
                        .draftOffer(otherApplicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);
                    await p.loanDesk.connect(e.staker).lockDraftOffer(otherApplicationId);
                    await skipEvmTime(2 * 24 * 60 * 60 + 1);
                    await p.loanDesk.connect(e.staker).offerLoan(otherApplicationId);
                    await p.loanDesk.connect(borrower1).borrow(otherApplicationId);

                    let amountWithdrawable = await p.pool.amountWithdrawable(lender1.address);

                    await p.pool.connect(lender1).requestWithdrawalAllowance(amountWithdrawable.add(1));
                    await skipEvmTime(61);

                    await expect(p.pool.connect(lender1).withdraw(amountWithdrawable.add(1))).to.be.reverted;
                });

                it('Withdrawing when the pool is paused should fail', async function () {
                    await p.pool.connect(lender1).requestWithdrawalAllowance(withdrawAmount);
                    await skipEvmTime(61);

                    await p.pool.connect(e.governance).pause();

                    await expect(p.pool.connect(lender1).withdraw(withdrawAmount)).to.be.reverted;
                });

                it('Withdrawing as the staker should fail', async function () {
                    let balance = await p.pool.balanceStaked();

                    await expect(p.pool.connect(e.staker).requestWithdrawalAllowance(balance.div(10))).to.be.reverted;
                });

                it('Withdrawing as a borrower should fail', async function () {
                    let gracePeriod = (await p.loanDesk.loanTemplate()).gracePeriod;
                    let installments = 1;
                    let apr = (await p.loanDesk.loanTemplate()).apr;

                    await p.loanDesk.connect(borrower2).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
                    let otherApplicationId = await p.loanDesk.recentApplicationIdOf(borrower2.address);
                    await p.loanDesk
                        .connect(e.staker)
                        .draftOffer(otherApplicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);

                    await expect(p.pool.connect(borrower2).requestWithdrawalAllowance(loanAmount)).to.be.reverted;

                    await expect(p.pool.connect(borrower2).withdraw(loanAmount)).to.be.reverted;
                });
            });

            describe('Protocol fees', function () {
                after(async function () {
                    await rollback(evmSnapshotIds);
                });

                before(async function () {
                    await snapshot(evmSnapshotIds);

                    let gracePeriod = (await p.loanDesk.loanTemplate()).gracePeriod;
                    let installments = 1;
                    let apr = (await p.loanDesk.loanTemplate()).apr;

                    let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);

                    await p.loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
                    let applicationId = await p.loanDesk.recentApplicationIdOf(borrower1.address);
                    await p.loanDesk
                        .connect(e.staker)
                        .draftOffer(applicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);
                    await p.loanDesk.connect(e.staker).lockDraftOffer(applicationId);
                    await skipEvmTime(2 * 24 * 60 * 60 + 1);
                    await p.loanDesk.connect(e.staker).offerLoan(applicationId);
                    let tx = await p.loanDesk.connect(borrower1).borrow(applicationId);
                    let loanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0].args.loanId;

                    await skipEvmTime(loanDuration.toNumber() - 10);
                });

                it('Treasury earns protocol fee on paid interest', async function () {
                    let paymentAmount = await p.loanDesk.loanBalanceDue(1);
                    paymentAmount = paymentAmount.sub(loanAmount);

                    await mintAndApprove(e.assetToken, e.deployer, borrower1, p.pool.address, paymentAmount);

                    await expect(p.loanDesk.connect(borrower1).repay(1, paymentAmount)).to.changeTokenBalance(
                        e.assetToken,
                        e.treasury.address,
                        paymentAmount.div(5),
                    );
                });
            });
        });

        describe('Projected APY', function () {
            let poolFunds;

            after(async function () {
                await rollback(evmSnapshotIds);
            });

            before(async function () {
                await snapshot(evmSnapshotIds);

                depositAmount = BigNumber.from(18000)
                    .mul(TOKEN_MULTIPLIER)
                    .sub(10 ** TOKEN_DECIMALS);
                loanAmount = BigNumber.from(10000).mul(TOKEN_MULTIPLIER);

                await p.pool.connect(e.staker).stake(stakeAmount);

                await mintAndApprove(e.assetToken, e.deployer, lender1, p.pool.address, depositAmount);
                await p.pool.connect(lender1).deposit(depositAmount);

                poolFunds = stakeAmount.add(depositAmount).add(10 ** TOKEN_DECIMALS);

                await p.loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
                let applicationId = await p.loanDesk.recentApplicationIdOf(borrower1.address);
                let application = await p.loanDesk.loanApplications(applicationId);

                let gracePeriod = (await p.loanDesk.loanTemplate()).gracePeriod;
                let installments = 1;
                let apr = (await p.loanDesk.loanTemplate()).apr;

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
                await p.loanDesk.connect(borrower1).borrow(applicationId);
            });

            it('Can view lender APY given current pool state', async function () {
                let apr = (await p.loanDesk.loanTemplate()).apr;
                let protocolEarningPercent = (await p.pool.config()).protocolFeePercent;
                let ONE_HUNDRED_PERCENT = await saplingMath.HUNDRED_PERCENT();
                let stakerEarnFactor = (await p.pool.config()).stakerEarnFactor;

                // pool APY
                let poolAPY = BigNumber.from(apr).mul(loanAmount).div(poolFunds);

                // protocol APY
                let protocolAPY = poolAPY.mul(protocolEarningPercent).div(ONE_HUNDRED_PERCENT);

                let remainingAPY = poolAPY.sub(protocolAPY);

                // staker withdrawableAPY
                let currentStakePercent = ONE_HUNDRED_PERCENT / poolFunds.div(stakeAmount).toNumber();
                let stakerEarningsPercent =
                    (currentStakePercent * (stakerEarnFactor - ONE_HUNDRED_PERCENT)) / ONE_HUNDRED_PERCENT;
                let stakerWithdrawableAPY = remainingAPY
                    .mul(stakerEarningsPercent)
                    .div(stakerEarningsPercent + ONE_HUNDRED_PERCENT);

                let expectedLenderAPY = remainingAPY.sub(stakerWithdrawableAPY).toNumber();

                let apyBreakdown = await p.pool.currentAPY();
                expect(apyBreakdown.lenderComponent).to.equal(expectedLenderAPY);
            });

            it('Can view projected lender APY', async function () {
                let apr = (await p.loanDesk.loanTemplate()).apr;
                let protocolEarningPercent = (await p.pool.config()).protocolFeePercent;
                let ONE_HUNDRED_PERCENT = await saplingMath.HUNDRED_PERCENT();
                let stakerEarnFactor = (await p.pool.config()).stakerEarnFactor;

                // pool APY
                let poolAPY = BigNumber.from(apr).mul(loanAmount).div(poolFunds);

                // protocol APY
                let protocolAPY = poolAPY.mul(protocolEarningPercent).div(ONE_HUNDRED_PERCENT);

                let remainingAPY = poolAPY.sub(protocolAPY);

                // staker withdrawableAPY
                let currentStakePercent = ONE_HUNDRED_PERCENT / poolFunds.div(stakeAmount).toNumber();
                let stakerEarningsPercent =
                    (currentStakePercent * (stakerEarnFactor - ONE_HUNDRED_PERCENT)) / ONE_HUNDRED_PERCENT;
                let stakerWithdrawableAPY = remainingAPY
                    .mul(stakerEarningsPercent)
                    .div(stakerEarningsPercent + ONE_HUNDRED_PERCENT);

                let expectedLenderAPY = remainingAPY.sub(stakerWithdrawableAPY).toNumber();

                expect(
                    (
                        await p.pool.projectedAPYBreakdown(
                            await p.poolToken.totalSupply(),
                            (
                                await p.pool.balances()
                            ).stakedShares,
                            poolFunds,
                            loanAmount,
                            apr,
                            protocolEarningPercent,
                            stakerEarnFactor,
                        )
                    ).lenderComponent,
                ).to.equal(expectedLenderAPY);
            });

            it('Increase in borrow rate is linearly reflected on projected lender APY within margin of integer math accuracy', async function () {
                let apr = (await p.loanDesk.loanTemplate()).apr;
                let protocolEarningPercent = (await p.pool.config()).protocolFeePercent;
                let ONE_HUNDRED_PERCENT = await saplingMath.HUNDRED_PERCENT();
                let stakerEarnFactor = (await p.pool.config()).stakerEarnFactor;

                let projectedBorrowAmount = loanAmount.div(2);

                // pool APY
                let poolAPY = BigNumber.from(apr).mul(projectedBorrowAmount).div(poolFunds);

                // protocol APY
                let protocolAPY = poolAPY.mul(protocolEarningPercent).div(ONE_HUNDRED_PERCENT);

                // staker withdrawableAPY
                let currentStakePercent = stakeAmount.mul(ONE_HUNDRED_PERCENT).div(poolFunds);
                let stakerEarningsPercent = currentStakePercent
                    .mul(stakerEarnFactor - ONE_HUNDRED_PERCENT)
                    .div(ONE_HUNDRED_PERCENT);
                let stakerWithdrawableAPY = poolAPY
                    .sub(protocolAPY)
                    .mul(stakerEarningsPercent)
                    .div(stakerEarningsPercent + ONE_HUNDRED_PERCENT);

                let expectedLenderAPY = poolAPY.sub(protocolAPY).sub(stakerWithdrawableAPY).toNumber();

                const totalShares = await p.poolToken.totalSupply()
                const stakedShares = (await p.pool.balances()).stakedShares;

                expect(
                    (
                        await p.pool.projectedAPYBreakdown(
                            totalShares,
                            stakedShares,
                            poolFunds,
                            projectedBorrowAmount.mul(2),
                            apr,
                            protocolEarningPercent,
                            stakerEarnFactor,
                        )
                    ).lenderComponent -
                        expectedLenderAPY * 2,
                ).to.lte(10);
                expect(
                    (
                        await p.pool.projectedAPYBreakdown(
                            totalShares,
                            stakedShares,
                            poolFunds,
                            projectedBorrowAmount.mul(3),
                            apr,
                            protocolEarningPercent,
                            stakerEarnFactor,
                        )
                    ).lenderComponent -
                        expectedLenderAPY * 3,
                ).to.lte(10);
            });

            describe('Rejection scenarios', function () {
                it('APY projection should fail when borrow rate of over 100% is requested', async function () {
                    const apr = (await p.loanDesk.loanTemplate()).apr;
                    const totalShares = await p.poolToken.totalSupply()
                    const stakedShares = (await p.pool.balances()).stakedShares;
                    await expect(
                        p.pool.projectedAPYBreakdown(
                            totalShares,
                            stakedShares,
                            poolFunds,
                            poolFunds.add(1),
                            apr,
                            (
                                await p.pool.config()
                            ).protocolFeePercent,
                            (
                                await p.pool.config()
                            ).stakerEarnFactor,
                        ),
                    ).to.be.revertedWith('SaplingPoolContext: invalid _strategizedFunds');
                });

                it('APY projection should fail when staked tokens are greater than total shares', async function () {
                    const apr = (await p.loanDesk.loanTemplate()).apr;
                    const totalShares = await p.poolToken.totalSupply()
                    await expect(
                        p.pool.projectedAPYBreakdown(
                            totalShares,
                            totalShares.add(1),
                            poolFunds,
                            poolFunds,
                            apr,
                            (
                                await p.pool.config()
                            ).protocolFeePercent,
                            (
                                await p.pool.config()
                            ).stakerEarnFactor,
                        ),
                    ).to.be.revertedWith('SaplingPoolContext: invalid _stakedTokens');
                });

                it('APY projection should fail when protocol fee percent is greater than maximum', async function () {
                    const apr = (await p.loanDesk.loanTemplate()).apr;
                    const totalShares = await p.poolToken.totalSupply()
                    const stakedShares = (await p.pool.balances()).stakedShares;
                    await expect(
                        p.pool.projectedAPYBreakdown(
                            totalShares,
                            stakedShares,
                            poolFunds,
                            poolFunds,
                            apr,
                            await  saplingMath.MAX_PROTOCOL_FEE_PERCENT() + 1,
                            (
                                await p.pool.config()
                            ).stakerEarnFactor,
                        ),
                    ).to.be.revertedWith('SaplingPoolContext: invalid _protocolFeePercent');
                });

                it('APY projection should fail when protocol fee staker earn factor is less than minimum', async function () {
                    const apr = (await p.loanDesk.loanTemplate()).apr;
                    const totalShares = await p.poolToken.totalSupply()
                    const stakedShares = (await p.pool.balances()).stakedShares;
                    await expect(
                        p.pool.projectedAPYBreakdown(
                            totalShares,
                            stakedShares,
                            poolFunds,
                            poolFunds,
                            apr,
                            (
                                await p.pool.config()
                            ).protocolFeePercent,
                            ONE_HUNDRED_PERCENT - 1,
                        ),
                    ).to.be.revertedWith('SaplingPoolContext: invalid _stakerEarnFactor');
                });
            });
        });
    });
});
