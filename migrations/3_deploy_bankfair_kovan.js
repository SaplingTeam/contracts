var BankFairPool = artifacts.require("./BankFairPool.sol")

module.exports = async function(deployer) {
  deployer.deploy(BankFairPool, '0xB347b9f5B56b431B2CF4e1d90a5995f7519ca792', BigInt(10e18));
};