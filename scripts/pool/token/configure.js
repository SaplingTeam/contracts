const {ethers} = require("hardhat");

async function main() {
    [deployer, ...addrs] = await ethers.getSigners();

    const poolTokenAddress = '0x0000000000000000000000000000000000000000'; //REPLACE ME
    const poolAddress = '0x0000000000000000000000000000000000000000'; //REPLACE ME

    console.log("Deployer address: \t\t", deployer.address);
    console.log("Balance before: \t\t", (await deployer.getBalance()).toString());

    console.log("\nLoading pool token contract ...");
    let poolTokenContract = await ethers.getContractAt("PoolToken", poolTokenAddress);
    console.log("PoolToken address: \t", poolTokenContract.address);

    console.log("\nAssigning ownership ...");
    await poolTokenContract.transferOwnership(poolAddress);

    console.log("Done Configuring");
    console.log("\nBalance after:  \t\t", (await deployer.getBalance()).toString());
  }

  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
