function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Deploy using TestUSDC from optimism-kovan testnet as a pool token.
 */
async function main() {
    [deployer, ...addrs] = await ethers.getSigners();
    const arguments = require('./arguments.lendingpool.polygon.js');
    const liquidityTokenAddress = arguments[1];
    const governanceAddress = arguments[2];
    const protocolAddress = arguments[3];
    const managerAddress = arguments[4];

    console.log("Deployer address: \t\t", deployer.address);
    console.log("Balance before: \t\t", (await deployer.getBalance()).toString());

    console.log("\nLoading liquidity token contract ...");
    liquidityTokenContract = await ethers.getContractAt("IERC20Metadata", liquidityTokenAddress);
    console.log("LiquidityToken address: \t", liquidityTokenContract.address);

    const DECIMALS = await liquidityTokenContract.decimals();

    console.log("\nDeploying pool token contract ...");
    PoolToken = await ethers.getContractFactory("PoolToken");
    poolTokenContract = await PoolToken.deploy("Training Pool Test Token", "TESTPT", DECIMALS);
    console.log("PoolToken address: \t\t", poolTokenContract.address);

    await sleep(5000);

    console.log("\nDeploying lending pool contract ...");
    SaplingPool = await ethers.getContractFactory("SaplingLendingPool");
    saplingPoolContract = await upgrades.deployProxy(SaplingPool, [
        poolTokenContract.address,
        liquidityTokenAddress,
        deployer.address,
        protocolAddress,
        deployer.address,
    ]);
    await saplingPoolContract.deployed();
    console.log("LendingPool address: \t\t", saplingPoolContract.address);

    await sleep(5000);

    console.log("\nDeploying loan desk contract ... ");
    LoanDesk = await ethers.getContractFactory("LoanDesk");
    loanDeskContract = await upgrades.deployProxy(LoanDesk, [
        saplingPoolContract.address,
        deployer.address,
        protocolAddress,
        deployer.address,
        DECIMALS,
    ]);
    await loanDeskContract.deployed();
    console.log("LoanDesk address: \t\t", loanDeskContract.address);

    console.log("\nAssigning ownership and linking contracts ...");
    await sleep(15000);
    await poolTokenContract.transferOwnership(saplingPoolContract.address);

    await sleep(15000);
    await saplingPoolContract.setLoanDesk(loanDeskContract.address);

    console.log("\nConfiguring parameters ...");
    await sleep(15000);
    await saplingPoolContract.setManagerEarnFactor(2280);

    await sleep(15000);
    await saplingPoolContract.setTargetStakePercent(500);

    await sleep(15000);
    await loanDeskContract.setTemplateLoanAPR(600);

    console.log("\nTransferring management ...");
    await sleep(15000);
    await loanDeskContract.transferManager(managerAddress);

    await sleep(15000);
    await saplingPoolContract.transferManager(managerAddress);

    console.log("\nTransferring governance ...");
    await sleep(15000);
    await loanDeskContract.transferGovernance(governanceAddress);

    await sleep(15000);
    await saplingPoolContract.transferGovernance(governanceAddress);

  
    console.log("Done.");

    console.log("\nBalance after:  \t\t", (await deployer.getBalance()).toString());
  }

  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
