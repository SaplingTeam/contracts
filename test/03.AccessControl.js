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

describe('CoreAccessControl', function () {
    const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
    const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';

    let CoreAccessControlCF;
    let coreAccessControl;

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
    });

    describe('Deployment', function () {
        it('Can transfer DEFAULT_ADMIN_ROLE', async function () {

            await coreAccessControl.connect(deployer).grantRole(DEFAULT_ADMIN_ROLE, governance.address);
            await coreAccessControl.connect(deployer).renounceRole(DEFAULT_ADMIN_ROLE, deployer.address);

            expect(await coreAccessControl.hasRole(DEFAULT_ADMIN_ROLE, governance.address)).to.equal(true);
            expect(await coreAccessControl.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)).to.equal(false);
            expect(await coreAccessControl.getRoleMemberCount(DEFAULT_ADMIN_ROLE)).to.equal(1);
        });
    });

    describe('Use Cases', function () {

        after(async function () {
            await rollback();
        });

        before(async function () {
            await snapshot();

            await coreAccessControl.connect(deployer).grantRole(DEFAULT_ADMIN_ROLE, governance.address);
            await coreAccessControl.connect(deployer).renounceRole(DEFAULT_ADMIN_ROLE, deployer.address);
        });
    });
});
