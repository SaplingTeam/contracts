# bankfair-contracts

## Interacting with the contracts
Please refer to [/docs](/docs) for contract details.

## Notes for contract developers

### Setup API keys before testnet deployments
cd into project directory and create ```secrets.json``` by running the command below on *NIX systems, or by creating the file manually.

```sh
tee secrets.json > /dev/null <<EOT
{
  "testnetMnemonic": "REPLACE WITH MNEMONIC",
  "kovanConfig":{
    "infuraProjectId": "REPLACE WITH INFURA PROJECT ID",
    "etherscanApiKey": "REPLACE WITH ETHERSCAN API KEY"
  },
  "optimisticKovanConfig":{
    "alchemyApiKey": "REPLACE WITH ALCHEMY API KEY",
    "etherscanApiKey": "REPLACE WITH ETHERSCAN API KEY"
  }
}
EOT
```

Then edit the keys accordingly in secrets.json
