var BankFair = artifacts.require("./BankFair.sol")

module.exports = async function(deployer) {
  deployer.deploy(BankFair, '0x3e22e37Cb472c872B5dE121134cFD1B57Ef06560', '0x81F42A658D551637fA5EDe6E4Bd75A9688dc2d9C', BigInt(100e6));
};