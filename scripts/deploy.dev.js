async function main() {
    [deployer, governance, protocol, manager, ...addrs] = await ethers.getSigners();
  
    console.log("Deploying contracts with the account:", deployer.address);
    console.log("Account balance:", (await deployer.getBalance()).toString());

    TestUSDC = await ethers.getContractFactory("TestUSDC");
    tokenContract = await TestUSDC.deploy();
    console.log("TestUSDC address:", tokenContract.address);

    SaplingPool = await ethers.getContractFactory("SaplingPool");
    saplingPoolContract = await SaplingPool.deploy(tokenContract.address, governance.address, protocol.address, manager.address)
    console.log("SaplingPool address:", saplingPoolContract.address);
  }
  
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
  