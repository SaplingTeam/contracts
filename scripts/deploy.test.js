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

    console.log("Deployer address: \t\t", deployer.address);
    console.log("Balance before: \t\t", (await deployer.getBalance()).toString());

    console.log("\nLoading liquidity token contract ...");
    TestToken = await ethers.getContractFactory("TestToken");
    liquidityTokenContract = await TestToken.attach(liquidityTokenAddress);
    console.log("LiquidityToken address: \t", liquidityTokenContract.address);

    const DECIMALS = await tokenContract.decimals();

    console.log("\nDeploying pool token contract ...");
    PoolToken = await ethers.getContractFactory("PoolToken");
    poolTokenContract = await PoolToken.deploy("Sapling Lending Pool Token", "SLPT", DECIMALS);
    console.log("PoolToken address: \t\t", poolTokenContract.address);

    console.log("\nDeploying lending pool contract ...");
    SaplingPool = await ethers.getContractFactory("SaplingLendingPool");
    saplingPoolContract = await SaplingPool.deploy(poolTokenContract.address, liquidityTokenAddress, deployer.address, protocolAddress, managerAddress);
    console.log("LendingPool address: \t\t", saplingPoolContract.address);

    console.log("\nDeploying loan desk contract ... ");
    LoanDesk = await ethers.getContractFactory("LoanDesk");
    loanDeskContract = await LoanDesk.deploy(saplingPoolContract.address, governanceAddress, protocolAddress, managerAddress, DECIMALS);
    console.log("LoanDesk address: \t\t", loanDeskContract.address);

    console.log("\nAssigning ownership and linking contracts ...");
    await poolTokenContract.transferOwnership(saplingPoolContract.address);
    await saplingPoolContract.setLoanDesk(loanDeskContract.address);
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
  