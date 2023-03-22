const { expect } = require('chai');

async function mintAndApprove(tokenContract, tokenOwner, recipient, spenderAddress, amount) {
    await tokenContract.connect(tokenOwner).mint(recipient.address, amount);
    await tokenContract.connect(recipient).approve(spenderAddress, amount);
}

function expectEqualsWithinMargin(bn1, bn2, bnMargin) {
    let halfMargin = bnMargin.div(2);
    expect(bn1).to.gte(bn2.sub(halfMargin)).and.to.lte(bn2.add(halfMargin));
}

module.exports = {
    mintAndApprove,
    expectEqualsWithinMargin,
};
