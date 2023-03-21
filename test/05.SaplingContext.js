const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { ethers, upgrades } = require('hardhat');
const { assertHardhatInvariant } = require('hardhat/internal/core/errors');
const { NULL_ADDRESS, TOKEN_DECIMALS } = require("./utils/constants");
const { GOVERNANCE_ROLE, POOL_1_LENDER_GOVERNANCE_ROLE, initAccessControl } = require("./utils/roles");
const { snapshot, rollback } = require("./utils/evmControl");

let evmSnapshotIds = [];

describe('Sapling Context (via SaplingLendingPool)', function () {

    let coreAccessControl;

    let SaplingContextCF;
    let saplingContext;
    let liquidityToken;
    let poolToken;
    let loanDesk;

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
        let PoolTokenCF = await ethers.getContractFactory('PoolToken');
        let LoanDeskCF = await ethers.getContractFactory('LoanDesk');

        liquidityToken = await PoolTokenCF.deploy('Test USDC', 'TestUSDC', TOKEN_DECIMALS);

        poolToken = await PoolTokenCF.deploy('Sapling Test Lending Pool Token', 'SLPT', TOKEN_DECIMALS);

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

        SaplingContextCF = SaplingLendingPoolCF;
        saplingContext = lendingPool;
    });

    describe('Deployment', function () {
        it('Can deploy', async function () {
            let poolToken2 = await (
                await ethers.getContractFactory('PoolToken')
            ).deploy('Sapling Test Lending Pool Token', 'SLPT', TOKEN_DECIMALS);

            await expect(
                upgrades.deployProxy(SaplingContextCF, [
                    poolToken2.address,
                    liquidityToken.address,
                    coreAccessControl.address,
                    protocol.address,
                    staker.address
                ]),
            ).to.be.not.reverted;
        });

        describe('Rejection Scenarios', function () {
            it('Deploying with null access control address should fail', async function () {
                await expect(
                    upgrades.deployProxy(SaplingContextCF, [
                        poolToken.address,
                        liquidityToken.address,
                        NULL_ADDRESS,
                        protocol.address,
                        staker.address
                    ]),
                ).to.be.reverted;
            });
        });
    });

    describe('Use Cases', function () {
        describe('Initial State', function () {
            it('Governance address is correct', async function () {
                expect(await coreAccessControl.getRoleMember(GOVERNANCE_ROLE, 0)).to.equal(governance.address);
            });

            it('Protocol wallet address is correct', async function () {
                expect(await saplingContext.treasury()).to.equal(protocol.address);
            });

            it('Context is not paused', async function () {
                expect(await saplingContext.paused()).to.equal(false);
            });
        });

        describe('Pause', function () {
            it('Governance can pause', async function () {
                await saplingContext.connect(governance).pause();
                expect(await saplingContext.paused()).to.equal(true);
            });

            describe('Rejection scenarios', function () {
                it('Pausing when paused should fail', async function () {
                    await saplingContext.connect(governance).pause();
                    await expect(saplingContext.connect(governance).pause()).to.be.reverted;
                });

                it('Pausing as a non governance should fail', async function () {
                    await expect(saplingContext.connect(addresses[0]).pause()).to.be.reverted;
                });
            });
        });

        describe('Resume', function () {
            beforeEach(async function () {
                await saplingContext.connect(governance).pause();
            });

            it('Governance can resume', async function () {
                await saplingContext.connect(governance).unpause();
                expect(await saplingContext.paused()).to.equal(false);
            });

            describe('Rejection scenarios', function () {
                it('Resuming when not paused should fail', async function () {
                    await saplingContext.connect(governance).unpause();
                    await expect(saplingContext.connect(governance).unpause()).to.be.reverted;
                });

                it('Resuming as a non governance should fail', async function () {
                    await expect(saplingContext.connect(addresses[0]).unpause()).to.be.reverted;
                });
            });
        });
    });
});
