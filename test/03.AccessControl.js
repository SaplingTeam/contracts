const { expect } = require('chai');
const { ethers } = require('hardhat');
const { DEFAULT_ADMIN_ROLE } = require('./utils/roles');
const { snapshot, rollback } = require('./utils/evmControl');

let evmSnapshotIds = [];

describe('CoreAccessControl', function () {
    let CoreAccessControlCF;
    let coreAccessControl;

    let deployer;
    let governance;
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
        [deployer, governance, protocol, staker, ...addresses] = await ethers.getSigners();

        CoreAccessControlCF = await ethers.getContractFactory('CoreAccessControl');

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
            await rollback(evmSnapshotIds);
        });

        before(async function () {
            await snapshot(evmSnapshotIds);

            await coreAccessControl.connect(deployer).grantRole(DEFAULT_ADMIN_ROLE, governance.address);
            await coreAccessControl.connect(deployer).renounceRole(DEFAULT_ADMIN_ROLE, deployer.address);
        });
    });
});
