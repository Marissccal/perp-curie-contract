import * as dotenv from "dotenv"
import { ethers } from "ethers"

dotenv.config()

const deployerKey: string = process.env.PRIVATE_KEY as string
const providerUrl: string = process.env.PROVIDER_URL as string
const contractAddress: string = process.env.CONTRACT_ADDRESS_DEPOSIT as string

import Vault from "../../artifacts/contracts/Vault.sol/Vault.json"

const provider = new ethers.providers.JsonRpcProvider(providerUrl)
const wallet = new ethers.Wallet(deployerKey, provider)

const contract = new ethers.Contract(contractAddress, Vault.abi, wallet)

const deposit = async (token: string, amount: string): Promise<void> => {
    try {
        const amountInWei = ethers.utils.parseUnits(amount, 18)
        const tx = await contract.deposit(token, amountInWei)
        console.log("Transacción enviada:", tx.hash)

        const receipt = await tx.wait()
        console.log("Transacción confirmada en el bloque:", receipt.blockNumber)
    } catch (error) {
        console.error("Error al depositar:", error)
    }
}

const token = "0xa4f0bE8ADf3b2f46Ecbe49dcde858eC63783A7Cb"
const amount = "1"

deposit(token, amount)
