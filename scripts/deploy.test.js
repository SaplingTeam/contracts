const { ethers } = require('hardhat');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Deploy using TestUSDC from optimism-kovan testnet as a pool token.
 */
async function main() {
    [deployer, ...addrs] = await ethers.getSigners();
    const arguments = require('./arguments.lendingpool.polygon.mumbai.js');
    const liquidityTokenAddress = arguments[1];
    const managerAddress = arguments[4];
    const coreACAddress = arguments[5];

    const POOL_1_MANAGER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("POOL_1_MANAGER_ROLE"));

    console.log("Deployer address: \t\t", deployer.address);
    console.log("Balance before: \t\t", (await deployer.getBalance()).toString());

    console.log("\nLoading coreAccessControl contract ...");
    coreAccessControl = await ethers.getContractAt("CoreAccessControl", coreACAddress);
    console.log("CoreAccessControl address: \t", coreAccessControl.address);

    console.log("\nLoading liquidity token contract ...");
    liquidityTokenContract = await ethers.getContractAt("IERC20Metadata", liquidityTokenAddress);
    console.log("LiquidityToken address: \t", liquidityTokenContract.address);

    const DECIMALS = await liquidityTokenContract.decimals();

    console.log("\nDeploying pool token contract ...");
    PoolToken = await ethers.getContractFactory("PoolToken");
    poolTokenContract = await PoolToken.deploy("Sapling Test Lending Pool Token", "SLPT", DECIMALS);
    console.log("PoolToken address: \t\t", poolTokenContract.address);

    console.log("\nDeploying lending pool contract ...");
    SaplingPool = await ethers.getContractFactory("SaplingLendingPool");
    saplingPoolContract = await upgrades.deployProxy(SaplingPool, [
      poolTokenContract.address,
      liquidityTokenAddress,
      coreAccessControl.address,
      POOL_1_MANAGER_ROLE,
      POOL_1_LENDER_GOVERNANCE_ROLE,
  ]);
    await saplingPoolContract.deployed();
  saplingPoolContract = await ethers.getContractAt("SaplingLendingPool", '0xADC6b846bdA2909a9218a9E7957aa0469B96626B');
    console.log("LendingPool address: \t\t", saplingPoolContract.address);

    console.log("\nDeploying loan desk contract ... ");
    LoanDesk = await ethers.getContractFactory("LoanDesk");
    loanDeskContract = await upgrades.deployProxy(LoanDesk, [
      saplingPoolContract.address,
      coreAccessControl.address,
      POOL_1_MANAGER_ROLE,
      POOL_1_LENDER_GOVERNANCE_ROLE,
      DECIMALS,
  ]);
    await loanDeskContract.deployed();
    console.log("LoanDesk address: \t\t", loanDeskContract.address);

    console.log("\nAssigning ownership and linking contracts ...");
    await sleep(1);
    await poolTokenContract.transferOwnership(saplingPoolContract.address);
    await sleep(1);
    await saplingPoolContract.setLoanDesk(loanDeskContract.address);
    await sleep(1);
    await coreAccessControl.connect(deployer).grantRole(POOL_1_MANAGER_ROLE, managerAddress);
    console.log("Done.");

    console.log("\nBalance after:  \t\t", (await deployer.getBalance()).toString());
  }

  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
