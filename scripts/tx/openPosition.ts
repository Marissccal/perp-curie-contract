import * as dotenv from "dotenv"
import { ethers } from "ethers"

dotenv.config()

const privateKey: string = process.env.PRIVATE_KEY as string
const providerUrl: string = process.env.PROVIDER_URL as string
const clearingHouseAddress: string = process.env.CLEARING_HOUSE_ADDRESS as string //

//
import ClearingHouse from "../../artifacts/contracts/ClearingHouse.sol/ClearingHouse.json"

const provider = new ethers.providers.JsonRpcProvider(providerUrl)
const wallet = new ethers.Wallet(privateKey, provider)

const clearingHouseContract = new ethers.Contract(clearingHouseAddress, ClearingHouse.abi, wallet)

const openPosition = async () => {
    try {
        //
        const params = {
            baseToken: "0x77c2136c7f88645aE48cfFDCAa1A30bb8b7639F0", //
            isBaseToQuote: false, //
            isExactInput: true, //
            amount: ethers.utils.parseUnits("1", 18), //
            sqrtPriceLimitX96: 0, //
            deadline: Math.floor(Date.now() / 1000) + 1800, //
            oppositeAmountBound: 0, //
            referralCode: ethers.constants.HashZero, //
        }

        const tx = await clearingHouseContract.openPosition(params)
        console.log("Transacción enviada:", tx.hash)

        const receipt = await tx.wait()
        console.log("Transacción confirmada en el bloque:", receipt.blockNumber)
    } catch (error) {
        console.error("Error al abrir posición:", error)
    }
}

openPosition()
