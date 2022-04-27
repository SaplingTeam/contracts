const path = require("path");
const { kovan, optimismKovan, mnemonic } = require('./secrets.json');
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
      provider: () => new HDWalletProvider(mnemonic, `https://kovan.infura.io/v3/${kovan.projectId}`),
      network_id: 42,       
      gas: 5500000,        
    },
    optimism_kovan: {
      provider: () => new HDWalletProvider(mnemonic, `https://opt-kovan.g.alchemy.com/v2/${optimismKovan.apiKey}`),
      network_id: 69,       
      gas: 5500000,        
    }
  },
  
  compilers: {
    solc: {
      version: "0.8.12"
    }
  },

  plugins: [
    'truffle-plugin-stdjsonin'
  ],
};