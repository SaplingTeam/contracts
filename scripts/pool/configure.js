
const {ethers} = require("hardhat");

async function main() {
    [deployer, ...addrs] = await ethers.getSigners();

    const loanDeskAddress = '0x0000000000000000000000000000000000000000'; //REPLACE ME
    const poolAddress = '0x0000000000000000000000000000000000000000'; //REPLACE ME

    console.log("Deployer address: \t\t", deployer.address);
    console.log("Balance before: \t\t", (await deployer.getBalance()).toString());

    console.log("\nLoading pool contract ...");
    let poolContract = await ethers.getContractAt("SaplingLendingPool", poolAddress);
    console.log("Pool address: \t", poolContract.address);

    console.log("\nSetting LoanDesk ...");
    await poolContract.setLoanDesk(loanDeskAddress);

    console.log("Done Configuring");
    console.log("\nBalance after:  \t\t", (await deployer.getBalance()).toString());
  }

  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
