import "@nomiclabs/hardhat-ethers"
import "@nomiclabs/hardhat-waffle"
import "@typechain/hardhat"
import "hardhat-deploy"
import "hardhat-deploy-ethers"
import { HardhatUserConfig } from "hardhat/config"
import "solidity-coverage"
import {
    ARBITRUM_RINKEBY_DEPLOYER_MNEMONIC,
    ARBITRUM_RINKEBY_WEB3_ENDPOINT,
    RINKEBY_DEPLOYER_MNEMONIC,
    RINKEBY_WEB3_ENDPOINT,
} from "./constants"

const config: HardhatUserConfig = {
    solidity: {
        version: "0.7.6",
        settings: {
            optimizer: { enabled: true, runs: 200 },
            evmVersion: "berlin",
            // for smock to mock contracts
            outputSelection: {
                "*": {
                    "*": ["storageLayout"],
                },
            },
        },
    },
    networks: {
        hardhat: {
            allowUnlimitedContractSize: true,
        },
        arbitrumRinkeby: {
            url: ARBITRUM_RINKEBY_WEB3_ENDPOINT,
            accounts: {
                mnemonic: ARBITRUM_RINKEBY_DEPLOYER_MNEMONIC,
            },
            gasPrice: 0,
        },
        rinkeby: {
            url: RINKEBY_WEB3_ENDPOINT,
            accounts: {
                mnemonic: RINKEBY_DEPLOYER_MNEMONIC,
            },
        },
    },
    namedAccounts: {
        deployer: 0, // 0 means ethers.getSigners[0]
    },
    external: {
        contracts: [
            {
                artifacts: "node_modules/@openzeppelin/contracts/build",
            },
        ],
    },
}

export default config
