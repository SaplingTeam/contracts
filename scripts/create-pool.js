const { Wallet, BigNumber } = require("ethers");
const { ethers } = require("hardhat");

var config = require('./create-pool.config.json');
var wallets = require('./data/wallets.json');

const DEPLOYER_ADDRESS_INDEX = 0;
const MANAGER_ETH = "0.0001";
const LENDER_ETH = "0.0000001";
const BORROWER_ETH = "0.0000001";

async function main() {

    console.log("Wallets offset: %s", config.walletsOffset);

    let deployer = await ethers.Wallet.fromMnemonic(wallets[DEPLOYER_ADDRESS_INDEX].mnemonic.phrase).connect(ethers.provider);

    let TestUSDC = await ethers.getContractFactory("TestUSDC");
    let tokenContract;
    if (config.dryRun === true) {
        tokenContract = await TestUSDC.connect(deployer).deploy();
    } else {
        tokenContract = TestUSDC.attach(config.capitalToken);
    }

    let TOKEN_DECIMALS = await tokenContract.decimals();
    let TOKEN_MULTIPLIER = BigNumber.from(10).pow(TOKEN_DECIMALS);

    let nextWallet = 0;
    let manager = await ethers.Wallet.fromMnemonic(wallets[nextWallet + config.walletsOffset].mnemonic.phrase).connect(ethers.provider);
    nextWallet++;

    await deployer.sendTransaction({
        to: manager.address,
        value: ethers.utils.parseEther(MANAGER_ETH),
      });

    let SaplingPool = await ethers.getContractFactory("SaplingLendingPool");
    let poolContract = await SaplingPool.connect(deployer).deploy(tokenContract.address, wallets[config.governanceAddressIndex].address, wallets[config.protocolAddressIndex].address, manager.address)
    console.log("Lending pool deployed at: %s", poolContract.address);
    console.log("Manager: %s", manager.address);
    
    let PERCENT_DECIMALS = await poolContract.PERCENT_DECIMALS();

    let poolSizeBN = BigNumber.from(config.poolSize).mul(TOKEN_MULTIPLIER);

    //set apr
    await poolContract.connect(manager).setTemplateLoanAPR(BigNumber.from(config.loanAPR).mul(BigNumber.from(10).pow(PERCENT_DECIMALS)));
    
    // stake
    let stakeAmount = poolSizeBN.mul(config.stakePercent).div(100);
    await tokenContract.connect(deployer).mint(manager.address, stakeAmount);
    await tokenContract.connect(manager).approve(poolContract.address, stakeAmount);
    await poolContract.connect(manager).stake(stakeAmount);

    // deposit
    let remainingDepositAmount = poolSizeBN.sub(stakeAmount);
    let singleDepositAmount = remainingDepositAmount.div(config.numLenders);

    for (let i = 0; i < config.numLenders; i++) {
        let lender = await ethers.Wallet.fromMnemonic(wallets[nextWallet + config.walletsOffset].mnemonic.phrase).connect(ethers.provider);
        nextWallet++;
        await deployer.sendTransaction({
            to: lender.address,
            value: ethers.utils.parseEther(LENDER_ETH),
        });
        
        let depositAmount = i === config.numLenders - 1 ? remainingDepositAmount : singleDepositAmount;

        await tokenContract.connect(deployer).mint(lender.address, depositAmount);
        await tokenContract.connect(lender).approve(poolContract.address, depositAmount);
        await poolContract.connect(lender).deposit(depositAmount);

        remainingDepositAmount = remainingDepositAmount.sub(depositAmount);

        console.log("Lender %s: %s", i+1, lender.address);
    }

    // borrow
    let remainingLoanAmount = BigNumber.from(config.borrowedFunds).mul(TOKEN_MULTIPLIER);
    let singleLoanAmount = remainingLoanAmount.div(config.numBorrowers);
    let loanDuration = BigNumber.from(365).mul(24*60*60);

    for (let i = 0; i < config.numBorrowers; i++) {
        let borrower = await ethers.Wallet.fromMnemonic(wallets[nextWallet + config.walletsOffset].mnemonic.phrase).connect(ethers.provider);
        nextWallet++;
        await deployer.sendTransaction({
            to: borrower.address,
            value: ethers.utils.parseEther(BORROWER_ETH),
        });

        let loanAmount = i === config.numBorrowers - 1 ? remainingLoanAmount : singleLoanAmount;
        let requestLoanTx = await loanDesk.connect(borrower).requestLoan(loanAmount, loanDuration);
        let loanId = BigNumber.from((await requestLoanTx.wait()).events[0].data);

        await loanDesk.connect(manager).approveLoan(loanId);
        await poolContract.connect(borrower).borrow(loanId);

        remainingLoanAmount = remainingLoanAmount.sub(loanAmount);

        console.log("Borrower %s: %s", i+1, borrower.address);
    }
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
