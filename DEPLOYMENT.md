##### Disclaimer: The following is only a developer note for testing purposes, and is not an instruction to act in any specific way. Terms of the [LICENSE](LICENSE) apply to this documentation as well. 

### Deployment

Custom use cases may require a different deployment configuration. A deployment checklist for a single pool use case:


1. Deploy access control 
   1. Need:
      1. Governance address or multisig
      2. Upgrader address or multisig
      3. Deployer address
      4. Staker address
      5. Treasury address
   2. Steps:
      1. Deploy CoreAccessControl.sol; Example: scripts/access_control/deploy.js
      2. Verify access control
      3. Grant initial roles and handover ownership. Example script is at scripts/access_control/configure.js

2. Deploy a pool
   1. Deploy PoolToken.sol; Example: scripts/pool/token/deploy.js
   2. Deploy SaplingLendingPool.sol; Example: scripts/pool/deploy.js
   3. Configure pool token. Example: scripts/pool/token/configure.js
   4. Deploy LoanDesk.sol; Example: scripts/pool/loandesk/deploy.js
   5. Configure lending pool. Example: scripts/pool/configure.js, set via governance
   6. Set upgrader as the owner of the proxy admin

3. Lender voting
   1. Deploy LenderVotes (Govenor). Example: scripts/govenor/deploy.js

4. Configure Core access control: assign pool specific lender governance roles. Example: scripts/access_control/configure.pool.js

5. Verify all deployed contracts upon deployment.

6. Lending pool and loan desk start in a closed state. Staker must call initalMint() on the lending pool, and open() on each contract to enable the pool.
