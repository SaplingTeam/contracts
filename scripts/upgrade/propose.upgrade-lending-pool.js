const { defender } = require('hardhat');

async function main() {
    [deployer, ...addrs] = await ethers.getSigners();
    const arguments = require('./arguments.upgrade.js');
    const proxyAdminAddress = arguments[0];
    const proxyLendingPoolAddress = arguments[1];
    const proxyLoanDeskAddress = arguments[2];

    console.log('Deployer address: \t\t', deployer.address);
    console.log('Balance before: \t\t', (await deployer.getBalance()).toString());

    const SaplingLendingPool = await ethers.getContractFactory('SaplingLendingPool');
    console.log('Preparing proposal...');
    const proposal = await defender.proposeUpgrade(proxyLendingPoolAddress, SaplingLendingPool);
    console.log('Upgrade proposal created at:', proposal.url);

    console.log("Done.");
    console.log("\nBalance after:  \t\t", (await deployer.getBalance()).toString());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
