const { ethers } = require("hardhat");

async function skipEvmTime(durationSeconds) {
    await ethers.provider.send('evm_increaseTime', [durationSeconds]);
    await ethers.provider.send('evm_mine');
}

async function snapshot(evmSnapshotIds) {
    let id = await hre.network.provider.send('evm_snapshot');
    evmSnapshotIds.push(id);
}

async function rollback(evmSnapshotIds) {
    let id = evmSnapshotIds.pop();
    await hre.network.provider.send('evm_revert', [id]);
}

module.exports = {
    skipEvmTime,
    snapshot,
    rollback
}