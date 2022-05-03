async function main() {
    [manager, protocol, lender1, lender2, borrower1, borrower2] = await ethers.getSigners();
  
    console.log("Deploying contracts with the account:", manager.address);
    console.log("Account balance:", (await manager.getBalance()).toString());

    TestToken = await ethers.getContractFactory("TestToken");
    tokenContract = await TestToken.deploy(lender1.address, lender2.address, borrower1.address, borrower2.address);
    console.log("TestToken address:", tokenContract.address);

    BankFair = await ethers.getContractFactory("BankFair");
    bankFairContract = await BankFair.deploy(tokenContract.address, protocol.address, BigInt(100e18))
    console.log("BankFair address:", bankFairContract.address);
  }
  
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
  