const {ethers} = require("hardhat");

async function main() {
    [deployer, ...addrs] = await ethers.getSigners();

    const arguments = require('./arguments.js');
    const poolAddress = arguments[0];
    const liquidityTokenAddress = arguments[1];
    const coreAccessControlAddress = arguments[2];
    const stakerAddress = arguments[3];
    const lenderGovernanceRoleName = arguments[4];
    const DECIMALS = arguments[5];

    const POOL_1_LENDER_GOVERNANCE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(lenderGovernanceRoleName));

    console.log("Deployer address: \t\t", deployer.address);
    console.log("Balance before: \t\t", (await deployer.getBalance()).toString());

    console.log("\nDeploying loan desk contract ... ");
    let LoanDeskCF = await ethers.getContractFactory("LoanDesk");
    let loanDeskContract = await upgrades.deployProxy(LoanDeskCF, [
        poolAddress,
        liquidityTokenAddress,
        coreAccessControlAddress,
        stakerAddress,
        POOL_1_LENDER_GOVERNANCE_ROLE,
        DECIMALS,
    ]);
    await loanDeskContract.deployed();
    console.log("LoanDesk address: \t\t", loanDeskContract.address);

    console.log("Done Deployment");
    console.log("\nBalance after:  \t\t", (await deployer.getBalance()).toString());
  }

  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });

