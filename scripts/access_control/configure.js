const { BigNumber } = require('ethers');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    [deployer, ...addrs] = await ethers.getSigners();

    const coreACAddress = '0x0000000000000000000000000000000000000000'; //REPLACE before use
    const governanceAddress = '0x0000000000000000000000000000000000000000'; //REPLACE before use

    const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
    const GOVERNANCE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("GOVERNANCE_ROLE"));
    const PAUSER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("PAUSER_ROLE"));

    console.log("START Configure. Deployer: \t\t", deployer.address);
    console.log("Balance before: \t\t", (await deployer.getBalance()).toString());

    console.log("\nLoading access control contract ...");
    let coreAccessControl = await ethers.getContractAt("CoreAccessControl", coreACAddress);
    console.log("CoreAccessControl address: \t\t", coreAccessControl.address);


    console.log("GOVERNANCE_ROLE: ", GOVERNANCE_ROLE);
    console.log("PAUSER_ROLE: ", PAUSER_ROLE);

    console.log("deployer: ", deployer.address);
    console.log("governance: ", governanceAddress);

    console.log("\nAssigning ownership and linking contracts ...");
    await sleep(15);
    await coreAccessControl.connect(deployer).grantRole(GOVERNANCE_ROLE, governanceAddress);

    await sleep(15);
    await coreAccessControl.connect(deployer).grantRole(PAUSER_ROLE, governanceAddress);

    await sleep(15);
    await coreAccessControl.connect(deployer).grantRole(DEFAULT_ADMIN_ROLE, governanceAddress);

    await sleep(15);
    await coreAccessControl.connect(deployer).renounceRole(DEFAULT_ADMIN_ROLE, deployer.address);

    console.log("\nEND Configure.");
    console.log("\nBalance after:  \t\t", (await deployer.getBalance()).toString());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });