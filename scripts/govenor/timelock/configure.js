const { BigNumber } = require('ethers');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    [deployer, ...addrs] = await ethers.getSigners();

    const timelockAddress = '0x0000000000000000000000000000000000000000'; //REPLACE before use
    const govenorAddress = '0x0000000000000000000000000000000000000000'; //REPLACE before use
    const stakerAddress = '0x0000000000000000000000000000000000000000'; //REPLACE before use

    const TIMELOCK_ADMIN_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("TIMELOCK_ADMIN_ROLE"));
    const PROPOSER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("PROPOSER_ROLE"));
    const EXECUTOR_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("EXECUTOR_ROLE"));
    const CANCELLER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("CANCELLER_ROLE"));

    console.log("START Configure. Deployer: \t\t", deployer.address);
    console.log("Balance before: \t\t", (await deployer.getBalance()).toString());

    console.log("\nLoading timelock contract ...");
    let timelock = await ethers.getContractAt("TimelockController", timelockAddress);
    console.log("Timelock address: \t\t", timelock.address);

    console.log("\nGranting roles...");
    await timelock.connect(deployer).grantRole(PROPOSER_ROLE, govenorAddress);

    await sleep(15);
    await timelock.connect(deployer).grantRole(CANCELLER_ROLE, govenorAddress);

    await sleep(15);
    await timelock.connect(deployer).grantRole(EXECUTOR_ROLE, stakerAddress);

    await sleep(15);
    await timelock.connect(deployer).grantRole(CANCELLER_ROLE, stakerAddress);

    await sleep(15);
    console.log("\nRenouncing admin role...");
    await timelock.connect(deployer).renounceRole(TIMELOCK_ADMIN_ROLE, deployer.address);

    console.log("\nEND Configure.");
    console.log("\nBalance after:  \t\t", (await deployer.getBalance()).toString());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });

