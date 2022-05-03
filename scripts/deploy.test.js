/**
 * Deploy using TestUSDC from optimism-kovan testnet as a pool token.
 */
async function main() {
    [manager, protocol] = await ethers.getSigners();
  
    console.log("Deploying contracts with the account:", manager.address);
    console.log("Account balance:", (await manager.getBalance()).toString());

    BankFair = await ethers.getContractFactory("BankFair");
    bankFairContract = await BankFair.deploy('0x3e22e37Cb472c872B5dE121134cFD1B57Ef06560', protocol.address, BigInt(100e6))
    console.log("BankFair address:", bankFairContract.address);
  }
  
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
  