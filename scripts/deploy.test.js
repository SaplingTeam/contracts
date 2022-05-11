/**
 * Deploy using TestUSDC from optimism-kovan testnet as a pool token.
 */
async function main() {
    [manager] = await ethers.getSigners();
    const arguments = require('./arguments.optimistic.kovan.js');
  
    console.log("Deploying contracts with the account:", manager.address);
    console.log("Account balance:", (await manager.getBalance()).toString());

    SaplingPool = await ethers.getContractFactory("SaplingPool");
    poolContract = await SaplingPool.deploy(...arguments);
    console.log("SaplingPool address:", poolContract.address);
  }
  
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
  