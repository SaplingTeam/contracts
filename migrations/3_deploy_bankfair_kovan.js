var BankFair = artifacts.require("./BankFairPool.sol")

module.exports = async function(deployer) {
  deployer.deploy(BankFair, '0xB347b9f5B56b431B2CF4e1d90a5995f7519ca792', '0x81F42A658D551637fA5EDe6E4Bd75A9688dc2d9C', BigInt(10e18));
};