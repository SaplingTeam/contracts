const { BigNumber } = require('ethers');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
    [deployer, ...addrs] = await ethers.getSigners();

    const governanceAddress = '0x70f3637e717323b59A4C20977DB92652e584628b';
    const protocolAddress = '0x99FBBeb892b48e1eb8457d5a6e4991C46f802459';

    const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
    const GOVERNANCE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("GOVERNANCE_ROLE"));
    const TREASURY_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("TREASURY_ROLE"));
    const PAUSER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("PAUSER_ROLE"));

    console.log("Deployer address: \t\t", deployer.address);
    console.log("Balance before: \t\t", (await deployer.getBalance()).toString());

    console.log("\nDeploying access control contract ...");
    let CoreAccessControlCF = await ethers.getContractFactory('CoreAccessControl');
        coreAccessControl = await CoreAccessControlCF.deploy();

    console.log("CoreAccessControl address: \t\t", coreAccessControl.address);
    
    

    console.log("GOVERNANCE_ROLE: ", GOVERNANCE_ROLE);
    console.log("TREASURY_ROLE: ", TREASURY_ROLE);
    console.log("PAUSER_ROLE: ", PAUSER_ROLE);

    console.log("deployer: ", deployer.address);
    console.log("governance: ", governanceAddress);
    console.log("protocol: ", protocolAddress);

    console.log("\nAssigning ownership and linking contracts ...");
    await sleep(1);
    await coreAccessControl.connect(deployer).grantRole(GOVERNANCE_ROLE, governanceAddress);

    await sleep(1);
    await coreAccessControl.connect(deployer).grantRole(TREASURY_ROLE, protocolAddress);

    await sleep(1);
    await coreAccessControl.connect(deployer).grantRole(PAUSER_ROLE, governanceAddress);

    await sleep(1);
    await coreAccessControl.connect(deployer).grantRole(DEFAULT_ADMIN_ROLE, governanceAddress);
    
    await sleep(1);
    // keep admin role for local and test networks
    // await coreAccessControl.connect(deployer).renounceRole(DEFAULT_ADMIN_ROLE, deployer.address); 
    await coreAccessControl.connect(deployer).grantRole(GOVERNANCE_ROLE, deployer.address);

    console.log("Done Deployment");

    console.log("\nBalance after:  \t\t", (await deployer.getBalance()).toString());
  }

  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });

