const { expect } = require('chai');
const { ethers, upgrades } = require('hardhat');
const { assertHardhatInvariant } = require('hardhat/internal/core/errors');
const { PAUSER_ROLE, initAccessControl } = require('./utils/roles');
const { snapshot, rollback } = require('./utils/evmControl');

let evmSnapshotIds = [];

describe('Sapling Staker Context (internals)', function () {
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
        await snapshot(evmSnapshotIds);
    });

    afterEach(async function () {
        await rollback(evmSnapshotIds);
    });

    before(async function () {
        [deployer, governance, lenderGovernance, pauser, protocol, staker, ...addresses] = await ethers.getSigners();

        let CoreAccessControlCF = await ethers.getContractFactory('CoreAccessControl');
        coreAccessControl = await CoreAccessControlCF.deploy();

        await initAccessControl(coreAccessControl, deployer, governance, lenderGovernance.address);
        await coreAccessControl.connect(governance).grantRole(PAUSER_ROLE, pauser.address);

        let ContractCF = await ethers.getContractFactory('SaplingStakerContextTester');

        contract = await upgrades.deployProxy(ContractCF, [coreAccessControl.address, staker.address]);
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
                expect(await contract.isNonUserAddressWrapper(pauser.address)).to.equal(true);
            });

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
                await expect(contract.connect(staker).someOnlyUserFunction(42)).to.be.revertedWith(
                    'SaplingStakerContext: caller is not a user',
                );
            });

            it('Governance cannot transact', async function () {
                await expect(contract.connect(governance).someOnlyUserFunction(42)).to.be.revertedWith(
                    'SaplingStakerContext: caller is not a user',
                );
            });

            it('Pauser cannot transact', async function () {
                await expect(contract.connect(pauser).someOnlyUserFunction(42)).to.be.revertedWith(
                    'SaplingStakerContext: caller is not a user',
                );
            });

            it('An address without a role can transact', async function () {
                await expect(contract.connect(addresses[0]).someOnlyUserFunction(42)).to.be.not.reverted;
            });

            it('A user cannot transact once given a role', async function () {
                await expect(contract.connect(addresses[0]).someOnlyUserFunction(42)).to.be.not.reverted;

                await coreAccessControl.connect(governance).grantRole(PAUSER_ROLE, addresses[0].address);

                await expect(contract.connect(addresses[0]).someOnlyUserFunction(42)).to.be.revertedWith(
                    'SaplingStakerContext: caller is not a user',
                );
            });
        });

        describe('Close', function () {
            it('Can close is false while closed', async function () {
                assertHardhatInvariant(await contract.closed(), 'Start the contract closed for this test.');
                expect(await contract.canCloseWrapper()).to.equal(false);
            });

            it('Can close is true while not closed', async function () {
                await contract.connect(staker).open();
                expect(await contract.canCloseWrapper()).to.equal(true);
            });
        });

        describe('Open', function () {
            it('Can open is true while closed', async function () {
                assertHardhatInvariant(await contract.closed(), 'Start the contract closed for this test.');
                expect(await contract.canOpenWrapper()).to.equal(true);
            });

            it('Can open is false while not closed', async function () {
                await contract.connect(staker).open();
                expect(await contract.canOpenWrapper()).to.equal(false);
            });
        });
    });
});
