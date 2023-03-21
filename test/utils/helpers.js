
async function mintAndApprove(tokenContract, tokenOwner, recipient, spenderAddress, amount) {
    await tokenContract.connect(tokenOwner).mint(recipient.address, amount);
    await tokenContract.connect(recipient).approve(spenderAddress, amount);
}

module.exports = {
    mintAndApprove,
}