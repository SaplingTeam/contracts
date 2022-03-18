var TestToken = artifacts.require("./test/TestToken.sol");
var BankFairPool = artifacts.require("./BankFairPool.sol")

module.exports = async function(deployer) {
  const accounts = await web3.eth.getAccounts();
  let tokenContract = await deployer.deploy(TestToken, accounts[1], accounts[2], accounts[3], accounts[4]);
  await deployer.deploy(BankFairPool, tokenContract.address, BigInt(100e18));
};