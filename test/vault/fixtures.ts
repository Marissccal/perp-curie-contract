import { MockContract, smockit } from "@eth-optimism/smock"
import { ethers } from "hardhat"
import {
    AccountBalance,
    ClearingHouseConfig,
    Exchange,
    InsuranceFund,
    MarketRegistry,
    OrderBook,
    TestERC20,
    UniswapV3Factory,
    Vault,
} from "../../typechain"

interface MockedVaultFixture {
    vault: Vault
    USDC: TestERC20
    mockedInsuranceFund: MockContract
    mockedAccountBalance: MockContract
}

export async function mockedVaultFixture(): Promise<MockedVaultFixture> {
    // deploy test tokens
    const tokenFactory = await ethers.getContractFactory("TestERC20")
    const USDC = (await tokenFactory.deploy()) as TestERC20
    await USDC.initialize("TestUSDC", "USDC")

    const insuranceFundFactory = await ethers.getContractFactory("InsuranceFund")
    const insuranceFund = (await insuranceFundFactory.deploy()) as InsuranceFund
    const mockedInsuranceFund = await smockit(insuranceFund)
    mockedInsuranceFund.smocked.getToken.will.return.with(USDC.address)

    // deploy clearingHouse
    const factoryFactory = await ethers.getContractFactory("UniswapV3Factory")
    const uniV3Factory = (await factoryFactory.deploy()) as UniswapV3Factory

    const marketRegistryFactory = await ethers.getContractFactory("MarketRegistry")
    const marketRegistry = (await marketRegistryFactory.deploy()) as MarketRegistry
    await marketRegistry.initialize(uniV3Factory.address, USDC.address)

    const orderBookFactory = await ethers.getContractFactory("OrderBook")
    const orderBook = (await orderBookFactory.deploy()) as OrderBook
    await orderBook.initialize(marketRegistry.address, USDC.address)

    const clearingHouseConfigFactory = await ethers.getContractFactory("ClearingHouseConfig")
    const clearingHouseConfig = (await clearingHouseConfigFactory.deploy()) as ClearingHouseConfig
    const mockedConfig = await smockit(clearingHouseConfig)

    const exchangeFactory = await ethers.getContractFactory("Exchange")
    const exchange = (await exchangeFactory.deploy()) as Exchange
    await exchange.initialize(
        marketRegistry.address,
        orderBook.address,
        clearingHouseConfig.address,
        insuranceFund.address,
    )
    const mockedExchange = await smockit(exchange)
    await orderBook.setExchange(exchange.address)

    const accountBalanceFactory = await ethers.getContractFactory("AccountBalance")
    const accountBalance = (await accountBalanceFactory.deploy()) as AccountBalance
    const mockedAccountBalance = await smockit(accountBalance)

    const vaultFactory = await ethers.getContractFactory("Vault")
    const vault = (await vaultFactory.deploy()) as Vault
    await vault.initialize(
        mockedInsuranceFund.address,
        mockedConfig.address,
        mockedAccountBalance.address,
        mockedExchange.address,
    )

    return { vault, USDC, mockedInsuranceFund, mockedAccountBalance }
}
