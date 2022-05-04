require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-etherscan");
require('solidity-docgen');

const { kovanConfig, optimisticKovanConfig, testnetMnemonic } = require('./secrets.json');

module.exports = {
  solidity: "0.8.12",
  networks: {
    kovan: {
      url: `https://kovan.infura.io/v3/${kovanConfig.infuraProjectId}`,
      chainId: 42,
      gas: 5500000,
      accounts: {
        mnemonic: testnetMnemonic
      }
    },
    optimisticKovan: {
      url: `https://opt-kovan.g.alchemy.com/v2/${optimisticKovanConfig.alchemyApiKey}`,
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
  etherscan: {
    apiKey: {
        kovan: kovanConfig.etherscanApiKey,
        optimisticKovan: optimisticKovanConfig.etherscanApiKey,
    }
  },
};
