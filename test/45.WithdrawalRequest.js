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

describe('Sapling Lending Pool - Withdrawal Requests', function () {
    const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
    const TOKEN_DECIMALS = 6;

    const DEFAULT_ADMIN_ROLE = '0x0000000000000000000000000000000000000000000000000000000000000000';
    const GOVERNANCE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("GOVERNANCE_ROLE"));
    const TREASURY_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("TREASURY_ROLE"));
    const PAUSER_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("PAUSER_ROLE"));
    const POOL_1_LENDER_GOVERNANCE_ROLE = ethers.utils.keccak256(ethers.utils.toUtf8Bytes("POOL_1_LENDER_GOVERNANCE_ROLE"));

    let coreAccessControl;

    let SaplingLendingPoolCF;
    let liquidityToken;
    let poolToken;
    let loanDesk;
    let saplingMath;

    let deployer;
    let governance;
    let lenderGovernance;
    let protocol;
    let staker;
    let addresses;

    beforeEach(async function () {
        await snapshot();
    });

    afterEach(async function () {
        await rollback();
    });

    before(async function () {
        [deployer, governance, lenderGovernance, protocol, staker, ...addresses] = await ethers.getSigners();

        let CoreAccessControlCF = await ethers.getContractFactory('CoreAccessControl');
        coreAccessControl = await CoreAccessControlCF.deploy();

        await coreAccessControl.connect(deployer).grantRole(DEFAULT_ADMIN_ROLE, governance.address);
        await coreAccessControl.connect(deployer).renounceRole(DEFAULT_ADMIN_ROLE, deployer.address);

        await coreAccessControl.connect(governance).grantRole(GOVERNANCE_ROLE, governance.address);
        await coreAccessControl.connect(governance).grantRole(TREASURY_ROLE, protocol.address);
        await coreAccessControl.connect(governance).grantRole(PAUSER_ROLE, governance.address);

        await coreAccessControl.connect(governance).grantRole(POOL_1_LENDER_GOVERNANCE_ROLE, lenderGovernance.address);

        SaplingLendingPoolCF = await ethers.getContractFactory('SaplingLendingPool');
        let LoanDeskCF = await ethers.getContractFactory('LoanDesk');

        liquidityToken = await (
            await ethers.getContractFactory('PoolToken')
        ).deploy('Test USDC', 'TestUSDC', TOKEN_DECIMALS);

        poolToken = await (
            await ethers.getContractFactory('PoolToken')
        ).deploy('Sapling Test Lending Pool Token', 'SLPT', TOKEN_DECIMALS);

        lendingPool = await upgrades.deployProxy(SaplingLendingPoolCF, [
            poolToken.address,
            liquidityToken.address,
            coreAccessControl.address,
            protocol.address,
            staker.address
        ]);
        await lendingPool.deployed();

        loanDesk = await upgrades.deployProxy(LoanDeskCF, [
            lendingPool.address,
            liquidityToken.address,
            coreAccessControl.address,
            staker.address,
            POOL_1_LENDER_GOVERNANCE_ROLE,
        ]);
        await loanDesk.deployed();

        await poolToken.connect(deployer).transferOwnership(lendingPool.address);
        await lendingPool.connect(governance).setLoanDesk(loanDesk.address);

        saplingMath = await (await ethers.getContractFactory('SaplingMath')).deploy();

        let initialMintAmount = 10 ** TOKEN_DECIMALS;
        await liquidityToken.connect(deployer).mint(staker.address, initialMintAmount);
        await liquidityToken.connect(staker).approve(lendingPool.address, initialMintAmount);
        await lendingPool.connect(staker).initialMint();

        await lendingPool.connect(staker).open();
        await loanDesk.connect(staker).open();
    });

    describe('Use Cases', function () {
        const LoanStatus = {
            NULL: 0,
            OUTSTANDING: 1,
            REPAID: 2,
            DEFAULTED: 3,
        };

        let PERCENT_DECIMALS;
        let TOKEN_MULTIPLIER;
        let ONE_HUNDRED_PERCENT;
        let exitFeePercent;

        let lenders;
        let borrower1;
        let borrower2;

        let loanId;

        before(async function () {
            PERCENT_DECIMALS = await saplingMath.PERCENT_DECIMALS();
            TOKEN_MULTIPLIER = BigNumber.from(10).pow(TOKEN_DECIMALS);
            ONE_HUNDRED_PERCENT = await saplingMath.HUNDRED_PERCENT();
            exitFeePercent = (await lendingPool.config()).exitFeePercent;

            lenders = [
                addresses[1],
                addresses[2],
                addresses[3]
            ]

            borrower1 = addresses[4];
            borrower2 = addresses[5];

            let stakeAmount = BigNumber.from(1000).mul(TOKEN_MULTIPLIER);
            let depositAmounts = [
                BigNumber.from(2000).mul(TOKEN_MULTIPLIER), 
                BigNumber.from(900).mul(TOKEN_MULTIPLIER), 
                BigNumber.from(100).mul(TOKEN_MULTIPLIER),
            ];
            let loanAmount = BigNumber.from(3950).mul(TOKEN_MULTIPLIER);
            let loanDuration = BigNumber.from(365).mul(24 * 60 * 60);

            await liquidityToken.connect(deployer).mint(staker.address, stakeAmount);
            await liquidityToken.connect(staker).approve(lendingPool.address, stakeAmount);
            await lendingPool.connect(staker).stake(stakeAmount);

            for (let i = 0; i < lenders.length; i++) {
                await liquidityToken.connect(deployer).mint(lenders[i].address, depositAmounts[i]);
                await liquidityToken.connect(lenders[i]).approve(lendingPool.address, depositAmounts[i]);
                await lendingPool.connect(lenders[i]).deposit(depositAmounts[i]);
            }

            gracePeriod = (await loanDesk.loanTemplate()).gracePeriod;
            installments = 1;
            apr = (await loanDesk.loanTemplate()).apr;
            
            await loanDesk
                .connect(borrower1)
                .requestLoan(
                    loanAmount,
                    loanDuration,
                    'a937074e-85a7-42a9-b858-9795d9471759',
                    '6ed20e4f9a1c7827f58bf833d47a074cdbfa8773f21c1081186faba1569ddb29',
                );
            let applicationId = await loanDesk.recentApplicationIdOf(borrower1.address);
            let application = await loanDesk.loanApplications(applicationId);
            await loanDesk
                .connect(staker)
                .draftOffer(
                    applicationId,
                    application.amount,
                    application.duration,
                    gracePeriod,
                    0,
                    installments,
                    apr,
                );
            await loanDesk.connect(staker).lockDraftOffer(applicationId);
            await ethers.provider.send('evm_increaseTime', [2*24*60*60 + 1]);
                await ethers.provider.send('evm_mine');
                await loanDesk.connect(staker).offerLoan(applicationId);
            let tx = await loanDesk.connect(borrower1).borrow(applicationId);
            loanId = (await tx.wait()).events.filter((e) => e.event === 'LoanBorrowed')[0].args.loanId;
        });

        describe('Withdrawal Request', function () {

            after(async function () {
                await rollback();
            });

            before(async function () {
                await snapshot();
            });

            it('Can make a withdrawal request', async function () {
                let poolTokens = (await poolToken.balanceOf(lenders[2].address)).mul(4).div(5);
        
                assertHardhatInvariant(poolTokens >= 0);

                let balanceDelta = poolTokens;
                await poolToken.connect(lenders[2]).approve(lendingPool.address, poolTokens);
                await expect(lendingPool.connect(lenders[2]).requestWithdrawal(poolTokens)).to.changeTokenBalances(
                    poolToken,
                    [lenders[2].address, lendingPool.address],
                    [-balanceDelta, balanceDelta],
                );

                let requestState = await lendingPool.withdrawalRequestStates(lenders[2].address);
                expect(requestState.sharesLocked).to.equal(balanceDelta);
                expect(requestState.countOutstanding).to.equal(1);
            });

            it('Can queue withdrawal requests', async function () {
                for (let i = 0; i < lenders.length; i++) {
                    let poolTokens = (await poolToken.balanceOf(lenders[2].address)).mul(4).div(5);
        
                    assertHardhatInvariant(poolTokens >= 0);

                    let balanceDelta = poolTokens;
                    await poolToken.connect(lenders[i]).approve(lendingPool.address, poolTokens);
                    await expect(lendingPool.connect(lenders[i]).requestWithdrawal(poolTokens)).to.changeTokenBalances(
                        poolToken,
                        [lenders[i].address, lendingPool.address],
                        [-balanceDelta, balanceDelta],
                    );
                }
            });

            it('Withdrawal request will immediately fulfill when liquidity is available', async function () {
                let amount = BigNumber.from(10).mul(TOKEN_MULTIPLIER);
                let poolTokens = await lendingPool.fundsToShares(amount);

                assertHardhatInvariant(await lendingPool.amountWithdrawable(lenders[2].address) >= amount);

                let exitFee = amount.mul(exitFeePercent).div(ONE_HUNDRED_PERCENT);
                let balanceDelta = amount.sub(exitFee);

                await expect(lendingPool.connect(lenders[2]).requestWithdrawal(poolTokens)).to.changeTokenBalances(
                    liquidityToken,
                    [lenders[2].address, lendingPool.address],
                    [balanceDelta, -balanceDelta],
                );
            });
        });

        describe('Actions on a Withdrawal Queue', function () {

            after(async function () {
                await rollback();
            });

            before(async function () {
                await snapshot();

                for (let i = 0; i < lenders.length; i++) {
                    let poolTokens = (await poolToken.balanceOf(lenders[i].address)).mul(4).div(5);
        
                    assertHardhatInvariant(poolTokens >= 0);

                    await poolToken.connect(lenders[i]).approve(lendingPool.address, poolTokens);
                    await lendingPool.connect(lenders[i]).requestWithdrawal(poolTokens);
                }
            });

            it('Can fulfill withdrawal requests', async function () {
                let paymentAmount = BigNumber.from(2000).mul(TOKEN_MULTIPLIER);

                await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount);
                await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                await expect(loanDesk.connect(borrower1).repay(loanId, paymentAmount));

                let lastRequestState = await lendingPool.withdrawalRequestStates(lenders[0].address);
                assertHardhatInvariant(lastRequestState.sharesLocked.gt(0));
                assertHardhatInvariant(lastRequestState.countOutstanding == 1);

                let prevBalance = await liquidityToken.balanceOf(lenders[0].address);

                await expect(lendingPool.connect(lenders[0]).fulfillWithdrawalRequests(1)).to.be.not.reverted;

                let requestState = await lendingPool.withdrawalRequestStates(lenders[0].address);
                expect(requestState.sharesLocked).to.be.eq(0);
                expect(requestState.countOutstanding).to.be.eq(0);

                expect(await liquidityToken.balanceOf(lenders[0].address)).to.be.gt(prevBalance); //TODO use more precise check
            });

            it('Can cancel a withdrawal request', async function () {
                let lastRequestState = await lendingPool.withdrawalRequestStates(lenders[0].address);
                assertHardhatInvariant(lastRequestState.sharesLocked.gt(0));
                assertHardhatInvariant(lastRequestState.countOutstanding >= 1);
                
                let balanceDelta = lastRequestState.sharesLocked;
                await expect(lendingPool.connect(lenders[0]).cancelWithdrawalRequest(1)).to.changeTokenBalances(
                    poolToken,
                    [lenders[0].address, lendingPool.address],
                    [balanceDelta, -balanceDelta],
                );

                let requestState = await lendingPool.withdrawalRequestStates(lenders[0].address);
                expect(requestState.sharesLocked).to.be.eq(lastRequestState.sharesLocked.sub(balanceDelta));
                expect(requestState.countOutstanding).to.be.eq(lastRequestState.countOutstanding - 1);
            });

            it('Can update a withdrawal request', async function () {
                let paymentAmount = BigNumber.from(2000).mul(TOKEN_MULTIPLIER);

                await liquidityToken.connect(deployer).mint(borrower1.address, paymentAmount);
                await liquidityToken.connect(borrower1).approve(lendingPool.address, paymentAmount);
                await expect(loanDesk.connect(borrower1).repay(loanId, paymentAmount));

                let prevRequestState = await lendingPool.withdrawalRequestStates(lenders[0].address);
                assertHardhatInvariant(prevRequestState.sharesLocked.gt(0));
                assertHardhatInvariant(prevRequestState.countOutstanding == 1);

                let newShareAmount = prevRequestState.sharesLocked.mul(2).div(3);
                let balanceDelta = prevRequestState.sharesLocked.sub(newShareAmount);
                await expect(lendingPool.connect(lenders[0]).updateWithdrawalRequest(1, newShareAmount))
                    .to.changeTokenBalances(
                        poolToken,
                        [lenders[0].address, lendingPool.address],
                        [balanceDelta, -balanceDelta],
                    );

                let requestState = await lendingPool.withdrawalRequestStates(lenders[0].address);
                expect(requestState.sharesLocked).to.be.eq(newShareAmount);
                expect(requestState.countOutstanding).to.be.eq(prevRequestState.countOutstanding);
            });
        });

    });
});
