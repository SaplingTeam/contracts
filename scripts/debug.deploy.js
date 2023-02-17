const { BigNumber } = require('ethers');
const {ethers} = require("hardhat");

async function main() {
    [deployer, ...addrs] = await ethers.getSigners();

    const governanceAddress = '0x70f3637e717323b59A4C20977DB92652e584628b';
    const stakerAddress = '0x457aBC13c93D34FEc541C78aF91f64531eEe2516';

    const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
    const GOVERNANCE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("GOVERNANCE_ROLE"));
    const TREASURY_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("TREASURY_ROLE"));
    const PAUSER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("PAUSER_ROLE"));
    const POOL_1_LENDER_GOVERNANCE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("POOL_1_LENDER_GOVERNANCE_ROLE"));

    console.log("Deployer address: \t\t", deployer.address);
    console.log("Balance before: \t\t", (await deployer.getBalance()).toString());

    console.log("\nLoading liquidity token contract ...");
    TestToken = await ethers.getContractFactory("PoolToken");
    liquidityTokenContract = await TestToken.deploy("Test USDC", "TestUSDC", 6);
    const liquidityTokenAddress = liquidityTokenContract.address;
    console.log("LiquidityToken address: \t", liquidityTokenContract.address);

    const DECIMALS = await liquidityTokenContract.decimals();

    console.log("\nDeploying access control contract ...");
    let CoreAccessControlCF = await ethers.getContractFactory('CoreAccessControl');
        coreAccessControl = await CoreAccessControlCF.deploy();

    await coreAccessControl.connect(deployer).grantRole(GOVERNANCE_ROLE, deployer.address);

    await coreAccessControl.connect(deployer).grantRole(GOVERNANCE_ROLE, governanceAddress);
    await coreAccessControl.connect(deployer).grantRole(TREASURY_ROLE, governanceAddress);
    await coreAccessControl.connect(deployer).grantRole(PAUSER_ROLE, governanceAddress);

    console.log("GOVERNANCE_ROLE: ", GOVERNANCE_ROLE);
    console.log("TREASURY_ROLE: ", TREASURY_ROLE);
    console.log("PAUSER_ROLE: ", PAUSER_ROLE);

    console.log("deployer: ", deployer.address);
    console.log("governance: ", governanceAddress);
    console.log("staker: ", stakerAddress);

    console.log("\nDeploying pool token contract ...");
    PoolToken = await ethers.getContractFactory("PoolToken");
    poolTokenContract = await PoolToken.deploy("Sapling Test Lending Pool Token", "SLPT", DECIMALS);
    console.log("PoolToken address: \t\t", poolTokenContract.address);

    console.log("\nDeploying lending pool contract ...");
    SaplingPool = await ethers.getContractFactory("SaplingLendingPool");
    saplingPoolContract = await upgrades.deployProxy(SaplingPool, [
        poolTokenContract.address,
        liquidityTokenAddress,
        coreAccessControl.address,
        stakerAddress,
    ]);
    await saplingPoolContract.deployed();
    console.log("LendingPool address: \t\t", saplingPoolContract.address);

    console.log("\nDeploying loan desk contract ... ");
    LoanDesk = await ethers.getContractFactory("LoanDesk");
    loanDeskContract = await upgrades.deployProxy(LoanDesk, [
        saplingPoolContract.address,
        coreAccessControl.address,
        stakerAddress,
        POOL_1_LENDER_GOVERNANCE_ROLE,
        DECIMALS,
    ]);
    await loanDeskContract.deployed();
    console.log("LoanDesk address: \t\t", loanDeskContract.address);

    console.log("\nAssigning ownership and linking contracts ...");
    await poolTokenContract.transferOwnership(saplingPoolContract.address);
    await saplingPoolContract.setLoanDesk(loanDeskContract.address);

    await coreAccessControl.connect(deployer).grantRole(DEFAULT_ADMIN_ROLE, governanceAddress);
    await coreAccessControl.connect(deployer).renounceRole(DEFAULT_ADMIN_ROLE, deployer.address);
    await coreAccessControl.connect(deployer).renounceRole(GOVERNANCE_ROLE, deployer.address);

    console.log("Done Deployment");

    console.log("\nMinting liquidity tokens for testing ...");
    let mintAmount = BigNumber.from(100000).mul(BigNumber.from(10).pow(DECIMALS));
    await liquidityTokenContract.connect(deployer).mint(stakerAddress, mintAmount);
    await deployer.sendTransaction({
      to: stakerAddress,
      value: ethers.utils.parseEther("1000.0"),
    });
    for (let i = 0; i++; i < 10) {
      await liquidityTokenContract.connect(deployer).mint(addresses[i].address, mintAmount);
    }

    console.log("Done minting");
    console.log("\nBalance after:  \t\t", (await deployer.getBalance()).toString());
  }

  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });

