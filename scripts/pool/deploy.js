const {ethers} = require("hardhat");

async function main() {
    [deployer, ...addrs] = await ethers.getSigners();

    const arguments = require('./arguments.js');
    const poolTokenAddress = arguments[0];
    const liquidityTokenAddress = arguments[1];
    const coreAccessControlAddress = arguments[2];
    const stakerRoleName = arguments[3];

    //REPLACE with a unique name which in turn creates a unique role value
    const POOL_1_STAKER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(stakerRoleName));

    console.log("Deployer address: \t\t", deployer.address);
    console.log("Balance before: \t\t", (await deployer.getBalance()).toString());

    console.log("\nDeploying lending pool contract ...");
    SaplingPool = await ethers.getContractFactory("SaplingLendingPool");
    saplingPoolContract = await upgrades.deployProxy(SaplingPool, [
        poolTokenAddress,
        liquidityTokenAddress,
        coreAccessControlAddress,
        POOL_1_STAKER_ROLE,
    ]);
    await saplingPoolContract.deployed();
    console.log("LendingPool address: \t\t", saplingPoolContract.address);

    console.log("Done Deployment");
    console.log("\nBalance after:  \t\t", (await deployer.getBalance()).toString());
  }

  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });

