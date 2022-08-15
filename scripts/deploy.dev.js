async function main() {
    [deployer, governance, protocol, manager, ...addrs] = await ethers.getSigners();
  
    console.log("Deploying contracts with the account:", deployer.address);
    console.log("Account balance: \t", (await deployer.getBalance()).toString());

    TestUSDC = await ethers.getContractFactory("TestUSDC");
    tokenContract = await TestUSDC.deploy();
    console.log("TestUSDC address: \t", tokenContract.address);

    const DECIMALS = tokenContract.decimals();

    PoolToken = await ethers.getContractFactory("PoolToken");
    poolTokenContract = await PoolToken.deploy("Sapling Lending Pool Token", "SLPT", DECIMALS);

    SaplingPool = await ethers.getContractFactory("SaplingLendingPool");
    saplingPoolContract = await SaplingPool.deploy(poolTokenContract.address, tokenContract.address, deployer.address, protocol.address, manager.address);
    

    poolTokenContract.transferOwnership(saplingPoolContract.address);

    const ONE_TOKEN = await saplingPoolContract.ONE_TOKEN();

    LoanDesk = await ethers.getContractFactory("LoanDesk");
    loanDeskContract = await LoanDesk.deploy(saplingPoolContract.address, governance.address, protocol.address, manager.address, ONE_TOKEN);
    
    await saplingPoolContract.setLoanDesk(loanDeskContract.address);
    await saplingPoolContract.transferGovernance(governance.address);

    console.log("PoolToken address: \t", poolTokenContract.address);
    console.log("LoanDesk address: \t", saplingPoolContract.address);
    console.log("LendingPool address: \t", saplingPoolContract.address);
  }
  
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
  