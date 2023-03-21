const { expect } = require('chai');
const { BigNumber } = require('ethers');
const { ethers, upgrades } = require('hardhat');
const { assertHardhatInvariant } = require('hardhat/internal/core/errors');
const { snapshot, rollback } = require("./utils/evmControl");

let evmSnapshotIds = [];

describe('Sapling Math Context (via SaplingLendingPool)', function () {
    let saplingMath;

    let deployer;
    let governance;
    let protocol;
    let staker;
    let addresses;

    beforeEach(async function () {
        await snapshot(evmSnapshotIds);
    });

    afterEach(async function () {
        await rollback(evmSnapshotIds);
    });

    before(async function () {
        [deployer, governance, protocol, staker, ...addresses] = await ethers.getSigners();

        saplingMath = await (await ethers.getContractFactory('SaplingMath')).deploy();
    });

    describe('Use Cases', function () {
        let PERCENT_DECIMALS;

        before(async function () {
            PERCENT_DECIMALS = await saplingMath.PERCENT_DECIMALS();
        });

        describe('Initial State', function () {
            it('Percent Decimals is correct', async function () {
                expect(PERCENT_DECIMALS).to.equal(1);
            });

            it('"100%" value constant is correct', async function () {
                expect(await saplingMath.HUNDRED_PERCENT()).to.equal(100 * 10 ** PERCENT_DECIMALS);
            });
        });
    });
});
