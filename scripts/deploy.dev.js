async function main() {
    [deployer, governance, protocol, manager, ...addrs] = await ethers.getSigners();

    const governanceAddress = governance.address;
    const protocolAddress = protocol.address;
    const managerAddress = manager.address;

    console.log("Deployer address: \t\t", deployer.address);
    console.log("Balance before: \t\t", (await deployer.getBalance()).toString());

    console.log("\nLoading liquidity token contract ...");
    TestToken = await ethers.getContractFactory("PoolToken");
    liquidityTokenContract = await TestToken.deploy("Test USDC", "TestUSDC", 6);
    const liquidityTokenAddress = liquidityTokenContract.address;
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
        deployer.address,
        protocolAddress,
        managerAddress,
    ]);
    await saplingPoolContract.deployed();
    console.log("LendingPool address: \t\t", saplingPoolContract.address);

    console.log("\nDeploying loan desk contract ... ");
    LoanDesk = await ethers.getContractFactory("LoanDesk");
    loanDeskContract = await upgrades.deployProxy(LoanDesk, [
        saplingPoolContract.address,
        governanceAddress,
        protocolAddress,
        managerAddress,
        DECIMALS,
    ]);
    await loanDeskContract.deployed();
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

