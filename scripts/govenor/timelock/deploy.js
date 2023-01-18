const {ethers} = require("hardhat");

async function main() {
    [deployer, ...addrs] = await ethers.getSigners();

    const arguments = require('./arguments.js');

    const MIN_DELAY = arguments[0];
    const proposers = arguments[1];
    const executors = arguments[2];

    console.log("Deployer address: \t\t", deployer.address);
    console.log("Balance before: \t\t", (await deployer.getBalance()).toString());

    console.log("\nDeploying govenor contract ...");
    TimelockCF = await ethers.getContractFactory("TimelockController");
    timelockContract = await TimelockCF.deploy(MIN_DELAY, proposers, executors);
    console.log("Timelock address: \t\t", timelockContract.address);

    console.log("Done Deployment");
    console.log("\nBalance after:  \t\t", (await deployer.getBalance()).toString());
  }

  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });

