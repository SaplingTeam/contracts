const { Wallet } = require("ethers");
const { ethers } = require("hardhat");

var config = require('./create-wallets.config.json');

async function main() {

    var wallets = [];

    for (let i = 0; i < config.numWallets; i++) {
        let wallet = await ethers.Wallet.createRandom();
        wallets.push({
            "address": wallet.address,
            "mnemonic": wallet.mnemonic,
            "signingKey": wallet._signingKey()
        });
    }

    console.log(JSON.stringify(wallets, null, 2));
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
