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

describe('Sapling Staker Context (internals)', function () {
    const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
    const TOKEN_DECIMALS = 6;

    const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
    const GOVERNANCE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("GOVERNANCE_ROLE"));
    const TREASURY_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("TREASURY_ROLE"));
    const PAUSER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("PAUSER_ROLE"));
    const POOL_1_LENDER_GOVERNANCE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("POOL_1_LENDER_GOVERNANCE_ROLE"));

    let coreAccessControl;
    let contract;

    let deployer;
    let governance;
    let lenderGovernance;
    let pauser;
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
        [deployer, governance, lenderGovernance, pauser, protocol, staker, ...addresses] = await ethers.getSigners();

        let CoreAccessControlCF = await ethers.getContractFactory('CoreAccessControl');
        coreAccessControl = await CoreAccessControlCF.deploy();

        await coreAccessControl.connect(deployer).grantRole(DEFAULT_ADMIN_ROLE, governance.address);
        await coreAccessControl.connect(deployer).renounceRole(DEFAULT_ADMIN_ROLE, deployer.address);

        await coreAccessControl.connect(governance).grantRole(GOVERNANCE_ROLE, governance.address);
        await coreAccessControl.connect(governance).grantRole(TREASURY_ROLE, protocol.address);
        await coreAccessControl.connect(governance).grantRole(PAUSER_ROLE, pauser.address);

        await coreAccessControl.connect(governance).grantRole(POOL_1_LENDER_GOVERNANCE_ROLE, lenderGovernance.address);

        let ContractCF = await ethers.getContractFactory('SaplingStakerContextTester');

        contract = await upgrades.deployProxy(ContractCF, [
            coreAccessControl.address,
            staker.address
        ]);
        await contract.deployed();
    });

    describe('Use Cases', function () {
        describe('Non user address check', function () {
            it('Staker is a non-user', async function () {
                expect(await contract.isNonUserAddressWrapper(staker.address)).to.equal(true);
            });

            it('Governance is a non-user', async function () {
                expect(await contract.isNonUserAddressWrapper(governance.address)).to.equal(true);
            });

            it('Pauser is a non-user', async function () {
                expect(await contract.isNonUserAddressWrapper(pauser.address)).to.equal(true);            });

            it('An address without roles is not a non-user', async function () {
                expect(await contract.isNonUserAddressWrapper(addresses[0].address)).to.equal(false);
            });

            it('A user becomes a non-user once given a role', async function () {
                expect(await contract.isNonUserAddressWrapper(addresses[0].address)).to.equal(false);

                await coreAccessControl.connect(governance).grantRole(PAUSER_ROLE, addresses[0].address);

                expect(await contract.isNonUserAddressWrapper(addresses[0].address)).to.equal(true);
            });
        });

        describe('onlyUser modifier', function () {
            it('Staker cannot transact', async function () {
                await expect(contract.connect(staker).someOnlyUserFunction(42))
                    .to.be.revertedWith("SaplingStakerContext: caller is not a user");
            });

            it('Governance cannot transact', async function () {
                await expect(contract.connect(governance).someOnlyUserFunction(42))
                    .to.be.revertedWith("SaplingStakerContext: caller is not a user");
            });

            it('Pauser cannot transact', async function () {
                await expect(contract.connect(pauser).someOnlyUserFunction(42))
                    .to.be.revertedWith("SaplingStakerContext: caller is not a user");
            });

            it('An address without a role can transact', async function () {
                await expect(contract.connect(addresses[0]).someOnlyUserFunction(42))
                    .to.be.not.reverted;
            });

            it('A user cannot transact once given a role', async function () {
                await expect(contract.connect(addresses[0]).someOnlyUserFunction(42))
                    .to.be.not.reverted;

                await coreAccessControl.connect(governance).grantRole(PAUSER_ROLE, addresses[0].address);

                await expect(contract.connect(addresses[0]).someOnlyUserFunction(42))
                    .to.be.revertedWith("SaplingStakerContext: caller is not a user");
            });
        });
    });
});
