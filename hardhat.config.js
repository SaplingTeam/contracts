require("@nomiclabs/hardhat-waffle");
require('solidity-docgen');
const { kovan, optimismKovan, testnetMnemonic } = require('./secrets.json');

module.exports = {
  solidity: "0.8.12",
  networks: {
    kovan: {
      url: `https://kovan.infura.io/v3/${kovan.projectId}`,
      chainId: 42,
      gas: 5500000,
      accounts: {
        mnemonic: testnetMnemonic
      }
    },
    optimism_kovan: {
      url: `https://opt-kovan.g.alchemy.com/v2/${optimismKovan.apiKey}`,
      chainId: 69,
      gas: 5500000,
      accounts: {
        mnemonic: testnetMnemonic
      }
    }
  },
  docgen: {
    pages: 'files',
  },
};
