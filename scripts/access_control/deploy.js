const { BigNumber } = require('ethers');

async function main() {
    [deployer, ...addrs] = await ethers.getSigners();

    console.log("START Deployment. Deployer: \t\t", deployer.address);
    console.log("Balance before: \t\t", (await deployer.getBalance()).toString());

    console.log("\nDeploying access control contract ...");
    let CoreAccessControlCF = await ethers.getContractFactory('CoreAccessControl');
    let coreAccessControl = await CoreAccessControlCF.deploy();

    console.log("CoreAccessControl address: \t\t", coreAccessControl.address);

    console.log("\nEND Deployment.");
    console.log("Balance after:  \t\t", (await deployer.getBalance()).toString());
  }

  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
