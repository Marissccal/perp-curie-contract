import * as dotenv from "dotenv"
// Load environment variables from .env file
dotenv.config()

// Get the vars key from the .env file
const deployerKey = process.env.PRIVATE_KEY
const providerUrl = process.env.PROVIDER_URL

const insuranceFundAddress = "0x0000000000000000000000000000000000000000"
const clearingHouseConfigAddress = "0x0000000000000000000000000000000000000000"
const accountBalanceAddress = "0x0000000000000000000000000000000000000000"
const exchangeAddress = "0x0000000000000000000000000000000000000000"

// Import ABI and bytecode of the contract
