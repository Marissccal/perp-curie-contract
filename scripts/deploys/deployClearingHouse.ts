import * as dotenv from "dotenv"
import { ethers } from "ethers"
// Load environment variables from .env file
dotenv.config()

// Get the vars key from the .env file
const deployerKey = process.env.PRIVATE_KEY
const providerUrl = process.env.PROVIDER_URL

// Import ABI and bytecode of the contract
import ClearingHouse from "../../artifacts/contracts/ClearingHouse.sol/ClearingHouse.json"

// Initialize provider and wallet
const provider = new ethers.providers.JsonRpcProvider(providerUrl)
const wallet = new ethers.Wallet(deployerKey, provider)

// Contract deployment function
const deploy = async () => {
    try {
        // Get the contract factory
        const ClearingHouseClearingHouse = new ethers.ContractFactory(ClearingHouse.abi, ClearingHouse.bytecode, wallet)

        // Deploy the contract with the necessary initialization arguments
        console.log("Deploying the contract ClearingHouse with wallet:", wallet.address)
        const deployedContract = await ClearingHouseClearingHouse.deploy()

        await deployedContract.deployed()

        console.log("Contract deployed to address:", deployedContract.address)
    } catch (error) {
        console.error("An error occurred in the deployment:", error)
    }
}

// Execute the deploy function
deploy()
