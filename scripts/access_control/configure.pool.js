const {ethers} = require("hardhat");

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    [deployer, ...addrs] = await ethers.getSigners();

    const coreACAddress = '0x0000000000000000000000000000000000000000'; //REPLACE before use
    const poolManager = '0x0000000000000000000000000000000000000000'; //REPLACE before use
    const lenderTimelock = '0x0000000000000000000000000000000000000000'; //REPLACE before use
    const POOL_MANAGER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("POOL_1_MANAGER_ROLE"));
    const POOL_LENDER_GOVERNANCE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("POOL_1_LENDER_GOVERNANCE_ROLE"));
    console.log("POOL_MANAGER_ROLE", POOL_MANAGER_ROLE);
    console.log("POOL_LENDER_GOVERNANCE_ROLE", POOL_LENDER_GOVERNANCE_ROLE);

    console.log("START Configure. Deployer: \t\t", deployer.address);
    console.log("Balance before: \t\t", (await deployer.getBalance()).toString());

    console.log("\nLoading access control contract ...");
    let coreAccessControl = await ethers.getContractAt("CoreAccessControl", coreACAddress);
    console.log("CoreAccessControl address: \t\t", coreAccessControl.address);

    console.log("\nAssigning ownership and linking contracts ...");
    await sleep(15);
    await coreAccessControl.connect(deployer).grantRole(POOL_MANAGER_ROLE, poolManager);

    await sleep(15);
    await coreAccessControl.connect(deployer).grantRole(POOL_LENDER_GOVERNANCE_ROLE, lenderTimelock);

    console.log("\nEND Configure.");
    console.log("\nBalance after:  \t\t", (await deployer.getBalance()).toString());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });