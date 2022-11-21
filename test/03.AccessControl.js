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

        describe('List Role', function () {

            after(async function () {
                await rollback();
            });

            before(async function () {
                await snapshot();
            });

            it('Can list a role', async function () {
                const roleName = "MY_CUSTOM_ROLE";
                const roleType = 1;

                const prevRolesLength = await coreAccessControl.getRolesLength();

                await coreAccessControl.connect(governance).listRole(roleName, roleType);

                const roleMetadata = await coreAccessControl.getRoleMetadataByName(roleName);

                expect(await coreAccessControl.getRolesLength()).to.equal(prevRolesLength.add(1));
                expect(roleMetadata.name).to.equal(roleName);
                expect(roleMetadata.roleType).to.equal(roleType);
                expect(roleMetadata.role).to.equal(ethers.utils.keccak256(ethers.utils.toUtf8Bytes(roleName)));
            });

            describe('Rejection scenarios', function () {
                it('Listing the DEFAULT_ADMIN_ROLE should fail', async function () {
                    await expect(coreAccessControl.connect(governance).listRole("DEFAULT_ADMIN_ROLE", 1))
                        .to.be.revertedWith("CoreAccessControl: role name is not available");
                });

                it('Double listing a role should fail', async function () {
                    const roleName = "MY_CUSTOM_ROLE";
                    const roleType = 1;

                    await coreAccessControl.connect(governance).listRole(roleName, roleType);

                    await expect(coreAccessControl.connect(governance).listRole(roleName, roleType))
                        .to.be.revertedWith("CoreAccessControl: role is already listed");
                });
            });
        });

        describe('View Listed Roles', function () {

            let rolesStartOffset;
            let roleNames;
            let roleTypes;

            after(async function () {
                await rollback();
            });

            before(async function () {
                await snapshot();

                rolesStartOffset = (await coreAccessControl.getRolesLength()).toNumber();

                roleNames = ["ROLE_0", "ROLE_1", "ROLE_2", "ROLE_3", "ROLE_4"];
                roleTypes = [0, 1, 2, 3, 4];
                
                for (let i = 0; i < roleNames.length; i++) {
                    await coreAccessControl.connect(governance).listRole(roleNames[i], roleTypes[i]);
                }
            });

            it('Can iterate roles', async function () {
                for (let i = 0; i < roleNames.length; i++) {
                    expect(await coreAccessControl.getRoleAt(i + rolesStartOffset))
                        .to.equal(ethers.utils.keccak256(ethers.utils.toUtf8Bytes(roleNames[i])));
                }
            });

            it('Can iterate role metadata by index', async function () {
                for (let i = 0; i < roleNames.length; i++) {
                    const metadata = await coreAccessControl.getRoleMetadataAt(i + rolesStartOffset);
                    await expect(metadata.role).to.equal(await coreAccessControl.getRoleAt(i + rolesStartOffset));
                }
            });

            it('Can get role metadata by name', async function () {
                const metadata = await coreAccessControl.getRoleMetadataByName(roleNames[0]);
                await expect(metadata.role).to.equal(ethers.utils.keccak256(ethers.utils.toUtf8Bytes(roleNames[0])));
                await expect(metadata.name).to.equal(roleNames[0]);
            });

            it('Can get role metadata by role', async function () {
                const role = await coreAccessControl.getRoleAt(rolesStartOffset);
                const metadata = await coreAccessControl.getRoleMetadata(role);
                await expect(metadata.role).to.equal(role);
            });

            describe('Rejection scenarios', function () {
                it('Getting a role from an out of index position should fail', async function () {
                    await expect(coreAccessControl.getRoleAt(rolesStartOffset + roleNames.length + 1))
                        .to.be.revertedWith("CoreAccessControl: index out of bounds");
                });

                it('Getting a role metadata from an out of index position should fail', async function () {
                    await expect(coreAccessControl.getRoleMetadataAt(rolesStartOffset + roleNames.length + 1))
                        .to.be.revertedWith("CoreAccessControl: index out of bounds");
                });

                it('Getting a metadata for an unlisted role should fail', async function () {
                    const role = await coreAccessControl.getRoleAt(rolesStartOffset);
                    await coreAccessControl.connect(governance).delistRole(roleNames[0]);
                    await expect(coreAccessControl.getRoleMetadata(role))
                        .to.be.revertedWith("CoreAccessControl: role is not listed");
                });

                it('Getting a metadata for an unlisted role by name should fail', async function () {
                    const role = await coreAccessControl.getRoleAt(rolesStartOffset);
                    await coreAccessControl.connect(governance).delistRole(roleNames[0]);
                    await expect(coreAccessControl.getRoleMetadataByName(roleNames[0]))
                        .to.be.revertedWith("CoreAccessControl: role is not listed");
                });
            });
        });

        describe('Update Role', function () {

            let roleName;
            let roleType;
            let otherRoleType;

            after(async function () {
                await rollback();
            });

            before(async function () {
                await snapshot();

                roleName = "MY_CUSTOM_ROLE";
                roleType = 1;
                otherRoleType = 2;

                await coreAccessControl.connect(governance).listRole(roleName, roleType);
            });

            it('Can update role type', async function () {
                await coreAccessControl.connect(governance).updateRoleType(roleName, otherRoleType);

                const roleMetadata = await coreAccessControl.getRoleMetadataByName(roleName);
                expect(roleMetadata.roleType).to.equal(otherRoleType);
            });

            describe('Rejection scenarios', function () {
                it('Updating an unlisted role should fail', async function () {
                    await expect(coreAccessControl.connect(governance).updateRoleType("MY_CUSTOM_ROLE_2", 2))
                        .to.be.revertedWith("CoreAccessControl: role is not listed");
                });

                it('Updating without changing the role type should fail', async function () {
                    await expect(coreAccessControl.connect(governance).updateRoleType(roleName, roleType))
                        .to.be.revertedWith("CoreAccessControl: role has the same type");
                });
            });
        });

        describe('Delist Role', function () {

            let roleName;
            let roleType;

            after(async function () {
                await rollback();
            });

            before(async function () {
                await snapshot();

                roleName = "MY_CUSTOM_ROLE";
                roleType = 1;

                await coreAccessControl.connect(governance).listRole(roleName, roleType);
            });

            it('Can delist a role', async function () {
                await coreAccessControl.connect(governance).delistRole(roleName);

                await expect(coreAccessControl.getRoleMetadataByName(roleName))
                    .to.be.revertedWith("CoreAccessControl: role is not listed");
            });

            describe('Rejection scenarios', function () {
                it('Delisting an unlisted role should fail', async function () {
                    await expect(coreAccessControl.connect(governance).delistRole("MY_CUSTOM_ROLE_2"))
                        .to.be.revertedWith("CoreAccessControl: role is not listed");
                });
            });
        });
    });
});
