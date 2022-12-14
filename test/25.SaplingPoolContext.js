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

describe('Sapling Pool Context (via SaplingLendingPool)', function () {
    const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
    const TOKEN_DECIMALS = 6;

    const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
    const GOVERNANCE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("GOVERNANCE_ROLE"));
    const TREASURY_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("TREASURY_ROLE"));
    const PAUSER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("PAUSER_ROLE"));
    const POOL_1_MANAGER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("POOL_1_MANAGER_ROLE"));

    let coreAccessControl;

    let SaplingPoolContextCF;
    let saplingPoolContext;
    let liquidityToken;
    let poolToken;
    let loanDesk;
    let saplingMath;

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

        await coreAccessControl.connect(governance).grantRole(POOL_1_MANAGER_ROLE, manager.address);

        let SaplingLendingPoolCF = await ethers.getContractFactory('SaplingLendingPool');
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

        SaplingPoolContextCF = SaplingLendingPoolCF;
        saplingPoolContext = lendingPool;

        saplingMath = await (await ethers.getContractFactory('SaplingMath')).deploy();

        await lendingPool.connect(manager).open();
        await loanDesk.connect(manager).open();
    });

    describe('Deployment', function () {
        it('Can deploy', async function () {
            await expect(
                upgrades.deployProxy(SaplingPoolContextCF, [
                    poolToken.address,
                    liquidityToken.address,
                    coreAccessControl.address,
            POOL_1_MANAGER_ROLE,
                ]),
            ).to.be.not.reverted;
        });

        describe('Rejection Scenarios', function () {
            it('Deploying with null liquidity token address should fail', async function () {
                await expect(
                    upgrades.deployProxy(SaplingPoolContextCF, [
                        poolToken.address,
                        NULL_ADDRESS,
                        coreAccessControl.address,
                        POOL_1_MANAGER_ROLE,
                    ]),
                ).to.be.reverted;
            });

            it('Deploying with null pool token address should fail', async function () {
                await expect(
                    upgrades.deployProxy(SaplingPoolContextCF, [
                        NULL_ADDRESS,
                        liquidityToken.address,
                        coreAccessControl.address,
                        POOL_1_MANAGER_ROLE,
                    ]),
                ).to.be.reverted;
            });

            it('Deploying with a pool token with non-zero total supply should fail', async function () {
                let badPoolToken = await (
                    await ethers.getContractFactory('PoolToken')
                ).deploy('Sapling Test Lending Pool Token', 'SLPT', TOKEN_DECIMALS);

                await badPoolToken.connect(deployer).mint(addresses[0].address, 1);

                await expect(
                    upgrades.deployProxy(SaplingPoolContextCF, [
                        badPoolToken.address,
                        liquidityToken.address,
                        coreAccessControl.address,
                        POOL_1_MANAGER_ROLE,
                    ]),
                ).to.be.reverted;
            });
        });
    });

    describe('Use Cases', function () {
        let PERCENT_DECIMALS;
        let TOKEN_MULTIPLIER;
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
            TOKEN_MULTIPLIER = BigNumber.from(10).pow(TOKEN_DECIMALS);
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

            await liquidityToken.connect(deployer).mint(manager.address, stakeAmount);
            await liquidityToken.connect(manager).approve(saplingPoolContext.address, stakeAmount);

            await liquidityToken.connect(deployer).mint(lender1.address, depositAmount);
            await liquidityToken.connect(lender1).approve(saplingPoolContext.address, depositAmount);
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
                let maxValue = 10 * 10 ** PERCENT_DECIMALS;
                let defaultValue = 10 * 10 ** PERCENT_DECIMALS;

                expect((await saplingPoolContext.config()).maxProtocolFeePercent).to.equal(maxValue);
                expect((await saplingPoolContext.config()).protocolFeePercent)
                    .to.equal(defaultValue)
                    .and.gte(minValue)
                    .and.lte(maxValue);
            });

            it("Manager's earn factor is correct", async function () {
                let minValue = 100 * 10 ** PERCENT_DECIMALS;
                let maxValue = 1000 * 10 ** PERCENT_DECIMALS;
                let defaultValue = 150 * 10 ** PERCENT_DECIMALS;

                expect((await saplingPoolContext.config()).managerEarnFactorMax).to.equal(maxValue);
                expect((await saplingPoolContext.config()).managerEarnFactor)
                    .to.equal(defaultValue)
                    .and.gte(minValue)
                    .and.lte(maxValue);
            });

            it('Exit fee is correct', async function () {
                expect(exitFeePercent).to.equal(0.5 * 10 ** PERCENT_DECIMALS);
            });

            it('Empty pool lenderAPY is correct', async function () {
                expect(await saplingPoolContext.currentLenderAPY()).to.equal(0);
            });

            it('Initial balances are correct', async function () {
                expect((await saplingPoolContext.balances()).tokenBalance).to.equal(0);
                expect(await poolToken.totalSupply()).to.equal(0);
                expect((await saplingPoolContext.balances()).stakedShares).to.equal(0);
                expect(await saplingPoolContext.poolFundsLimit()).to.equal(0);
                expect((await saplingPoolContext.balances()).poolFunds).to.equal(0);
                expect((await saplingPoolContext.balances()).rawLiquidity).to.equal(0);
                expect((await saplingPoolContext.balances()).strategizedFunds).to.equal(0);
                expect((await saplingPoolContext.balances()).allocatedFunds).to.equal(0);
                expect((await saplingPoolContext.balances()).managerRevenue).to.equal(0);
                expect((await saplingPoolContext.balances()).protocolRevenue).to.equal(0);
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

                        await expect(saplingPoolContext.connect(manager).setTargetStakePercent(newValue)).to.be
                            .reverted;
                    });
                });
            });

            describe('Target liquidity percent', function () {
                it('Manager can set target liquidity percent', async function () {
                    let currentValue = (await saplingPoolContext.config()).targetLiquidityPercent;
                    let maxValue = await saplingMath.HUNDRED_PERCENT();

                    let newValue = 50 * 10 ** PERCENT_DECIMALS;
                    assertHardhatInvariant(newValue != currentValue && newValue <= maxValue);

                    await saplingPoolContext.connect(manager).setTargetLiquidityPercent(newValue);
                    expect((await saplingPoolContext.config()).targetLiquidityPercent).to.equal(newValue);
                });

                describe('Rejection scenarios', function () {
                    it('Target liquidity percent cannot be set to a value greater than the allowed maximum', async function () {
                        let currentValue = (await saplingPoolContext.config()).targetLiquidityPercent;
                        let maxValue = await saplingMath.HUNDRED_PERCENT();

                        await expect(saplingPoolContext.connect(manager).setTargetLiquidityPercent(maxValue + 1)).to.be
                            .reverted;
                    });

                    it('A non-manager cannot set target liquidity percent', async function () {
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
                    let maxValue = (await saplingPoolContext.config()).maxProtocolFeePercent;

                    let newValue = 2 * 10 ** PERCENT_DECIMALS;
                    assertHardhatInvariant(newValue != currentValue && newValue <= maxValue);

                    await saplingPoolContext.connect(governance).setProtocolEarningPercent(newValue);
                    expect((await saplingPoolContext.config()).protocolFeePercent).to.equal(newValue);
                });

                describe('Rejection scenarios', function () {
                    it('Protocol fee percent cannot be set to a value greater than the allowed maximum', async function () {
                        let currentValue = (await saplingPoolContext.config()).protocolFeePercent;
                        let maxValue = (await saplingPoolContext.config()).maxProtocolFeePercent;

                        await expect(saplingPoolContext.connect(governance).setProtocolEarningPercent(maxValue + 1)).to
                            .be.reverted;
                    });

                    it('A non-governance cannot set protocol fee percent', async function () {
                        let currentValue = (await saplingPoolContext.config()).protocolFeePercent;
                        let maxValue = (await saplingPoolContext.config()).maxProtocolFeePercent;

                        let newValue = 2 * 10 ** PERCENT_DECIMALS;
                        assertHardhatInvariant(newValue != currentValue && newValue <= maxValue);

                        await expect(saplingPoolContext.connect(manager).setProtocolEarningPercent(newValue)).to.be
                            .reverted;
                    });
                });
            });

            describe("Manager's earn factor", function () {
                it("Manager can set manager's earn factor", async function () {
                    let currentValue = (await saplingPoolContext.config()).managerEarnFactor;
                    let minValue = await saplingMath.HUNDRED_PERCENT();
                    let maxValue = (await saplingPoolContext.config()).managerEarnFactorMax;

                    let newValue = 125 * 10 ** PERCENT_DECIMALS;
                    assertHardhatInvariant(newValue != currentValue && minValue <= newValue && newValue <= maxValue);

                    await saplingPoolContext.connect(manager).setManagerEarnFactor(newValue);
                    expect((await saplingPoolContext.config()).managerEarnFactor).to.equal(newValue);
                });

                it("Manager's earn factor can be set while the pool is paused", async function () {
                    let currentValue = (await saplingPoolContext.config()).managerEarnFactor;
                    let minValue = await saplingMath.HUNDRED_PERCENT();
                    let maxValue = (await saplingPoolContext.config()).managerEarnFactorMax;

                    let newValue = 125 * 10 ** PERCENT_DECIMALS;
                    assertHardhatInvariant(
                        newValue != currentValue && minValue <= newValue && newValue <= maxValue,
                    );

                    await saplingPoolContext.connect(governance).pause();

                    await expect(saplingPoolContext.connect(manager).setManagerEarnFactor(newValue)).to.be.not.reverted;
                });

                describe('Rejection scenarios', function () {
                    it("Manager's earn factor cannot be set to a value less than the allowed minimum", async function () {
                        let minValue = await saplingMath.HUNDRED_PERCENT();
                        assertHardhatInvariant(minValue > 0);
                        await expect(saplingPoolContext.connect(manager).setManagerEarnFactor(minValue - 1)).to.be
                            .reverted;
                    });

                    it("Manager's earn factor cannot be set to a value greater than the allowed maximum", async function () {
                        let maxValue = (await saplingPoolContext.config()).managerEarnFactorMax;
                        await expect(saplingPoolContext.connect(manager).setManagerEarnFactor(maxValue + 1)).to.be
                            .reverted;
                    });

                    it("A non-manager cannot set manager's earn factor", async function () {
                        let currentValue = (await saplingPoolContext.config()).managerEarnFactor;
                        let minValue = await saplingMath.HUNDRED_PERCENT();
                        let maxValue = (await saplingPoolContext.config()).managerEarnFactorMax;

                        let newValue = 125 * 10 ** PERCENT_DECIMALS;
                        assertHardhatInvariant(
                            newValue != currentValue && minValue <= newValue && newValue <= maxValue,
                        );

                        await expect(saplingPoolContext.connect(governance).setManagerEarnFactor(newValue)).to.be
                            .reverted;
                    });
                });
            });

            describe("Maximum for Manager's earn factor", function () {
                it("Governance can set a maximum for manager's earn factor", async function () {
                    let currentValue = (await saplingPoolContext.config()).managerEarnFactorMax;
                    let minValue = await saplingMath.HUNDRED_PERCENT();

                    let newValue = currentValue - 1;
                    assertHardhatInvariant(currentValue >= minValue);

                    await saplingPoolContext.connect(governance).setManagerEarnFactorMax(newValue);
                    expect((await saplingPoolContext.config()).managerEarnFactorMax).to.equal(newValue);
                });

                it("Setting the maximum for manager's earn factor to less than current earn factor value will update the current earn factor", async function () {
                    let prevEarnFactor = (await saplingPoolContext.config()).managerEarnFactor;
                    let currentValue = (await saplingPoolContext.config()).managerEarnFactorMax;
                    let minValue = await saplingMath.HUNDRED_PERCENT();

                    let newValue = prevEarnFactor - 1;
                    assertHardhatInvariant(currentValue >= minValue);

                    await saplingPoolContext.connect(governance).setManagerEarnFactorMax(newValue);
                    expect((await saplingPoolContext.config()).managerEarnFactorMax).to.equal(newValue);
                    expect((await saplingPoolContext.config()).managerEarnFactor).to.equal(newValue);
                });

                describe('Rejection scenarios', function () {
                    it("Maximum for Manager's earn factor cannot be set to a value less than the allowed minimum", async function () {
                        let minValue = await saplingMath.HUNDRED_PERCENT();
                        assertHardhatInvariant(minValue > 0);
                        await expect(saplingPoolContext.connect(governance).setManagerEarnFactorMax(minValue - 1)).to.be
                            .reverted;
                    });

                    it("A non-governance cannot set a maximum for manager's earn factor", async function () {
                        let currentValue = (await saplingPoolContext.config()).managerEarnFactorMax;
                        let minValue = await saplingMath.HUNDRED_PERCENT();
                        let maxValue = (await saplingPoolContext.config()).managerEarnFactorMax;

                        let newValue = 125 * 10 ** PERCENT_DECIMALS;
                        assertHardhatInvariant(
                            newValue != currentValue && minValue <= newValue && newValue <= maxValue,
                        );

                        await expect(saplingPoolContext.connect(manager).setManagerEarnFactorMax(newValue)).to.be
                            .reverted;
                    });
                });
            });
        });

        describe('Close Pool', function () {
            it('Manager can close the pool', async function () {
                await saplingPoolContext.connect(manager).close();
                expect(await saplingPoolContext.closed()).to.equal(true);
            });

            describe('Rejection scenarios', function () {
                it('Closing the pool with a non-zero borrowed amount should fail', async function () {
                    let stakeAmount = BigNumber.from(2000).mul(TOKEN_MULTIPLIER);
                    let depositAmount = BigNumber.from(10000).mul(TOKEN_MULTIPLIER);

                    await liquidityToken.connect(deployer).mint(manager.address, stakeAmount);
                    await liquidityToken.connect(manager).approve(saplingPoolContext.address, stakeAmount);
                    await saplingPoolContext.connect(manager).stake(stakeAmount);

                    await liquidityToken.connect(deployer).mint(lender1.address, depositAmount);
                    await liquidityToken.connect(lender1).approve(saplingPoolContext.address, depositAmount);
                    await saplingPoolContext.connect(lender1).deposit(depositAmount);

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
                    let applicationId = await loanDesk.recentApplicationIdOf(borrower1.address);
                    let gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                    let installments = 1;
                    let apr = (await loanDesk.loanTemplate()).apr;
                    await loanDesk
                        .connect(manager)
                        .offerLoan(applicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);
                    // await loanDesk.connect(borrower1).borrow(applicationId);

                    // await expect(saplingPoolContext.connect(manager).close()).to.be.reverted;
                });
            });
        });

        describe('Staking', function () {
            after(async function () {
                await rollback();
            });

            before(async function () {
                await snapshot();

                await liquidityToken.connect(deployer).mint(manager.address, stakeAmount);
                await liquidityToken.connect(manager).approve(saplingPoolContext.address, stakeAmount);
            });

            it('Manager can stake', async function () {
                await expect(saplingPoolContext.connect(manager).stake(stakeAmount)).to.changeTokenBalances(
                    liquidityToken,
                    [manager.address, saplingPoolContext.address],
                    [-stakeAmount, stakeAmount],
                );
                expect(await saplingPoolContext.balanceStaked()).to.equal(stakeAmount);
            });

            it('Stake is reflected on pool liquidity', async function () {
                let prevLiquidity = (await saplingPoolContext.balances()).rawLiquidity;
                await saplingPoolContext.connect(manager).stake(stakeAmount);
                let liquidity = (await saplingPoolContext.balances()).rawLiquidity;

                expect(liquidity).to.equal(prevLiquidity.add(stakeAmount));
            });

            it('Stake is reflected on pool funds', async function () {
                let prevPoolFunds = (await saplingPoolContext.balances()).poolFunds;
                await saplingPoolContext.connect(manager).stake(stakeAmount);
                let poolFunds = (await saplingPoolContext.balances()).poolFunds;

                expect(poolFunds).to.equal(prevPoolFunds.add(stakeAmount));
            });

            it('Stake adjusts pool funds limit', async function () {
                let targetStakePercent = (await saplingPoolContext.config()).targetStakePercent;
                let oneHundredPercent = await saplingMath.HUNDRED_PERCENT();

                await saplingPoolContext.connect(manager).stake(stakeAmount);
                let limit = await saplingPoolContext.poolFundsLimit();

                expect(limit).to.equal(stakeAmount.mul(oneHundredPercent / targetStakePercent));
            });

            it('Manager can stake on a failed pool and have a correct pool balance', async function () {
                await saplingPoolContext.connect(manager).stake(stakeAmount);

                let depositAmount = BigNumber.from(10000).mul(TOKEN_MULTIPLIER);
                await liquidityToken.connect(deployer).mint(lender1.address, depositAmount);
                await liquidityToken.connect(lender1).approve(saplingPoolContext.address, depositAmount);
                await saplingPoolContext.connect(lender1).deposit(depositAmount);

                let loanAmount = (await saplingPoolContext.balances()).poolFunds;
                let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);

                let requestLoanTx = await loanDesk
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
                    .connect(manager)
                    .offerLoan(applicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);
                let tx = await loanDesk.connect(borrower1).borrow(applicationId);

                let loanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0]
                    .args.loanId;

                let loan = await loanDesk.loans(loanId);
                await ethers.provider.send('evm_increaseTime', [loan.duration.add(loan.gracePeriod).toNumber()]);
                await ethers.provider.send('evm_mine');

                await loanDesk.connect(manager).defaultLoan(loanId);

                assertHardhatInvariant((await saplingPoolContext.balanceStaked()).eq(0));
                assertHardhatInvariant(((await saplingPoolContext.balances()).poolFunds).eq(0));

                await liquidityToken.connect(deployer).mint(manager.address, depositAmount);
                await liquidityToken.connect(manager).approve(saplingPoolContext.address, stakeAmount);
                await saplingPoolContext.connect(manager).stake(stakeAmount);
                expect(await saplingPoolContext.balanceStaked()).to.equal(stakeAmount.sub(1));
            });

            describe('Rejection scenarios', function () {
                it('Staking a zero amount should fail', async function () {
                    await expect(saplingPoolContext.connect(manager).stake(0)).to.be.reverted;
                });

                it('Staking when the pool is paused should fail', async function () {
                    await saplingPoolContext.connect(governance).pause();
                    await expect(saplingPoolContext.connect(manager).stake(stakeAmount)).to.be.reverted;
                });

                it('Staking when the pool is closed should fail', async function () {
                    await saplingPoolContext.connect(manager).close();
                    await expect(saplingPoolContext.connect(manager).stake(stakeAmount)).to.be.reverted;
                });

                it('Staking as the protocol should fail', async function () {
                    await liquidityToken.connect(deployer).mint(protocol.address, stakeAmount);
                    await liquidityToken.connect(protocol).approve(saplingPoolContext.address, stakeAmount);
                    await expect(saplingPoolContext.connect(protocol).stake(stakeAmount)).to.be.reverted;
                });

                it('Staking as the governance should fail', async function () {
                    await liquidityToken.connect(deployer).mint(governance.address, stakeAmount);
                    await liquidityToken.connect(governance).approve(saplingPoolContext.address, stakeAmount);
                    await expect(saplingPoolContext.connect(governance).stake(stakeAmount)).to.be.reverted;
                });

                it('Staking as a lender should fail', async function () {
                    await liquidityToken.connect(deployer).mint(lender1.address, stakeAmount);
                    await liquidityToken.connect(lender1).approve(saplingPoolContext.address, stakeAmount);
                    await expect(saplingPoolContext.connect(lender1).stake(stakeAmount)).to.be.reverted;
                });

                it('Staking as a borrower should fail', async function () {
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

                    await liquidityToken.connect(borrower1).approve(saplingPoolContext.address, stakeAmount);
                    await expect(saplingPoolContext.connect(borrower1).stake(stakeAmount)).to.be.reverted;
                });
            });
        });

        describe('Unstaking', function () {
            after(async function () {
                await rollback();
            });

            before(async function () {
                await snapshot();
                await saplingPoolContext.connect(manager).stake(stakeAmount);
                await saplingPoolContext.connect(lender1).deposit(depositAmount);
            });

            it('Manager can unstake', async function () {
                let exitFee = unstakeAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT);
                let exitFeeGain = exitFee
                    .mul(stakeAmount.sub(unstakeAmount))
                    .div(depositAmount.add(stakeAmount.sub(unstakeAmount)));
                let balanceDelta = unstakeAmount.sub(exitFee);

                let stakedBalance = await saplingPoolContext.balanceStaked();
                await expect(saplingPoolContext.connect(manager).unstake(unstakeAmount)).to.changeTokenBalances(
                    liquidityToken,
                    [manager.address, saplingPoolContext.address],
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

            it('Manager can unstake full unstakable amount', async function () {

                await saplingPoolContext.connect(lender1).withdraw(depositAmount);

                let amount = await saplingPoolContext.amountUnstakable();
                let exitFee = amount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT);
                let balanceDelta = amount.sub(exitFee);

                await expect(saplingPoolContext.connect(manager).unstake(amount)).to.changeTokenBalances(
                    liquidityToken,
                    [manager.address, saplingPoolContext.address],
                    [balanceDelta, -balanceDelta],
                );
            });

            it('Unstaking is reflected on the pool contract balance', async function () {
                let prevBalance = await liquidityToken.balanceOf(saplingPoolContext.address);

                await saplingPoolContext.connect(manager).unstake(unstakeAmount);

                let balance = await liquidityToken.balanceOf(saplingPoolContext.address);

                expect(balance)
                    .to.equal(
                        prevBalance.sub(unstakeAmount).add(unstakeAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT)),
                    )
                    .and.equal((await saplingPoolContext.balances()).tokenBalance);
            });

            it('Unstaking is reflected on pool liquidity', async function () {
                let prevLiquidity = (await saplingPoolContext.balances()).rawLiquidity;

                await saplingPoolContext.connect(manager).unstake(unstakeAmount);

                let liquidity = (await saplingPoolContext.balances()).rawLiquidity;

                expect(liquidity).to.equal(
                    prevLiquidity.sub(unstakeAmount).add(unstakeAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT)),
                );
            });

            it('Unstaking is reflected on pool funds', async function () {
                let prevPoolFunds = (await saplingPoolContext.balances()).poolFunds;

                await saplingPoolContext.connect(manager).unstake(unstakeAmount);

                let poolFunds = (await saplingPoolContext.balances()).poolFunds;

                expect(poolFunds).to.equal(
                    prevPoolFunds.sub(unstakeAmount).add(unstakeAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT)),
                );
            });

            describe('Rejection scenarios', function () {
                it('Unstaking a zero amount should fail', async function () {
                    await expect(saplingPoolContext.connect(manager).unstake(0)).to.be.reverted;
                });

                it('Unstaking an amount greater than unstakable should fail', async function () {
                    let amountUnstakable = await saplingPoolContext.amountUnstakable();
                    await expect(saplingPoolContext.connect(manager).unstake(amountUnstakable.add(1))).to.be.reverted;
                });

                it('Unstaking when the pool is paused should fail', async function () {
                    await saplingPoolContext.connect(governance).pause();
                    await expect(saplingPoolContext.connect(manager).unstake(unstakeAmount)).to.be.reverted;
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
                    await loanDesk
                        .connect(borrower1)
                        .requestLoan(
                            loanAmount,
                            loanDuration,
                            'a937074e-85a7-42a9-b858-9795d9471759',
                            '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
                        );

                    await expect(saplingPoolContext.connect(borrower1).unstake(unstakeAmount)).to.be.reverted;
                });
            });
        });

        describe('Deposits', function () {
            after(async function () {
                await rollback();
            });

            before(async function () {
                await snapshot();

                await saplingPoolContext.connect(manager).stake(stakeAmount);
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

                await liquidityToken.connect(lender1).approve(saplingPoolContext.address, depositAmount);
                await saplingPoolContext.connect(lender1).deposit(depositAmount);

                let balance = await liquidityToken.balanceOf(saplingPoolContext.address);
                expect(balance)
                    .to.equal(prevBalance.add(depositAmount))
                    .and.equal((await saplingPoolContext.balances()).tokenBalance);
            });

            it('Deposit is reflected on pool liquidity', async function () {
                let prevLiquidity = (await saplingPoolContext.balances()).rawLiquidity;

                await liquidityToken.connect(lender1).approve(saplingPoolContext.address, depositAmount);
                await saplingPoolContext.connect(lender1).deposit(depositAmount);

                let liquidity = (await saplingPoolContext.balances()).rawLiquidity;

                expect(liquidity).to.equal(prevLiquidity.add(depositAmount));
            });

            it('Deposit is reflected on pool funds', async function () {
                let prevPoolFunds = (await saplingPoolContext.balances()).poolFunds;

                await liquidityToken.connect(lender1).approve(saplingPoolContext.address, depositAmount);
                await saplingPoolContext.connect(lender1).deposit(depositAmount);

                let poolFunds = (await saplingPoolContext.balances()).poolFunds;

                expect(poolFunds).to.equal(prevPoolFunds.add(depositAmount));
            });

            describe('Amount depositable', function () {
                it('Can view amount depositable', async function () {
                    let targetStakePercent = (await saplingPoolContext.config()).targetStakePercent;
                    let ONE_HUNDRED_PERCENT = await saplingMath.HUNDRED_PERCENT();
                    let calculatedDepositable = stakeAmount
                        .mul(ONE_HUNDRED_PERCENT)
                        .div(targetStakePercent)
                        .sub(stakeAmount);

                    expect(await saplingPoolContext.amountDepositable()).to.equal(calculatedDepositable);
                });

                it('Amount depositable is zero when pool is paused', async function () {
                    await saplingPoolContext.connect(governance).pause();
                    expect(await saplingPoolContext.amountDepositable()).to.equal(0);
                });

                it('Amount depositable is zero when pool is closed', async function () {
                    await saplingPoolContext.connect(manager).close();
                    expect(await saplingPoolContext.amountDepositable()).to.equal(0);
                });

                it('Amount depositable is zero when pool is full', async function () {
                    let targetStakePercent = (await saplingPoolContext.config()).targetStakePercent;
                    let ONE_HUNDRED_PERCENT = await saplingMath.HUNDRED_PERCENT();
                    let calculatedDepositable = stakeAmount
                        .mul(ONE_HUNDRED_PERCENT)
                        .div(targetStakePercent)
                        .sub(stakeAmount);

                    await liquidityToken.connect(deployer).mint(lender1.address, calculatedDepositable);
                    await liquidityToken.connect(lender1).approve(saplingPoolContext.address, calculatedDepositable);
                    await saplingPoolContext.connect(lender1).deposit(calculatedDepositable);
                    expect(await saplingPoolContext.amountDepositable()).to.equal(0);
                });
            });

            describe('Rejection scenarios', function () {
                it('Depositing a zero amount should fail', async function () {
                    await liquidityToken.connect(lender1).approve(saplingPoolContext.address, depositAmount);
                    await expect(saplingPoolContext.connect(lender1).deposit(0)).to.be.reverted;
                });

                it('Depositing an amount greater than allowed should fail', async function () {
                    let amountDepositable = await saplingPoolContext.amountDepositable();

                    await liquidityToken.connect(lender1).approve(saplingPoolContext.address, amountDepositable.add(1));
                    await expect(saplingPoolContext.connect(lender1).deposit(amountDepositable.add(1))).to.be.reverted;
                });

                it('Depositing when the pool is paused should fail', async function () {
                    await saplingPoolContext.connect(governance).pause();
                    await liquidityToken.connect(lender1).approve(saplingPoolContext.address, depositAmount);
                    await expect(saplingPoolContext.connect(lender1).deposit(depositAmount)).to.be.reverted;
                });

                it('Depositing when the pool is closed should fail', async function () {
                    await saplingPoolContext.connect(manager).close();
                    await liquidityToken.connect(lender1).approve(saplingPoolContext.address, depositAmount);
                    await expect(saplingPoolContext.connect(lender1).deposit(depositAmount)).to.be.reverted;
                });

                it('Depositing as the manager should fail', async function () {
                    await liquidityToken.connect(manager).approve(saplingPoolContext.address, depositAmount);
                    await expect(saplingPoolContext.connect(manager).deposit(depositAmount)).to.be.reverted;
                });

                it('Depositing as the protocol should fail', async function () {
                    await liquidityToken.connect(lender1).transfer(protocol.address, depositAmount);
                    await liquidityToken.connect(protocol).approve(saplingPoolContext.address, depositAmount);
                    await expect(saplingPoolContext.connect(protocol).deposit(depositAmount)).to.be.reverted;
                });

                it('Depositing as the governance should fail', async function () {
                    await liquidityToken.connect(lender1).transfer(governance.address, depositAmount);
                    await liquidityToken.connect(governance).approve(saplingPoolContext.address, depositAmount);
                    await expect(saplingPoolContext.connect(governance).deposit(depositAmount)).to.be.reverted;
                });
            });
        });

        describe('Withdrawals', function () {
            after(async function () {
                await rollback();
            });

            before(async function () {
                await snapshot();

                await saplingPoolContext.connect(manager).stake(stakeAmount);
                await saplingPoolContext.connect(lender1).deposit(depositAmount);
            });

            it('Lender can withdraw', async function () {
                let tokenBalanceBefore = await liquidityToken.balanceOf(lender1.address);
                let poolBalanceBefore = await saplingPoolContext.balanceOf(lender1.address);

                let exitFee = withdrawAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT);
                let exitFeeGain = exitFee
                    .mul(depositAmount.sub(withdrawAmount))
                    .div(stakeAmount.add(depositAmount.sub(withdrawAmount)));

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

                await saplingPoolContext.connect(lender1).withdraw(withdrawAmount);

                let balance = await liquidityToken.balanceOf(saplingPoolContext.address);
                expect(balance)
                    .to.equal(
                        prevBalance
                            .sub(withdrawAmount)
                            .add(withdrawAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT)),
                    )
                    .and.equal((await saplingPoolContext.balances()).tokenBalance);
            });

            it('Withdraw is reflected on pool liquidity', async function () {
                let prevLiquidity = (await saplingPoolContext.balances()).rawLiquidity;

                await saplingPoolContext.connect(lender1).withdraw(withdrawAmount);

                let liquidity = (await saplingPoolContext.balances()).rawLiquidity;

                expect(liquidity).to.equal(
                    prevLiquidity.sub(withdrawAmount).add(withdrawAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT)),
                );
            });

            it('Withdraw is reflected on pool funds', async function () {
                let prevPoolFunds = (await saplingPoolContext.balances()).poolFunds;

                await saplingPoolContext.connect(lender1).withdraw(withdrawAmount);

                let poolFunds = (await saplingPoolContext.balances()).poolFunds;

                expect(poolFunds).to.equal(
                    prevPoolFunds.sub(withdrawAmount).add(withdrawAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT)),
                );
            });

            it('Early Withdraw should charge an exit fee', async function () {
                let tokenBalanceBefore = await liquidityToken.balanceOf(lender1.address);

                let expectedWithdrawalFee = withdrawAmount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT);

                await saplingPoolContext.connect(lender1).withdraw(withdrawAmount);

                expect(await liquidityToken.balanceOf(lender1.address)).to.equal(
                    tokenBalanceBefore.add(withdrawAmount.sub(expectedWithdrawalFee)),
                );
            });

            describe('Rejection scenarios', function () {
                it('Withdrawing a zero amount should fail', async function () {
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

                    await loanDesk
                        .connect(borrower1)
                        .requestLoan(
                            loanAmount,
                            loanDuration,
                            'a937074e-85a7-42a9-b858-9795d9471759',
                            '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
                        );
                    let otherApplicationId = await loanDesk.recentApplicationIdOf(borrower1.address);
                    await loanDesk
                        .connect(manager)
                        .offerLoan(otherApplicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);
                    await loanDesk.connect(borrower1).borrow(otherApplicationId);

                    let amountWithdrawable = await saplingPoolContext.amountWithdrawable(lender1.address);

                    await expect(saplingPoolContext.connect(lender1).withdraw(amountWithdrawable.add(1))).to.be
                        .reverted;
                });

                it('Withdrawing when the pool is paused should fail', async function () {
                    await saplingPoolContext.connect(governance).pause();
                    await expect(saplingPoolContext.connect(lender1).withdraw(withdrawAmount)).to.be.reverted;
                });

                it('Withdrawing as the manager should fail', async function () {
                    let balance = await saplingPoolContext.balanceStaked();
                    await expect(saplingPoolContext.connect(manager).withdraw(balance.div(10))).to.be.reverted;
                });

                it('Withdrawing as a borrower should fail', async function () {
                    let gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                    let installments = 1;
                    let apr = (await loanDesk.loanTemplate()).apr;

                    await loanDesk
                        .connect(borrower2)
                        .requestLoan(
                            loanAmount,
                            loanDuration,
                            'a937074e-85a7-42a9-b858-9795d9471759',
                            '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
                        );
                    let otherApplicationId = await loanDesk.recentApplicationIdOf(borrower2.address);
                    await loanDesk
                        .connect(manager)
                        .offerLoan(otherApplicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);

                    await expect(saplingPoolContext.connect(borrower2).withdraw(loanAmount)).to.be.reverted;
                });
            });

            describe('Protocol fees', function () {
                after(async function () {
                    await rollback();
                });

                before(async function () {
                    await snapshot();

                    let gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                    let installments = 1;
                    let apr = (await loanDesk.loanTemplate()).apr;

                    let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);

                    await loanDesk
                        .connect(borrower1)
                        .requestLoan(
                            loanAmount,
                            loanDuration,
                            'a937074e-85a7-42a9-b858-9795d9471759',
                            '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
                        );
                    let applicationId = await loanDesk.recentApplicationIdOf(borrower1.address);
                    await loanDesk
                        .connect(manager)
                        .offerLoan(applicationId, loanAmount, loanDuration, gracePeriod, 0, installments, apr);
                    let tx = await loanDesk.connect(borrower1).borrow(applicationId);
                    let loanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0].args.loanId;

                    await ethers.provider.send('evm_increaseTime', [loanDuration.toNumber()]);
                    await ethers.provider.send('evm_mine');

                    let paymentAmount = await loanDesk.loanBalanceDue(loanId);

                    await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount);
                    await liquidityToken.connect(borrower1).approve(saplingPoolContext.address, paymentAmount);
                    await loanDesk.connect(borrower1).repay(loanId, paymentAmount);
                });

                it('Protocol can withdraw earned protocol fees', async function () {
                    let tokenBalanceBefore = await liquidityToken.balanceOf(protocol.address);
                    let poolBalanceBefore = (await saplingPoolContext.balances()).protocolRevenue;

                    await saplingPoolContext.connect(protocol).collectProtocolRevenue(poolBalanceBefore);

                    expect(await liquidityToken.balanceOf(protocol.address)).to.equal(
                        tokenBalanceBefore.add(poolBalanceBefore),
                    );
                    expect((await saplingPoolContext.balances()).protocolRevenue).to.equal(0);
                });

                it('Manager can withdraw earned protocol fees', async function () {
                    let tokenBalanceBefore = await liquidityToken.balanceOf(manager.address);
                    let poolBalanceBefore = (await saplingPoolContext.balances()).managerRevenue;

                    await saplingPoolContext.connect(manager).collectManagerRevenue(poolBalanceBefore);

                    expect(await liquidityToken.balanceOf(manager.address)).to.equal(
                        tokenBalanceBefore.add(poolBalanceBefore),
                    );
                    expect((await saplingPoolContext.balances()).managerRevenue).to.equal(0);
                });

                it('Protocol fee withdrawal is reflected on the pool contract balance', async function () {
                    let prevBalance = await liquidityToken.balanceOf(saplingPoolContext.address);

                    let withdrawAmount = (await saplingPoolContext.balances()).protocolRevenue;
                    await saplingPoolContext.connect(protocol).collectProtocolRevenue(withdrawAmount);

                    let balance = await liquidityToken.balanceOf(saplingPoolContext.address);
                    expect(balance)
                        .to.equal(prevBalance.sub(withdrawAmount))
                        .and.equal((await saplingPoolContext.balances()).tokenBalance);
                });

                it('Protocol fee withdrawal is not reflected on pool liquidity', async function () {
                    let prevLiquidity = (await saplingPoolContext.balances()).rawLiquidity;
                    let balanceBefore = (await saplingPoolContext.balances()).protocolRevenue;

                    await saplingPoolContext.connect(protocol).collectProtocolRevenue(balanceBefore);

                    let liquidity = (await saplingPoolContext.balances()).rawLiquidity;

                    expect(liquidity).to.equal(prevLiquidity);
                });

                it('Protocol fee withdrawal is not reflected on pool funds', async function () {
                    let prevPoolFunds = (await saplingPoolContext.balances()).poolFunds;

                    let withdrawAmount = (await saplingPoolContext.balances()).managerRevenue;
                    await saplingPoolContext.connect(protocol).collectProtocolRevenue(withdrawAmount);

                    let poolFunds = (await saplingPoolContext.balances()).poolFunds;

                    expect(poolFunds).to.equal(prevPoolFunds);
                });

                describe('Rejection scenarios', function () {
                    it('Protocol fees cannot be withdrawn while the pool is paused', async function () {
                        await saplingPoolContext.connect(governance).pause();
                        let withdrawAmount = (await saplingPoolContext.balances()).protocolRevenue;
                        await expect(saplingPoolContext.connect(protocol).collectProtocolRevenue(withdrawAmount)).to.be.reverted;
                    });

                    it('Protocol withdrawal should fail when balance is zero', async function () {
                        let withdrawAmount = (await saplingPoolContext.balances()).protocolRevenue;
                        await saplingPoolContext.connect(protocol).collectProtocolRevenue(withdrawAmount);

                        expect((await saplingPoolContext.balances()).protocolRevenue).to.equal(0);
                        await expect(saplingPoolContext.connect(protocol).collectProtocolRevenue(withdrawAmount)).to.be.reverted;
                    });
                });
            });
        });

        describe('Projected APY', function () {
            let poolFunds;

            after(async function () {
                await rollback();
            });

            before(async function () {
                await snapshot();

                depositAmount = BigNumber.from(18000).mul(TOKEN_MULTIPLIER);
                loanAmount = BigNumber.from(10000).mul(TOKEN_MULTIPLIER);

                await saplingPoolContext.connect(manager).stake(stakeAmount);

                await liquidityToken.connect(deployer).mint(lender1.address, depositAmount);
                await liquidityToken.connect(lender1).approve(saplingPoolContext.address, depositAmount);
                await saplingPoolContext.connect(lender1).deposit(depositAmount);

                poolFunds = stakeAmount.add(depositAmount);

                await loanDesk
                    .connect(borrower1)
                    .requestLoan(
                        loanAmount,
                        loanDuration,
                        'a937074e-85a7-42a9-b858-9795d9471759',
                        '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
                    );
                let applicationId = await loanDesk.recentApplicationIdOf(borrower1.address);
                let application = await loanDesk.loanApplications(applicationId);

                let gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
                let installments = 1;
                let apr = (await loanDesk.loanTemplate()).apr;

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
                await loanDesk.connect(borrower1).borrow(applicationId);
            });

            it('Can view lender APY given current pool state', async function () {
                let apr = (await loanDesk.loanTemplate()).apr;
                let protocolEarningPercent = (await saplingPoolContext.config()).protocolFeePercent;
                let ONE_HUNDRED_PERCENT = await saplingMath.HUNDRED_PERCENT();
                let managersEarnFactor = (await saplingPoolContext.config()).managerEarnFactor;

                // pool APY
                let poolAPY = BigNumber.from(apr).mul(loanAmount).div(poolFunds);

                // protocol APY
                let protocolAPY = poolAPY.mul(protocolEarningPercent).div(ONE_HUNDRED_PERCENT);

                let remainingAPY = poolAPY.sub(protocolAPY);

                // manager withdrawableAPY
                let currentStakePercent = ONE_HUNDRED_PERCENT / poolFunds.div(stakeAmount).toNumber();
                let managerEarningsPercent =
                    (currentStakePercent * (managersEarnFactor - ONE_HUNDRED_PERCENT)) / ONE_HUNDRED_PERCENT;
                let managerWithdrawableAPY = remainingAPY
                    .mul(managerEarningsPercent)
                    .div(managerEarningsPercent + ONE_HUNDRED_PERCENT);

                let expectedLenderAPY = remainingAPY.sub(managerWithdrawableAPY).toNumber();

                expect(await saplingPoolContext.currentLenderAPY()).to.equal(expectedLenderAPY);
            });

            it('Can view projected lender APY', async function () {
                let apr = (await loanDesk.loanTemplate()).apr;
                let protocolEarningPercent = (await saplingPoolContext.config()).protocolFeePercent;
                let ONE_HUNDRED_PERCENT = await saplingMath.HUNDRED_PERCENT();
                let managersEarnFactor = (await saplingPoolContext.config()).managerEarnFactor;

                // pool APY
                let poolAPY = BigNumber.from(apr).mul(loanAmount).div(poolFunds);

                // protocol APY
                let protocolAPY = poolAPY.mul(protocolEarningPercent).div(ONE_HUNDRED_PERCENT);

                let remainingAPY = poolAPY.sub(protocolAPY);

                // manager withdrawableAPY
                let currentStakePercent = ONE_HUNDRED_PERCENT / poolFunds.div(stakeAmount).toNumber();
                let managerEarningsPercent =
                    (currentStakePercent * (managersEarnFactor - ONE_HUNDRED_PERCENT)) / ONE_HUNDRED_PERCENT;
                let managerWithdrawableAPY = remainingAPY
                    .mul(managerEarningsPercent)
                    .div(managerEarningsPercent + ONE_HUNDRED_PERCENT);

                let expectedLenderAPY = remainingAPY.sub(managerWithdrawableAPY).toNumber();

                let borrowRate = loanAmount.mul(ONE_HUNDRED_PERCENT).div(poolFunds).toNumber();

                expect(await saplingPoolContext.projectedLenderAPY(borrowRate, apr)).to.equal(expectedLenderAPY);
            });

            it('Increase in borrow rate is linearly reflected on projected lender APY within margin of integer math accuracy', async function () {
                let apr = (await loanDesk.loanTemplate()).apr;
                let protocolEarningPercent = (await saplingPoolContext.config()).protocolFeePercent;
                let ONE_HUNDRED_PERCENT = await saplingMath.HUNDRED_PERCENT();
                let managersEarnFactor = (await saplingPoolContext.config()).managerEarnFactor;

                let projectedBorrowAmount = loanAmount.div(2);

                // pool APY
                let poolAPY = BigNumber.from(apr).mul(projectedBorrowAmount).div(poolFunds);

                // protocol APY
                let protocolAPY = poolAPY.mul(protocolEarningPercent).div(ONE_HUNDRED_PERCENT);

                // manager withdrawableAPY
                let currentStakePercent = stakeAmount.mul(ONE_HUNDRED_PERCENT).div(poolFunds);
                let managerEarningsPercent = currentStakePercent
                    .mul(managersEarnFactor - ONE_HUNDRED_PERCENT)
                    .div(ONE_HUNDRED_PERCENT);
                let managerWithdrawableAPY = poolAPY
                    .sub(protocolAPY)
                    .mul(managerEarningsPercent)
                    .div(managerEarningsPercent + ONE_HUNDRED_PERCENT);

                let expectedLenderAPY = poolAPY.sub(protocolAPY).sub(managerWithdrawableAPY).toNumber();

                let borrowRate = projectedBorrowAmount.mul(ONE_HUNDRED_PERCENT).div(poolFunds).toNumber();

                expect(
                    (await saplingPoolContext.projectedLenderAPY(borrowRate * 2, apr)) - expectedLenderAPY * 2,
                ).to.lte(10);
                expect(
                    (await saplingPoolContext.projectedLenderAPY(borrowRate * 3, apr)) - expectedLenderAPY * 3,
                ).to.lte(10);
            });

            describe('Rejection scenarios', function () {
                it('APY projection should fail when borrow rate of over 100% is requested', async function () {
                    let apr = (await loanDesk.loanTemplate()).apr;
                    let ONE_HUNDRED_PERCENT = await saplingMath.HUNDRED_PERCENT();
                    await expect(saplingPoolContext.projectedLenderAPY(ONE_HUNDRED_PERCENT + 1, apr)).to.be.reverted;
                });
            });
        });
    });
});
