/**
 * Deploy using TestUSDC from optimism-kovan testnet as a pool token.
 */
async function main() {
    [deployer, ...addrs] = await ethers.getSigners();
    const arguments = require('./arguments.lendingpool.polygon.mumbai.js');
    const liquidityTokenAddress = arguments[1];
    const governanceAddress = arguments[2];
    const protocolAddress = arguments[3];
    const managerAddress = arguments[4];

    console.log('Deployer address: \t\t', deployer.address);
    console.log('Balance before: \t\t', (await deployer.getBalance()).toString());

    console.log('\nDeploying token factory ...');
    let tokenFactory = await (await ethers.getContractFactory('TokenFactory')).deploy();
    console.log('TokenFactory address: \t\t', tokenFactory.address);

    console.log('\nDeploying loan desk factory ...');
    let loanDeskFactory = await (await ethers.getContractFactory('LoanDeskFactory')).deploy();
    console.log('LoanDeskFactory address: \t\t', loanDeskFactory.address);

    console.log('\nDeploying pool factory ... ');
    let poolFactory = await (await ethers.getContractFactory('PoolFactory')).deploy();
    console.log('PoolFactory address: \t\t', poolFactory.address);

    console.log('\nDeploying Sapling factory ... ');
    let saplingFactory = await (
        await ethers.getContractFactory('SaplingFactory')
    ).deploy(tokenFactory.address, loanDeskFactory.address, poolFactory.address);
    console.log('SaplingFactory address: \t\t', saplingFactory.address);

    console.log('\nAssigning ownership and linking contracts ...');
    await tokenFactory.transferOwnership(saplingFactory.address);
    await loanDeskFactory.transferOwnership(saplingFactory.address);
    await poolFactory.transferOwnership(saplingFactory.address);
    await saplingFactory.transferOwnership(governanceAddress);
    console.log('Done.');

    console.log('\nBalance after:  \t\t', (await deployer.getBalance()).toString());
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
