var TestToken = artifacts.require("./test/TestToken.sol");
var BankFair = artifacts.require("./BankFair.sol")

module.exports = async function(deployer) {
  const accounts = await web3.eth.getAccounts();
  let tokenContract = await deployer.deploy(TestToken, accounts[1], accounts[2], accounts[3], accounts[4]);
  await deployer.deploy(BankFair, tokenContract.address, accounts[9], BigInt(100e18));
};