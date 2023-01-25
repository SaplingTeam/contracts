const {ethers} = require("hardhat");

async function main() {
    [deployer, ...addrs] = await ethers.getSigners();

    const arguments = require('./arguments.js');

    const votingTokenAddress = arguments[0];

    console.log("Deployer address: \t\t", deployer.address);
    console.log("Balance before: \t\t", (await deployer.getBalance()).toString());

    console.log("\nDeploying govenor contract ...");
    GovernanceCF = await ethers.getContractFactory("LenderVotes");
    govenorContract = await GovernanceCF.deploy(votingTokenAddress);
    console.log("Govenor address: \t\t", govenorContract.address);

    console.log("Done Deployment");
    console.log("\nBalance after:  \t\t", (await deployer.getBalance()).toString());
  }

  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });

