# bankfair-contracts

## Interacting with the contracts
Please refer to https://bankfair.github.io/contracts/ for contract details.

## Notes for contract developers

### Setup API keys before testnet deployments
cd into project directory and create ```.env``` by running the command below on *NIX systems, or by creating the file manually.

```sh
tee .env > /dev/null <<EOT
TESTNET_MNEMONIC="REPLACE WITH MNEMONIC"
ETHERSCAN_API_KEY="REPLACE WITH ETHERSCAN API KEY"
OPTIMISTIC_ETHERSCAN_API_KEY="REPLACE WITH OPTIMISTIC ETHERSCAN API KEY"
EOT
```

Then edit the keys accordingly in `.env`
