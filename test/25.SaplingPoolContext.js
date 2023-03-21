const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { ethers, upgrades } = require('hardhat');
const { assertHardhatInvariant } = require('hardhat/internal/core/errors');
const { NULL_ADDRESS, TOKEN_DECIMALS, TOKEN_MULTIPLIER, NIL_UUID, NIL_DIGEST } = require('./utils/constants');
const { mintAndApprove } = require('./utils/helpers');
const { snapshot, rollback, skipEvmTime } = require('./utils/evmControl');
const { deployEnv, deployProtocol } = require("./utils/deployer");

let evmSnapshotIds = [];

describe('Sapling Pool Context (via SaplingLendingPool)', function () {
    let coreAccessControl;

    let saplingPoolContext;
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

        saplingPoolContext = lendingPool;

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
                upgrades.deployProxy(await ethers.getContractFactory('SaplingLendingPool'), [
                    poolToken2.address,
                    liquidityToken.address,
                    coreAccessControl.address,
                    protocol.address,
                    staker.address,
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
                        coreAccessControl.address,
                        protocol.address,
                        staker.address,
                    ]),
                ).to.be.reverted;
            });

            it('Deploying with null pool token address should fail', async function () {
                await expect(
                    upgrades.deployProxy(await ethers.getContractFactory('SaplingLendingPool'), [
                        NULL_ADDRESS,
                        liquidityToken.address,
                        coreAccessControl.address,
                        protocol.address,
                        staker.address,
                    ]),
                ).to.be.reverted;
            });

            it('Deploying with a pool token with non-zero total supply should fail', async function () {
                let badPoolToken = await (
                    await ethers.getContractFactory('PoolToken')
                ).deploy('Sapling Test Lending Pool Token', 'SLPT', TOKEN_DECIMALS);

                await badPoolToken.connect(deployer).mint(addresses[0].address, 1);

                await expect(
                    upgrades.deployProxy(await ethers.getContractFactory('SaplingLendingPool'), [
                        badPoolToken.address,
                        liquidityToken.address,
                        coreAccessControl.address,
                        protocol.address,
                        staker.address,
                    ]),
                ).to.be.reverted;
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
            exitFeePercent = (await saplingPoolContext.config()).exitFeePercent;

            lender1 = addresses[1];
            borrower1 = addresses[2];
            borrower2 = addresses[3];

            stakeAmount = BigNumber.from(2000).mul(TOKEN_MULTIPLIER);
            unstakeAmount = BigNumber.from(500).mul(TOKEN_MULTIPLIER);
            depositAmount = BigNumber.from(9000).mul(TOKEN_MULTIPLIER);
            withdrawAmount = BigNumber.from(3000).mul(TOKEN_MULTIPLIER);
            loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
            loanDuration = BigNumber.from(365).mul(24 * 60 * 60);

            await mintAndApprove(liquidityToken, deployer, staker, saplingPoolContext.address, stakeAmount);
            await mintAndApprove(liquidityToken, deployer, lender1, saplingPoolContext.address, depositAmount);
        });

        describe('Initial State', function () {
            it('Liquidity token address is correct', async function () {
                expect((await saplingPoolContext.tokenConfig()).liquidityToken).to.equal(liquidityToken.address);
            });

            it('Pool token address is correct', async function () {
                expect((await saplingPoolContext.tokenConfig()).poolToken).to.equal(poolToken.address);
            });

            it('Token decimals is correct', async function () {
                expect((await saplingPoolContext.tokenConfig()).decimals).to.equal(TOKEN_DECIMALS);
            });

            it('Target stake percent is correct', async function () {
                let minValue = 0 * 10 ** PERCENT_DECIMALS;
                let maxValue = 100 * 10 ** PERCENT_DECIMALS;
                let defaultValue = 10 * 10 ** PERCENT_DECIMALS;

                expect(ONE_HUNDRED_PERCENT).to.equal(maxValue);
                expect((await saplingPoolContext.config()).targetStakePercent)
                    .to.equal(defaultValue)
                    .and.gte(minValue)
                    .and.lte(maxValue);
            });

            it('Target liquidity percent is correct', async function () {
                let minValue = 0 * 10 ** PERCENT_DECIMALS;
                let maxValue = 100 * 10 ** PERCENT_DECIMALS;
                let defaultValue = 0 * 10 ** PERCENT_DECIMALS;

                expect(ONE_HUNDRED_PERCENT).to.equal(maxValue);
                expect((await saplingPoolContext.config()).targetLiquidityPercent)
                    .to.equal(defaultValue)
                    .and.gte(minValue)
                    .and.lte(maxValue);
            });

            it('Protocol fee percent is correct', async function () {
                let minValue = 0 * 10 ** PERCENT_DECIMALS;
                let maxValue = 50 * 10 ** PERCENT_DECIMALS;
                let defaultValue = 20 * 10 ** PERCENT_DECIMALS;

                expect(await saplingMath.MAX_PROTOCOL_FEE_PERCENT()).to.equal(maxValue);
                expect((await saplingPoolContext.config()).protocolFeePercent)
                    .to.equal(defaultValue)
                    .and.gte(minValue)
                    .and.lte(maxValue);
            });

            it("Staker's earn factor is correct", async function () {
                let minValue = 100 * 10 ** PERCENT_DECIMALS;
                let maxValue = 1000 * 10 ** PERCENT_DECIMALS;
                let defaultValue = 150 * 10 ** PERCENT_DECIMALS;

                expect((await saplingPoolContext.config()).stakerEarnFactorMax).to.equal(maxValue);
                expect((await saplingPoolContext.config()).stakerEarnFactor)
                    .to.equal(defaultValue)
                    .and.gte(minValue)
                    .and.lte(maxValue);
            });

            it('Exit fee is correct', async function () {
                expect(exitFeePercent).to.equal(0.5 * 10 ** PERCENT_DECIMALS);
            });

            it('Empty pool APY is correct', async function () {
                let apyBreakdown = await saplingPoolContext.currentAPY();
                expect(apyBreakdown.totalPoolAPY).to.equal(0);
                expect(apyBreakdown.protocolRevenueComponent).to.equal(0);
                expect(apyBreakdown.stakerEarningsComponent).to.equal(0);
                expect(apyBreakdown.lenderComponent).to.equal(0);
            });

            it('Initial balances are correct', async function () {
                expect(await poolToken.balanceOf(coreAccessControl.address)).to.equal(10 ** TOKEN_DECIMALS);
                expect((await saplingPoolContext.balances()).stakedShares).to.equal(0);
                expect(await saplingPoolContext.poolFundsLimit()).to.equal(0);
                expect(await saplingPoolContext.poolFunds()).to.equal(10 ** TOKEN_DECIMALS);
                expect(await liquidityToken.balanceOf(saplingPoolContext.address)).to.equal(10 ** TOKEN_DECIMALS);
            });
        });

        describe('Setting pool parameters', function () {
            describe('Target stake percent', function () {
                it('Governance can set target stake percent', async function () {
                    let currentValue = (await saplingPoolContext.config()).targetStakePercent;
                    let maxValue = await saplingMath.HUNDRED_PERCENT();

                    let newValue = 50 * 10 ** PERCENT_DECIMALS;
                    assertHardhatInvariant(newValue != currentValue && newValue <= maxValue);

                    await saplingPoolContext.connect(governance).setTargetStakePercent(newValue);
                    expect((await saplingPoolContext.config()).targetStakePercent).to.equal(newValue);
                });

                describe('Rejection scenarios', function () {
                    it('Target stake percent cannot be set to a value greater than the allowed maximum', async function () {
                        let currentValue = (await saplingPoolContext.config()).targetStakePercent;
                        let maxValue = await saplingMath.HUNDRED_PERCENT();

                        await expect(saplingPoolContext.connect(governance).setTargetStakePercent(maxValue + 1)).to.be
                            .reverted;
                    });

                    it('A non-governance cannot set target stake percent', async function () {
                        let currentValue = (await saplingPoolContext.config()).targetStakePercent;
                        let maxValue = await saplingMath.HUNDRED_PERCENT();

                        let newValue = 50 * 10 ** PERCENT_DECIMALS;
                        assertHardhatInvariant(newValue != currentValue && newValue <= maxValue);

                        await expect(saplingPoolContext.connect(staker).setTargetStakePercent(newValue)).to.be.reverted;
                    });
                });
            });

            describe('Target liquidity percent', function () {
                it('Staker can set target liquidity percent', async function () {
                    let currentValue = (await saplingPoolContext.config()).targetLiquidityPercent;
                    let maxValue = await saplingMath.HUNDRED_PERCENT();

                    let newValue = 50 * 10 ** PERCENT_DECIMALS;
                    assertHardhatInvariant(newValue != currentValue && newValue <= maxValue);

                    await saplingPoolContext.connect(staker).setTargetLiquidityPercent(newValue);
                    expect((await saplingPoolContext.config()).targetLiquidityPercent).to.equal(newValue);
                });

                describe('Rejection scenarios', function () {
                    it('Target liquidity percent cannot be set to a value greater than the allowed maximum', async function () {
                        let currentValue = (await saplingPoolContext.config()).targetLiquidityPercent;
                        let maxValue = await saplingMath.HUNDRED_PERCENT();

                        await expect(saplingPoolContext.connect(staker).setTargetLiquidityPercent(maxValue + 1)).to.be
                            .reverted;
                    });

                    it('A non-staker cannot set target liquidity percent', async function () {
                        let currentValue = (await saplingPoolContext.config()).targetLiquidityPercent;
                        let maxValue = await saplingMath.HUNDRED_PERCENT();

                        let newValue = 50 * 10 ** PERCENT_DECIMALS;
                        assertHardhatInvariant(newValue != currentValue && newValue <= maxValue);

                        await expect(saplingPoolContext.connect(governance).setTargetLiquidityPercent(newValue)).to.be
                            .reverted;
                    });
                });
            });

            describe('Protocol fee percent', function () {
                it('Governance can set protocol fee percent', async function () {
                    let currentValue = (await saplingPoolContext.config()).protocolFeePercent;
                    let maxValue = await saplingMath.MAX_PROTOCOL_FEE_PERCENT();

                    let newValue = 2 * 10 ** PERCENT_DECIMALS;
                    assertHardhatInvariant(newValue != currentValue && newValue <= maxValue);

                    await saplingPoolContext.connect(governance).setProtocolEarningPercent(newValue);
                    expect((await saplingPoolContext.config()).protocolFeePercent).to.equal(newValue);
                });

                describe('Rejection scenarios', function () {
                    it('Protocol fee percent cannot be set to a value greater than the allowed maximum', async function () {
                        let currentValue = (await saplingPoolContext.config()).protocolFeePercent;
                        let maxValue = await saplingMath.MAX_PROTOCOL_FEE_PERCENT();

                        await expect(saplingPoolContext.connect(governance).setProtocolEarningPercent(maxValue + 1)).to
                            .be.reverted;
                    });

                    it('A non-governance cannot set protocol fee percent', async function () {
                        let currentValue = (await saplingPoolContext.config()).protocolFeePercent;
                        let maxValue = await saplingMath.MAX_PROTOCOL_FEE_PERCENT();

                        let newValue = 2 * 10 ** PERCENT_DECIMALS;
                        assertHardhatInvariant(newValue != currentValue && newValue <= maxValue);

                        await expect(saplingPoolContext.connect(staker).setProtocolEarningPercent(newValue)).to.be
                            .reverted;
                    });
                });
            });

            describe("Staker's earn factor", function () {
                it("Staker can set staker's earn factor", async function () {
                    let currentValue = (await saplingPoolContext.config()).stakerEarnFactor;
                    let minValue = await saplingMath.HUNDRED_PERCENT();
                    let maxValue = (await saplingPoolContext.config()).stakerEarnFactorMax;

                    let newValue = 125 * 10 ** PERCENT_DECIMALS;
                    assertHardhatInvariant(newValue != currentValue && minValue <= newValue && newValue <= maxValue);

                    await saplingPoolContext.connect(staker).setStakerEarnFactor(newValue);
                    expect((await saplingPoolContext.config()).stakerEarnFactor).to.equal(newValue);
                });

                it("Staker's earn factor can be set while the pool is paused", async function () {
                    let currentValue = (await saplingPoolContext.config()).stakerEarnFactor;
                    let minValue = await saplingMath.HUNDRED_PERCENT();
                    let maxValue = (await saplingPoolContext.config()).stakerEarnFactorMax;

                    let newValue = 125 * 10 ** PERCENT_DECIMALS;
                    assertHardhatInvariant(newValue != currentValue && minValue <= newValue && newValue <= maxValue);

                    await saplingPoolContext.connect(governance).pause();

                    await expect(saplingPoolContext.connect(staker).setStakerEarnFactor(newValue)).to.be.not.reverted;
                });

                describe('Rejection scenarios', function () {
                    it("Staker's earn factor cannot be set to a value less than the allowed minimum", async function () {
                        let minValue = await saplingMath.HUNDRED_PERCENT();
                        assertHardhatInvariant(minValue > 0);
                        await expect(saplingPoolContext.connect(staker).setStakerEarnFactor(minValue - 1)).to.be
                            .reverted;
                    });

                    it("Staker's earn factor cannot be set to a value greater than the allowed maximum", async function () {
                        let maxValue = (await saplingPoolContext.config()).stakerEarnFactorMax;
                        await expect(saplingPoolContext.connect(staker).setStakerEarnFactor(maxValue + 1)).to.be
                            .reverted;
                    });

                    it("A non-staker cannot set staker's earn factor", async function () {
                        let currentValue = (await saplingPoolContext.config()).stakerEarnFactor;
                        let minValue = await saplingMath.HUNDRED_PERCENT();
                        let maxValue = (await saplingPoolContext.config()).stakerEarnFactorMax;

                        let newValue = 125 * 10 ** PERCENT_DECIMALS;
                        assertHardhatInvariant(
                            newValue != currentValue && minValue <= newValue && newValue <= maxValue,
                        );

                        await expect(saplingPoolContext.connect(governance).setStakerEarnFactor(newValue)).to.be
                            .reverted;
                    });
                });
            });

            describe("Maximum for Staker's earn factor", function () {
                it("Governance can set a maximum for staker's earn factor", async function () {
                    let currentValue = (await saplingPoolContext.config()).stakerEarnFactorMax;
                    let minValue = await saplingMath.HUNDRED_PERCENT();

                    let newValue = currentValue - 1;
                    assertHardhatInvariant(currentValue >= minValue);

                    await saplingPoolContext.connect(governance).setStakerEarnFactorMax(newValue);
                    expect((await saplingPoolContext.config()).stakerEarnFactorMax).to.equal(newValue);
                });

                it("Setting the maximum for staker's earn factor to less than current earn factor value will update the current earn factor", async function () {
                    let prevEarnFactor = (await saplingPoolContext.config()).stakerEarnFactor;
                    let currentValue = (await saplingPoolContext.config()).stakerEarnFactorMax;
                    let minValue = await saplingMath.HUNDRED_PERCENT();

                    let newValue = prevEarnFactor - 1;
                    assertHardhatInvariant(currentValue >= minValue);

                    await saplingPoolContext.connect(governance).setStakerEarnFactorMax(newValue);
                    expect((await saplingPoolContext.config()).stakerEarnFactorMax).to.equal(newValue);
                    expect((await saplingPoolContext.config()).stakerEarnFactor).to.equal(newValue);
                });

                describe('Rejection scenarios', function () {
                    it("Maximum for Staker's earn factor cannot be set to a value less than the allowed minimum", async function () {
                        let minValue = await saplingMath.HUNDRED_PERCENT();
                        assertHardhatInvariant(minValue > 0);
                        await expect(saplingPoolContext.connect(governance).setStakerEarnFactorMax(minValue - 1)).to.be
                            .reverted;
                    });

                    it("A non-governance cannot set a maximum for staker's earn factor", async function () {
                        let currentValue = (await saplingPoolContext.config()).stakerEarnFactorMax;
                        let minValue = await saplingMath.HUNDRED_PERCENT();
                        let maxValue = (await saplingPoolContext.config()).stakerEarnFactorMax;

                        let newValue = 125 * 10 ** PERCENT_DECIMALS;
                        assertHardhatInvariant(
                            newValue != currentValue && minValue <= newValue && newValue <= maxValue,
                        );

                        await expect(saplingPoolContext.connect(staker).setStakerEarnFactorMax(newValue)).to.be
                            .reverted;
                    });
                });
            });
        });

        describe('Close Pool', function () {
            it('Staker can close the pool', async function () {
                await saplingPoolContext.connect(staker).close();
                expect(await saplingPoolContext.closed()).to.equal(true);
            });

            describe('Rejection scenarios', function () {
                it('Closing the pool with a non-zero borrowed amount should fail', async function () {
                    let stakeAmount = BigNumber.from(2000).mul(TOKEN_MULTIPLIER);
                    let depositAmount = BigNumber.from(10000).mul(TOKEN_MULTIPLIER);

                    await mintAndApprove(liquidityToken, deployer, staker, saplingPoolContext.address, stakeAmount);
                    await saplingPoolContext.connect(staker).stake(stakeAmount);

                    await mintAndApprove(liquidityToken, deployer, lender1, saplingPoolContext.address, depositAmount);
                    await saplingPoolContext.connect(lender1).deposit(depositAmount);

                    let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
                    let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);
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

                    await expect(saplingPoolContext.connect(staker).close()).to.be.reverted;
                });
            });
        });

        describe('Staking', function () {
            after(async function () {
                await rollback(evmSnapshotIds);
            });

            before(async function () {
                await snapshot(evmSnapshotIds);

                await mintAndApprove(liquidityToken, deployer, staker, saplingPoolContext.address, stakeAmount);
            });

            it('Staker can stake', async function () {
                await expect(saplingPoolContext.connect(staker).stake(stakeAmount)).to.changeTokenBalances(
                    liquidityToken,
                    [staker.address, saplingPoolContext.address],
                    [-stakeAmount, stakeAmount],
                );
                expect(await saplingPoolContext.balanceStaked()).to.equal(stakeAmount);
            });

            it('Stake is reflected on pool liquidity', async function () {
                let prevLiquidity = await liquidityToken.balanceOf(saplingPoolContext.address);
                await saplingPoolContext.connect(staker).stake(stakeAmount);
                let liquidity = await liquidityToken.balanceOf(saplingPoolContext.address);

                expect(liquidity).to.equal(prevLiquidity.add(stakeAmount));
            });

            it('Stake is reflected on pool funds', async function () {
                let prevPoolFunds = await saplingPoolContext.poolFunds();
                await saplingPoolContext.connect(staker).stake(stakeAmount);
                let poolFunds = await saplingPoolContext.poolFunds();

                expect(poolFunds).to.equal(prevPoolFunds.add(stakeAmount));
            });

            it('Stake adjusts pool funds limit', async function () {
                let targetStakePercent = (await saplingPoolContext.config()).targetStakePercent;
                let oneHundredPercent = await saplingMath.HUNDRED_PERCENT();

                await saplingPoolContext.connect(staker).stake(stakeAmount);
                let limit = await saplingPoolContext.poolFundsLimit();

                expect(limit).to.equal(stakeAmount.mul(oneHundredPercent / targetStakePercent));
            });

            it('Staker cannot stake on a failed pool', async function () {
                await saplingPoolContext.connect(staker).stake(stakeAmount);

                let depositAmount = BigNumber.from(10000).mul(TOKEN_MULTIPLIER);
                await mintAndApprove(liquidityToken, deployer, lender1, saplingPoolContext.address, depositAmount);
                await saplingPoolContext.connect(lender1).deposit(depositAmount);

                let loanAmount = await saplingPoolContext.poolFunds();
                let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);

                let requestLoanTx = await loanDesk
                    .connect(borrower1)
                    .requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
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

                let loanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0].args.loanId;

                let loan = await loanDesk.loans(loanId);
                await skipEvmTime(loan.duration.add(loan.gracePeriod).toNumber());

                await loanDesk.connect(staker).defaultLoan(loanId);

                assertHardhatInvariant((await saplingPoolContext.balanceStaked()).eq(0));
                assertHardhatInvariant((await saplingPoolContext.poolFunds()).eq(0));

                await mintAndApprove(liquidityToken, deployer, staker, saplingPoolContext.address, stakeAmount);
                await expect(saplingPoolContext.connect(staker).stake(stakeAmount)).to.be.revertedWith(
                    'SaplingPoolContext: share price too low',
                );
            });

            describe('Rejection scenarios', function () {
                it('Staking a zero amount should fail', async function () {
                    await expect(saplingPoolContext.connect(staker).stake(0)).to.be.reverted;
                });

                it('Staking when the pool is paused should fail', async function () {
                    await saplingPoolContext.connect(governance).pause();
                    await expect(saplingPoolContext.connect(staker).stake(stakeAmount)).to.be.reverted;
                });

                it('Staking when the pool is closed should fail', async function () {
                    await saplingPoolContext.connect(staker).close();
                    await expect(saplingPoolContext.connect(staker).stake(stakeAmount)).to.be.reverted;
                });

                it('Staking as the protocol should fail', async function () {
                    await mintAndApprove(liquidityToken, deployer, protocol, saplingPoolContext.address, stakeAmount);
                    await expect(saplingPoolContext.connect(protocol).stake(stakeAmount)).to.be.reverted;
                });

                it('Staking as the governance should fail', async function () {
                    await mintAndApprove(liquidityToken, deployer, governance, saplingPoolContext.address, stakeAmount);
                    await expect(saplingPoolContext.connect(governance).stake(stakeAmount)).to.be.reverted;
                });

                it('Staking as a lender should fail', async function () {
                    await mintAndApprove(liquidityToken, deployer, lender1, saplingPoolContext.address, stakeAmount);
                    await expect(saplingPoolContext.connect(lender1).stake(stakeAmount)).to.be.reverted;
                });

                it('Staking as a borrower should fail', async function () {
                    let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
                    let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);
                    await loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);

                    await mintAndApprove(liquidityToken, deployer, borrower1, saplingPoolContext.address, stakeAmount);
                    await expect(saplingPoolContext.connect(borrower1).stake(stakeAmount)).to.be.reverted;
                });
            });
        });

        describe('Unstaking', function () {
            after(async function () {
                await rollback(evmSnapshotIds);
            });

            before(async function () {
                await snapshot(evmSnapshotIds);
                await saplingPoolContext.connect(staker).stake(stakeAmount);
                await saplingPoolContext.connect(lender1).deposit(depositAmount.sub(10 ** TOKEN_DECIMALS));
            });

            it('Staker can unstake', async function () {
                let exitFee = unstakeAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT);
                let exitFeeGain = exitFee
                    .mul(stakeAmount.sub(unstakeAmount))
                    .div(depositAmount.add(stakeAmount.sub(unstakeAmount)));
                let balanceDelta = unstakeAmount.sub(exitFee);

                let stakedBalance = await saplingPoolContext.balanceStaked();
                await expect(saplingPoolContext.connect(staker).unstake(unstakeAmount)).to.changeTokenBalances(
                    liquidityToken,
                    [staker.address, saplingPoolContext.address],
                    [balanceDelta, -balanceDelta],
                );

                expect(await saplingPoolContext.balanceStaked()).to.equal(
                    stakedBalance.sub(unstakeAmount).add(exitFeeGain),
                );
            });

            describe('Amount Unstakable', function () {
                it('Can view amount unstakable', async function () {
                    let expectedUnstakable = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);

                    expect(await saplingPoolContext.amountUnstakable()).to.equal(expectedUnstakable);
                });

                it('Amount unstakable is zero when pool is paused', async function () {
                    await saplingPoolContext.connect(governance).pause();
                    expect(await saplingPoolContext.amountUnstakable()).to.equal(0);
                });
            });

            it('Staker can unstake full unstakable amount', async function () {
                let requestAmount = depositAmount.sub(10 ** TOKEN_DECIMALS);
                await saplingPoolContext.connect(lender1).requestWithdrawalAllowance(requestAmount);
                await skipEvmTime(61);

                await saplingPoolContext.connect(lender1).withdraw(requestAmount);

                let amount = await saplingPoolContext.amountUnstakable();
                let exitFee = amount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT);
                let balanceDelta = amount.sub(exitFee);

                await expect(saplingPoolContext.connect(staker).unstake(amount)).to.changeTokenBalances(
                    liquidityToken,
                    [staker.address, saplingPoolContext.address],
                    [balanceDelta, -balanceDelta],
                );
            });

            it('Unstaking is reflected on the pool contract balance', async function () {
                let prevBalance = await liquidityToken.balanceOf(saplingPoolContext.address);

                await saplingPoolContext.connect(staker).unstake(unstakeAmount);

                let balance = await liquidityToken.balanceOf(saplingPoolContext.address);

                expect(balance).to.equal(
                    prevBalance.sub(unstakeAmount).add(unstakeAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT)),
                );
            });

            it('Unstaking is reflected on pool liquidity', async function () {
                let prevLiquidity = await liquidityToken.balanceOf(saplingPoolContext.address);

                await saplingPoolContext.connect(staker).unstake(unstakeAmount);

                let liquidity = await liquidityToken.balanceOf(saplingPoolContext.address);

                expect(liquidity).to.equal(
                    prevLiquidity.sub(unstakeAmount).add(unstakeAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT)),
                );
            });

            it('Unstaking is reflected on pool funds', async function () {
                let prevPoolFunds = await saplingPoolContext.poolFunds();

                await saplingPoolContext.connect(staker).unstake(unstakeAmount);

                let poolFunds = await saplingPoolContext.poolFunds();

                expect(poolFunds).to.equal(
                    prevPoolFunds.sub(unstakeAmount).add(unstakeAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT)),
                );
            });

            describe('Rejection scenarios', function () {
                it('Unstaking a zero amount should fail', async function () {
                    await expect(saplingPoolContext.connect(staker).unstake(0)).to.be.reverted;
                });

                it('Unstaking an amount greater than unstakable should fail', async function () {
                    let amountUnstakable = await saplingPoolContext.amountUnstakable();
                    await expect(saplingPoolContext.connect(staker).unstake(amountUnstakable.add(1))).to.be.reverted;
                });

                it('Unstaking when the pool is paused should fail', async function () {
                    await saplingPoolContext.connect(governance).pause();
                    await expect(saplingPoolContext.connect(staker).unstake(unstakeAmount)).to.be.reverted;
                });

                it('Unstaking as the protocol should fail', async function () {
                    await expect(saplingPoolContext.connect(protocol).unstake(unstakeAmount)).to.be.reverted;
                });

                it('Unstaking as the governance should fail', async function () {
                    await expect(saplingPoolContext.connect(governance).unstake(unstakeAmount)).to.be.reverted;
                });

                it('Unstaking as a lender should fail', async function () {
                    await expect(saplingPoolContext.connect(lender1).unstake(unstakeAmount)).to.be.reverted;
                });

                it('Unstaking as a borrower should fail', async function () {
                    let loanAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
                    let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);
                    await loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);

                    await expect(saplingPoolContext.connect(borrower1).unstake(unstakeAmount)).to.be.reverted;
                });
            });
        });

        describe('Deposits', function () {
            after(async function () {
                await rollback(evmSnapshotIds);
            });

            before(async function () {
                await snapshot(evmSnapshotIds);

                await saplingPoolContext.connect(staker).stake(stakeAmount);
            });

            it('Lender can deposit', async function () {
                await expect(saplingPoolContext.connect(lender1).deposit(depositAmount))
                    .to.changeTokenBalances(
                        liquidityToken,
                        [lender1.address, saplingPoolContext.address],
                        [-depositAmount, depositAmount],
                    )
                    .and.to.changeTokenBalance(saplingPoolContext, lender1.address, depositAmount);

                // expect(await saplingPoolContext.balanceOf(lender1.address)).to.equal(depositAmount);
            });

            it('Deposit is reflected on the pool contract balance', async function () {
                let prevBalance = await liquidityToken.balanceOf(saplingPoolContext.address);

                await mintAndApprove(liquidityToken, deployer, lender1, saplingPoolContext.address, depositAmount);
                await saplingPoolContext.connect(lender1).deposit(depositAmount);

                let balance = await liquidityToken.balanceOf(saplingPoolContext.address);
                expect(balance).to.equal(prevBalance.add(depositAmount));
            });

            it('Deposit is reflected on pool liquidity', async function () {
                let prevLiquidity = await liquidityToken.balanceOf(saplingPoolContext.address);

                await mintAndApprove(liquidityToken, deployer, lender1, saplingPoolContext.address, depositAmount);
                await saplingPoolContext.connect(lender1).deposit(depositAmount);

                let liquidity = await liquidityToken.balanceOf(saplingPoolContext.address);

                expect(liquidity).to.equal(prevLiquidity.add(depositAmount));
            });

            it('Deposit is reflected on pool funds', async function () {
                let prevPoolFunds = await saplingPoolContext.poolFunds();

                await mintAndApprove(liquidityToken, deployer, lender1, saplingPoolContext.address, depositAmount);
                await saplingPoolContext.connect(lender1).deposit(depositAmount);

                let poolFunds = await saplingPoolContext.poolFunds();

                expect(poolFunds).to.equal(prevPoolFunds.add(depositAmount));
            });

            describe('Amount depositable', function () {
                it('Can view amount depositable', async function () {
                    let targetStakePercent = (await saplingPoolContext.config()).targetStakePercent;
                    let ONE_HUNDRED_PERCENT = await saplingMath.HUNDRED_PERCENT();
                    let calculatedDepositable = stakeAmount
                        .mul(ONE_HUNDRED_PERCENT)
                        .div(targetStakePercent)
                        .sub(stakeAmount)
                        .sub(10 ** TOKEN_DECIMALS);

                    expect(await saplingPoolContext.amountDepositable()).to.equal(calculatedDepositable);
                });

                it('Amount depositable is zero when pool is paused', async function () {
                    await saplingPoolContext.connect(governance).pause();
                    expect(await saplingPoolContext.amountDepositable()).to.equal(0);
                });

                it('Amount depositable is zero when pool is closed', async function () {
                    await saplingPoolContext.connect(staker).close();
                    expect(await saplingPoolContext.amountDepositable()).to.equal(0);
                });

                it('Amount depositable is zero when pool is full', async function () {
                    let targetStakePercent = (await saplingPoolContext.config()).targetStakePercent;
                    let ONE_HUNDRED_PERCENT = await saplingMath.HUNDRED_PERCENT();
                    let calculatedDepositable = stakeAmount
                        .mul(ONE_HUNDRED_PERCENT)
                        .div(targetStakePercent)
                        .sub(stakeAmount)
                        .sub(10 ** TOKEN_DECIMALS);

                    await mintAndApprove(
                        liquidityToken,
                        deployer,
                        lender1,
                        saplingPoolContext.address,
                        calculatedDepositable,
                    );
                    await saplingPoolContext.connect(lender1).deposit(calculatedDepositable);
                    expect(await saplingPoolContext.amountDepositable()).to.equal(0);
                });
            });

            describe('Rejection scenarios', function () {
                it('Depositing a zero amount should fail', async function () {
                    await mintAndApprove(liquidityToken, deployer, lender1, saplingPoolContext.address, depositAmount);
                    await expect(saplingPoolContext.connect(lender1).deposit(0)).to.be.reverted;
                });

                it('Depositing an amount greater than allowed should fail', async function () {
                    let amountDepositable = await saplingPoolContext.amountDepositable();

                    await mintAndApprove(
                        liquidityToken,
                        deployer,
                        lender1,
                        saplingPoolContext.address,
                        amountDepositable.add(1),
                    );
                    await expect(saplingPoolContext.connect(lender1).deposit(amountDepositable.add(1))).to.be.reverted;
                });

                it('Depositing when the pool is paused should fail', async function () {
                    await saplingPoolContext.connect(governance).pause();
                    await mintAndApprove(liquidityToken, deployer, lender1, saplingPoolContext.address, depositAmount);
                    await expect(saplingPoolContext.connect(lender1).deposit(depositAmount)).to.be.reverted;
                });

                it('Depositing when the pool is closed should fail', async function () {
                    await saplingPoolContext.connect(staker).close();
                    await mintAndApprove(liquidityToken, deployer, lender1, saplingPoolContext.address, depositAmount);
                    await expect(saplingPoolContext.connect(lender1).deposit(depositAmount)).to.be.reverted;
                });

                it('Depositing as the staker should fail', async function () {
                    await mintAndApprove(liquidityToken, deployer, staker, saplingPoolContext.address, depositAmount);
                    await expect(saplingPoolContext.connect(staker).deposit(depositAmount)).to.be.reverted;
                });

                it('Depositing as the governance should fail', async function () {
                    await mintAndApprove(
                        liquidityToken,
                        deployer,
                        governance,
                        saplingPoolContext.address,
                        depositAmount,
                    );
                    await expect(saplingPoolContext.connect(governance).deposit(depositAmount)).to.be.reverted;
                });
            });
        });

        describe('Withdrawals', function () {
            after(async function () {
                await rollback(evmSnapshotIds);
            });

            before(async function () {
                await snapshot(evmSnapshotIds);

                await saplingPoolContext.connect(staker).stake(stakeAmount);
                await saplingPoolContext.connect(lender1).deposit(depositAmount);
            });

            it('Lender can withdraw', async function () {
                let tokenBalanceBefore = await liquidityToken.balanceOf(lender1.address);
                let poolBalanceBefore = await saplingPoolContext.balanceOf(lender1.address);

                let exitFee = withdrawAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT);
                let exitFeeGain = exitFee
                    .mul(depositAmount.sub(withdrawAmount))
                    .div(stakeAmount.add(depositAmount.sub(withdrawAmount)).add(10 ** TOKEN_DECIMALS));

                await saplingPoolContext.connect(lender1).requestWithdrawalAllowance(withdrawAmount);
                await skipEvmTime(61);

                await saplingPoolContext.connect(lender1).withdraw(withdrawAmount);
                expect(await saplingPoolContext.balanceOf(lender1.address)).to.equal(
                    poolBalanceBefore.sub(withdrawAmount).add(exitFeeGain),
                );

                expect(await liquidityToken.balanceOf(lender1.address)).to.equal(
                    tokenBalanceBefore.add(withdrawAmount).sub(exitFee),
                );
            });

            it('Withdraw is reflected on the pool contract balance', async function () {
                let prevBalance = await liquidityToken.balanceOf(saplingPoolContext.address);

                await saplingPoolContext.connect(lender1).requestWithdrawalAllowance(withdrawAmount);
                await skipEvmTime(61);

                await saplingPoolContext.connect(lender1).withdraw(withdrawAmount);

                let balance = await liquidityToken.balanceOf(saplingPoolContext.address);
                expect(balance).to.equal(
                    prevBalance.sub(withdrawAmount).add(withdrawAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT)),
                );
            });

            it('Withdraw is reflected on pool liquidity', async function () {
                let prevLiquidity = await liquidityToken.balanceOf(saplingPoolContext.address);

                await saplingPoolContext.connect(lender1).requestWithdrawalAllowance(withdrawAmount);
                await skipEvmTime(61);

                await saplingPoolContext.connect(lender1).withdraw(withdrawAmount);

                let liquidity = await liquidityToken.balanceOf(saplingPoolContext.address);

                expect(liquidity).to.equal(
                    prevLiquidity.sub(withdrawAmount).add(withdrawAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT)),
                );
            });

            it('Withdraw is reflected on pool funds', async function () {
                let prevPoolFunds = await saplingPoolContext.poolFunds();

                await saplingPoolContext.connect(lender1).requestWithdrawalAllowance(withdrawAmount);
                await skipEvmTime(61);

                await saplingPoolContext.connect(lender1).withdraw(withdrawAmount);

                let poolFunds = await saplingPoolContext.poolFunds();

                expect(poolFunds).to.equal(
                    prevPoolFunds.sub(withdrawAmount).add(withdrawAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT)),
                );
            });

            it('Withdrawal should charge an exit fee', async function () {
                let tokenBalanceBefore = await liquidityToken.balanceOf(lender1.address);

                let expectedWithdrawalFee = withdrawAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT);

                await saplingPoolContext.connect(lender1).requestWithdrawalAllowance(withdrawAmount);
                await skipEvmTime(61);

                await saplingPoolContext.connect(lender1).withdraw(withdrawAmount);

                expect(await liquidityToken.balanceOf(lender1.address)).to.equal(
                    tokenBalanceBefore.add(withdrawAmount.sub(expectedWithdrawalFee)),
                );
            });

            describe('Rejection scenarios', function () {
                it('Withdrawing a zero amount should fail', async function () {
                    await saplingPoolContext.connect(lender1).requestWithdrawalAllowance(withdrawAmount);
                    await skipEvmTime(61);

                    await expect(saplingPoolContext.connect(lender1).withdraw(0)).to.be.reverted;
                });

                it("Withdrawing an amount greater than lender's balance should fail", async function () {
                    let balance = await saplingPoolContext.balanceOf(lender1.address);
                    await expect(saplingPoolContext.connect(lender1).withdraw(balance.add(1))).to.be.reverted;
                });

                it('Withdrawing an amount greater than available should fail', async function () {
                    let gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                    let installments = 1;
                    let apr = (await loanDesk.loanTemplate()).apr;
                    let loanAmount = BigNumber.from(5000).mul(TOKEN_MULTIPLIER);
                    let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);

                    await loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
                    let otherApplicationId = await loanDesk.recentApplicationIdOf(borrower1.address);
                    await loanDesk
                        .connect(staker)
                        .draftOffer(otherApplicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);
                    await loanDesk.connect(staker).lockDraftOffer(otherApplicationId);
                    await skipEvmTime(2 * 24 * 60 * 60 + 1);
                    await loanDesk.connect(staker).offerLoan(otherApplicationId);
                    await loanDesk.connect(borrower1).borrow(otherApplicationId);

                    let amountWithdrawable = await saplingPoolContext.amountWithdrawable(lender1.address);

                    await saplingPoolContext.connect(lender1).requestWithdrawalAllowance(amountWithdrawable.add(1));
                    await skipEvmTime(61);

                    await expect(saplingPoolContext.connect(lender1).withdraw(amountWithdrawable.add(1))).to.be
                        .reverted;
                });

                it('Withdrawing when the pool is paused should fail', async function () {
                    await saplingPoolContext.connect(lender1).requestWithdrawalAllowance(withdrawAmount);
                    await skipEvmTime(61);

                    await saplingPoolContext.connect(governance).pause();

                    await expect(saplingPoolContext.connect(lender1).withdraw(withdrawAmount)).to.be.reverted;
                });

                it('Withdrawing as the staker should fail', async function () {
                    let balance = await saplingPoolContext.balanceStaked();

                    await expect(saplingPoolContext.connect(staker).requestWithdrawalAllowance(balance.div(10))).to.be
                        .reverted;
                });

                it('Withdrawing as a borrower should fail', async function () {
                    let gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                    let installments = 1;
                    let apr = (await loanDesk.loanTemplate()).apr;

                    await loanDesk.connect(borrower2).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
                    let otherApplicationId = await loanDesk.recentApplicationIdOf(borrower2.address);
                    await loanDesk
                        .connect(staker)
                        .draftOffer(otherApplicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);

                    await expect(saplingPoolContext.connect(borrower2).requestWithdrawalAllowance(loanAmount)).to.be
                        .reverted;

                    await expect(saplingPoolContext.connect(borrower2).withdraw(loanAmount)).to.be.reverted;
                });
            });

            describe('Protocol fees', function () {
                after(async function () {
                    await rollback(evmSnapshotIds);
                });

                before(async function () {
                    await snapshot(evmSnapshotIds);

                    let gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                    let installments = 1;
                    let apr = (await loanDesk.loanTemplate()).apr;

                    let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);

                    await loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
                    let applicationId = await loanDesk.recentApplicationIdOf(borrower1.address);
                    await loanDesk
                        .connect(staker)
                        .draftOffer(applicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);
                    await loanDesk.connect(staker).lockDraftOffer(applicationId);
                    await skipEvmTime(2 * 24 * 60 * 60 + 1);
                    await loanDesk.connect(staker).offerLoan(applicationId);
                    let tx = await loanDesk.connect(borrower1).borrow(applicationId);
                    let loanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0].args.loanId;

                    await skipEvmTime(loanDuration.toNumber() - 10);
                });

                it('Treasury earns protocol fee on paid interest', async function () {
                    let paymentAmount = await loanDesk.loanBalanceDue(1);
                    paymentAmount = paymentAmount.sub(loanAmount);

                    await mintAndApprove(
                        liquidityToken,
                        deployer,
                        borrower1,
                        saplingPoolContext.address,
                        paymentAmount,
                    );

                    await expect(loanDesk.connect(borrower1).repay(1, paymentAmount)).to.changeTokenBalance(
                        liquidityToken,
                        protocol.address,
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

                await saplingPoolContext.connect(staker).stake(stakeAmount);

                await mintAndApprove(liquidityToken, deployer, lender1, saplingPoolContext.address, depositAmount);
                await saplingPoolContext.connect(lender1).deposit(depositAmount);

                poolFunds = stakeAmount.add(depositAmount).add(10 ** TOKEN_DECIMALS);

                await loanDesk.connect(borrower1).requestLoan(loanAmount, loanDuration, NIL_UUID, NIL_DIGEST);
                let applicationId = await loanDesk.recentApplicationIdOf(borrower1.address);
                let application = await loanDesk.loanApplications(applicationId);

                let gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                let installments = 1;
                let apr = (await loanDesk.loanTemplate()).apr;

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
                await loanDesk.connect(borrower1).borrow(applicationId);
            });

            it('Can view lender APY given current pool state', async function () {
                let apr = (await loanDesk.loanTemplate()).apr;
                let protocolEarningPercent = (await saplingPoolContext.config()).protocolFeePercent;
                let ONE_HUNDRED_PERCENT = await saplingMath.HUNDRED_PERCENT();
                let stakerEarnFactor = (await saplingPoolContext.config()).stakerEarnFactor;

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

                let apyBreakdown = await saplingPoolContext.currentAPY();
                expect(apyBreakdown.lenderComponent).to.equal(expectedLenderAPY);
            });

            it('Can view projected lender APY', async function () {
                let apr = (await loanDesk.loanTemplate()).apr;
                let protocolEarningPercent = (await saplingPoolContext.config()).protocolFeePercent;
                let ONE_HUNDRED_PERCENT = await saplingMath.HUNDRED_PERCENT();
                let stakerEarnFactor = (await saplingPoolContext.config()).stakerEarnFactor;

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
                        await saplingPoolContext.projectedAPYBreakdown(
                            await poolToken.totalSupply(),
                            (
                                await saplingPoolContext.balances()
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
                let apr = (await loanDesk.loanTemplate()).apr;
                let protocolEarningPercent = (await saplingPoolContext.config()).protocolFeePercent;
                let ONE_HUNDRED_PERCENT = await saplingMath.HUNDRED_PERCENT();
                let stakerEarnFactor = (await saplingPoolContext.config()).stakerEarnFactor;

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

                expect(
                    (
                        await saplingPoolContext.projectedAPYBreakdown(
                            await poolToken.totalSupply(),
                            (
                                await saplingPoolContext.balances()
                            ).stakedShares,
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
                        await saplingPoolContext.projectedAPYBreakdown(
                            await poolToken.totalSupply(),
                            (
                                await saplingPoolContext.balances()
                            ).stakedShares,
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
                    let apr = (await loanDesk.loanTemplate()).apr;
                    await expect(
                        saplingPoolContext.projectedAPYBreakdown(
                            await poolToken.totalSupply(),
                            (
                                await saplingPoolContext.balances()
                            ).stakedShares,
                            poolFunds,
                            poolFunds.add(1),
                            apr,
                            (
                                await saplingPoolContext.config()
                            ).protocolFeePercent,
                            (
                                await saplingPoolContext.config()
                            ).stakerEarnFactor,
                        ),
                    ).to.be.reverted;
                });
            });
        });
    });
});
