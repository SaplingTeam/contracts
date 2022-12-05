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

describe('Sapling Manager Context (via SaplingLendingPool)', function () {
    const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
    const TOKEN_DECIMALS = 6;

    const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
    const GOVERNANCE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("GOVERNANCE_ROLE"));
    const TREASURY_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("TREASURY_ROLE"));
    const PAUSER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("PAUSER_ROLE"));
    const POOL_1_MANAGER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("POOL_1_MANAGER_ROLE"));

    let coreAccessControl;

    let SaplingManagerContextCF;
    let saplingManagerContext;
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

        SaplingManagerContextCF = SaplingLendingPoolCF;
        saplingManagerContext = lendingPool;
    });

    describe('Deployment', function () {
        it('Can deploy', async function () {
            await expect(
                upgrades.deployProxy(SaplingManagerContextCF, [
                    poolToken.address,
                    liquidityToken.address,
                    coreAccessControl.address,
                    POOL_1_MANAGER_ROLE,
                ]),
            ).to.be.not.reverted;
        });
    });

    describe('Use Cases', function () {
        describe('Initial State', function () {
            it('Pool manager address is correct', async function () {
                expect(await coreAccessControl.getRoleMember(POOL_1_MANAGER_ROLE, 0)).to.equal(manager.address);
            });

            it('Pool is not closed', async function () {
                expect(await saplingManagerContext.closed()).to.equal(false);
            });
        });

        describe('Close', function () {
            it('Manager can close', async function () {
                await saplingManagerContext.connect(manager).close();
                expect(await saplingManagerContext.closed()).to.equal(true);
            });

            describe('Rejection scenarios', function () {
                it('Closing the pool when closed should fail', async function () {
                    await saplingManagerContext.connect(manager).close();
                    await expect(saplingManagerContext.connect(manager).close()).to.be.reverted;
                });

                it('Closing the pool as a non manager should fail', async function () {
                    await expect(saplingManagerContext.connect(addresses[0]).close()).to.be.reverted;
                });
            });
        });

        describe('Open', function () {
            beforeEach(async function () {
                await saplingManagerContext.connect(manager).close();
            });

            it('Manager can open', async function () {
                await saplingManagerContext.connect(manager).open();
                expect(await saplingManagerContext.closed()).to.equal(false);
            });

            describe('Rejection scenarios', function () {
                it('Opening when not closed should fail', async function () {
                    await saplingManagerContext.connect(manager).open();
                    await expect(saplingManagerContext.connect(manager).open()).to.be.reverted;
                });

                it('Opening as a non manager should fail', async function () {
                    await expect(saplingManagerContext.connect(addresses[0]).open()).to.be.reverted;
                });
            });
        });
    });
});
