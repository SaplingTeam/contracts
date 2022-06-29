async function main() {
    [manager, protocol, governance, lender1, lender2, borrower1, borrower2] = await ethers.getSigners();
  
    console.log("Deploying contracts with the account:", manager.address);
    console.log("Account balance:", (await manager.getBalance()).toString());

    TestUSDC = await ethers.getContractFactory("TestUSDC");
    tokenContract = await TestUSDC.deploy();
    console.log("TestUSDC address:", tokenContract.address);

    SaplingPool = await ethers.getContractFactory("SaplingPool");
    saplingPoolContract = await SaplingPool.deploy(tokenContract.address, governance.address, protocol.address, BigInt(100e6))
    console.log("SaplingPool address:", saplingPoolContract.address);
  }
  
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
  