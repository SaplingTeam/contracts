async function main() {
    [deployer, governance, protocol, manager, ...addrs] = await ethers.getSigners();
  
    // console.log("Deployer address: \t\t", deployer.address);
    // console.log("Balance before: \t\t", (await deployer.getBalance()).toString());

    // TestToken = await ethers.getContractFactory("TestToken");
    // tokenContract = await TestToken.deploy("Test USDC", "TestUSDC", 6);

    // const DECIMALS = tokenContract.decimals();

    // PoolToken = await ethers.getContractFactory("PoolToken");
    // poolTokenContract = await PoolToken.deploy("Sapling Test Lending Pool Token", "SLPT", DECIMALS);

    // SaplingPool = await ethers.getContractFactory("SaplingLendingPool");
    // saplingPoolContract = await SaplingPool.deploy(poolTokenContract.address, tokenContract.address, deployer.address, protocol.address, manager.address);

    // LoanDesk = await ethers.getContractFactory("LoanDesk");
    // loanDeskContract = await LoanDesk.deploy(saplingPoolContract.address, governance.address, protocol.address, manager.address, DECIMALS);
    
    // await poolTokenContract.transferOwnership(saplingPoolContract.address);
    // await saplingPoolContract.setLoanDesk(loanDeskContract.address);
    // await saplingPoolContract.transferGovernance(governance.address);

    // console.log ("");
    // console.log("LiquidityToken address: \t", tokenContract.address);
    // console.log("PoolToken address: \t\t", poolTokenContract.address);
    // console.log("LoanDesk address: \t\t", loanDeskContract.address);
    // console.log("LendingPool address: \t\t", saplingPoolContract.address);
    // console.log ("");
    // console.log("Balance after:  \t\t", (await deployer.getBalance()).toString());

    const governanceAddress = governance.address;
    const protocolAddress = protocol.address;
    const managerAddress = manager.address;

    console.log("Deployer address: \t\t", deployer.address);
    console.log("Balance before: \t\t", (await deployer.getBalance()).toString());

    console.log("\nLoading liquidity token contract ...");
    TestToken = await ethers.getContractFactory("TestToken");
    liquidityTokenContract = await TestToken.deploy("Test USDC", "TestUSDC", 6);
    const liquidityTokenAddress = liquidityTokenContract.address;
    console.log("LiquidityToken address: \t", liquidityTokenContract.address);

    const DECIMALS = await liquidityTokenContract.decimals();

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
    console.log("Done");
  
    console.log("\nBalance after:  \t\t", (await deployer.getBalance()).toString());
  }
  
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
  
