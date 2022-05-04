/**
 * Deploy using TestUSDC from optimism-kovan testnet as a pool token.
 */
async function main() {
    [manager] = await ethers.getSigners();
    const arguments = require('./arguments.optimistic.kovan.js');
  
    console.log("Deploying contracts with the account:", manager.address);
    console.log("Account balance:", (await manager.getBalance()).toString());

    BankFair = await ethers.getContractFactory("BankFair");
    bankFairContract = await BankFair.deploy(...arguments);
    console.log("BankFair address:", bankFairContract.address);
  }
  
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
  