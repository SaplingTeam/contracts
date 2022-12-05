const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { ethers, upgrades } = require('hardhat');
const { assertHardhatInvariant } = require('hardhat/internal/core/errors');

let evmSnapshotIds = [];

async function snapshot() {
    let id = await hre.network.provider.send('evm_snapshot');
    evmSnapshotIds.push(id);
}

async function rollback() {
    let id = evmSnapshotIds.pop();
    await hre.network.provider.send('evm_revert', [id]);
}

describe('Sapling Math Context (via SaplingLendingPool)', function () {
    let saplingMath;

    let deployer;
    let governance;
    let protocol;
    let manager;
    let addresses;

    beforeEach(async function () {
        await snapshot();
    });

    afterEach(async function () {
        await rollback();
    });

    before(async function () {
        [deployer, governance, protocol, manager, ...addresses] = await ethers.getSigners();

        saplingMath = await (await ethers.getContractFactory('SaplingMath')).deploy();
    });

    describe('Use Cases', function () {
        let PERCENT_DECIMALS;

        before(async function () {
            PERCENT_DECIMALS = await saplingMath.percentDecimals();
        });

        describe('Initial State', function () {
            it('Percent Decimals is correct', async function () {
                expect(PERCENT_DECIMALS).to.equal(1);
            });

            it('"100%" value constant is correct', async function () {
                expect(await saplingMath.oneHundredPercent()).to.equal(100 * 10 ** PERCENT_DECIMALS);
            });
        });
    });
});
