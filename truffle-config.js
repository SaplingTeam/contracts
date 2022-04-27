const path = require("path");
const { projectId, mnemonic } = require('./secrets.json');
const HDWalletProvider = require('@truffle/hdwallet-provider');

module.exports = {
  // See <http://truffleframework.com/docs/advanced/configuration>
  // to customize your Truffle configuration!
  contracts_build_directory: path.join(__dirname, "contracts/artifacts"),
  networks: {
    develop: {
      port: 7545
    },
    kovan: {
      provider: () => new HDWalletProvider(mnemonic, `https://kovan.infura.io/v3/${projectId}`),
      network_id: 42,       
      gas: 5500000,        
    },
  },
  
  compilers: {
    solc: {
      version: "0.8.12"
    }
  }
};