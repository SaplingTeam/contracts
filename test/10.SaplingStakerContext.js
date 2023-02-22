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

describe('Sapling Staker Context (via SaplingLendingPool)', function () {
    const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
    const TOKEN_DECIMALS = 6;

    const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
    const GOVERNANCE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("GOVERNANCE_ROLE"));
    const TREASURY_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("TREASURY_ROLE"));
    const PAUSER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("PAUSER_ROLE"));
    const POOL_1_LENDER_GOVERNANCE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("POOL_1_LENDER_GOVERNANCE_ROLE"));

    let coreAccessControl;

    let SaplingStakerContextCF;
    let saplingStakerContext;
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

        SaplingStakerContextCF = SaplingLendingPoolCF;
        saplingStakerContext = lendingPool;

        await loanDesk.connect(staker).open();
    });

    describe('Deployment', function () {
        it('Can deploy', async function () {
            await expect(
                upgrades.deployProxy(SaplingStakerContextCF, [
                    poolToken.address,
                    liquidityToken.address,
                    coreAccessControl.address,
                    protocol.address,
                    staker.address
                ]),
            ).to.be.not.reverted;
        });
    });

    describe('Initial State', function () {
        it('Staker address is correct', async function () {
            expect(await saplingStakerContext.staker()).to.equal(staker.address);
        });

        it('Pool is closed', async function () {
            expect(await saplingStakerContext.closed()).to.equal(true);
        });
    });

    describe('Use Cases', function () {
        describe('Close', function () {
            beforeEach(async function () {
                let initialMintAmount = 10 ** TOKEN_DECIMALS;
                await liquidityToken.connect(deployer).mint(staker.address, initialMintAmount);
                await liquidityToken.connect(staker).approve(lendingPool.address, initialMintAmount);
                await lendingPool.connect(staker).initialMint();

                await saplingStakerContext.connect(staker).open();
            });

            it('Staker can close', async function () {
                await saplingStakerContext.connect(staker).close();
                expect(await saplingStakerContext.closed()).to.equal(true);
            });

            describe('Rejection scenarios', function () {
                it('Closing the pool when closed should fail', async function () {
                    await saplingStakerContext.connect(staker).close();
                    await expect(saplingStakerContext.connect(staker).close()).to.be.reverted;
                });

                it('Closing the pool as a non staker should fail', async function () {
                    await expect(saplingStakerContext.connect(addresses[0]).close()).to.be.reverted;
                });
            });
        });

        describe('Open', function () {
            it('Staker can open', async function () {
                let initialMintAmount = 10 ** TOKEN_DECIMALS;
                await liquidityToken.connect(deployer).mint(staker.address, initialMintAmount);
                await liquidityToken.connect(staker).approve(lendingPool.address, initialMintAmount);
                await lendingPool.connect(staker).initialMint();

                await saplingStakerContext.connect(staker).open();
                expect(await saplingStakerContext.closed()).to.equal(false);
            });

            describe('Rejection scenarios', function () {
                it('Opening without initial mint should fail', async function () {
                    await expect(saplingStakerContext.connect(staker).open()).to.be.reverted;
                });

                it('Opening when not closed should fail', async function () {
                    let initialMintAmount = 10 ** TOKEN_DECIMALS;
                    await liquidityToken.connect(deployer).mint(staker.address, initialMintAmount);
                    await liquidityToken.connect(staker).approve(lendingPool.address, initialMintAmount);
                    await lendingPool.connect(staker).initialMint();

                    await saplingStakerContext.connect(staker).open();
                    await expect(saplingStakerContext.connect(staker).open()).to.be.reverted;
                });

                it('Opening as a non staker should fail', async function () {
                    let initialMintAmount = 10 ** TOKEN_DECIMALS;
                    await liquidityToken.connect(deployer).mint(staker.address, initialMintAmount);
                    await liquidityToken.connect(staker).approve(lendingPool.address, initialMintAmount);
                    await lendingPool.connect(staker).initialMint();

                    await expect(saplingStakerContext.connect(addresses[0]).open()).to.be.reverted;
                });
            });
        });
    });
});
