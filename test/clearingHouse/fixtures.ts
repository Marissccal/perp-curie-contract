import { MockContract, smockit } from "@eth-optimism/smock"
import { ethers } from "hardhat"
import { ClearingHouse, TestERC20, TestUniswapV3Broker, UniswapV3Factory, UniswapV3Pool, Vault } from "../../typechain"
import { VirtualToken } from "../../typechain/VirtualToken"
import { token0Fixture, tokensFixture, uniswapV3FactoryFixture } from "../shared/fixtures"

interface ClearingHouseFixture {
    clearingHouse: ClearingHouse
    vault: Vault
    uniV3Factory: UniswapV3Factory
    pool: UniswapV3Pool
    feeTier: number
    USDC: TestERC20
    quoteToken: VirtualToken
    baseToken: VirtualToken
    mockedBaseAggregator: MockContract
    baseToken2: VirtualToken
    mockedBaseAggregator2: MockContract
    pool2: UniswapV3Pool
    mockedArbSys: MockContract
}

interface UniswapV3BrokerFixture {
    uniswapV3Broker: TestUniswapV3Broker
}

export enum BaseQuoteOrdering {
    BASE_0_QUOTE_1,
    BASE_1_QUOTE_0,
}

export function createClearingHouseFixture(baseQuoteOrdering: BaseQuoteOrdering): () => Promise<ClearingHouseFixture> {
    return async (): Promise<ClearingHouseFixture> => {
        // deploy test tokens
        const tokenFactory = await ethers.getContractFactory("TestERC20")
        const USDC = (await tokenFactory.deploy("TestUSDC", "USDC")) as TestERC20
        await USDC.setupDecimals(6)

        let baseToken: VirtualToken, quoteToken: VirtualToken, mockedBaseAggregator: MockContract
        const { token0, mockedAggregator0, token1, mockedAggregator1 } = await tokensFixture()

        if (baseQuoteOrdering === BaseQuoteOrdering.BASE_0_QUOTE_1) {
            baseToken = token0
            quoteToken = token1
            mockedBaseAggregator = mockedAggregator0
        } else {
            baseToken = token1
            quoteToken = token0
            mockedBaseAggregator = mockedAggregator1
        }

        // deploy UniV3 factory
        const factoryFactory = await ethers.getContractFactory("UniswapV3Factory")
        const uniV3Factory = (await factoryFactory.deploy()) as UniswapV3Factory

        const vaultFactory = await ethers.getContractFactory("Vault")
        const vault = (await vaultFactory.deploy(USDC.address)) as Vault

        // deploy clearingHouse
        const clearingHouseFactory = await ethers.getContractFactory("ClearingHouse")
        const clearingHouse = (await clearingHouseFactory.deploy(
            vault.address,
            quoteToken.address,
            uniV3Factory.address,
            3600, // fundingPeriod = 1 hour
            0,
            0,
        )) as ClearingHouse

        await quoteToken.addWhitelist(clearingHouse.address)

        // set CH as the minter of all virtual tokens
        await vault.setClearingHouse(clearingHouse.address)
        await baseToken.setMinter(clearingHouse.address)
        await quoteToken.setMinter(clearingHouse.address)

        // prepare uniswap factory
        const feeTier = 10000
        await uniV3Factory.createPool(baseToken.address, quoteToken.address, feeTier)
        const poolFactory = await ethers.getContractFactory("UniswapV3Pool")

        // deploy a pool
        const poolAddr = await uniV3Factory.getPool(baseToken.address, quoteToken.address, feeTier)
        const pool = poolFactory.attach(poolAddr) as UniswapV3Pool
        await baseToken.addWhitelist(clearingHouse.address)
        await baseToken.addWhitelist(pool.address)
        await quoteToken.addWhitelist(pool.address)

        // deploy another pool
        const _token0Fixture = await token0Fixture(quoteToken.address)
        const baseToken2 = _token0Fixture.baseToken
        await baseToken2.setMinter(clearingHouse.address)
        const mockedBaseAggregator2 = _token0Fixture.mockedAggregator
        await uniV3Factory.createPool(baseToken2.address, quoteToken.address, feeTier)
        const pool2Addr = await uniV3Factory.getPool(baseToken2.address, quoteToken.address, feeTier)
        const pool2 = poolFactory.attach(pool2Addr) as UniswapV3Pool

        await baseToken2.addWhitelist(clearingHouse.address)
        await baseToken2.addWhitelist(pool2.address)
        await quoteToken.addWhitelist(pool2.address)

        await clearingHouse.setFeeRatio(baseToken.address, feeTier)
        await clearingHouse.setFeeRatio(baseToken2.address, feeTier)

        const mockedArbSys = await getMockedArbSys()
        return {
            clearingHouse,
            vault,
            uniV3Factory,
            pool,
            feeTier,
            USDC,
            quoteToken,
            baseToken,
            mockedBaseAggregator,
            baseToken2,
            mockedBaseAggregator2,
            pool2,
            mockedArbSys,
        }
    }
}

export async function uniswapV3BrokerFixture(): Promise<UniswapV3BrokerFixture> {
    const factory = await uniswapV3FactoryFixture()
    const uniswapV3BrokerFactory = await ethers.getContractFactory("TestUniswapV3Broker")
    const uniswapV3Broker = (await uniswapV3BrokerFactory.deploy(factory.address)) as TestUniswapV3Broker
    return { uniswapV3Broker }
}

interface MockedClearingHouseFixture {
    clearingHouse: ClearingHouse
    mockedUniV3Factory: MockContract
    mockedVault: MockContract
    mockedVUSD: MockContract
    mockedUSDC: MockContract
    mockedBaseToken: MockContract
}

export const ADDR_GREATER_THAN = true
export const ADDR_LESS_THAN = false
export async function mockedTokenTo(longerThan: boolean, targetAddr: string): Promise<MockContract> {
    // deployer ensure base token is always smaller than quote in order to achieve base=token0 and quote=token1
    let mockedToken: MockContract
    while (
        !mockedToken ||
        (longerThan
            ? mockedToken.address.toLowerCase() <= targetAddr.toLowerCase()
            : mockedToken.address.toLowerCase() >= targetAddr.toLowerCase())
    ) {
        const aggregatorFactory = await ethers.getContractFactory("TestAggregatorV3")
        const aggregator = await aggregatorFactory.deploy()
        const mockedAggregator = await smockit(aggregator)

        const chainlinkPriceFeedFactory = await ethers.getContractFactory("ChainlinkPriceFeed")
        const chainlinkPriceFeed = await chainlinkPriceFeedFactory.deploy(mockedAggregator.address)

        const virtualTokenFactory = await ethers.getContractFactory("VirtualToken")
        const token = (await virtualTokenFactory.deploy("Test", "Test", chainlinkPriceFeed.address)) as VirtualToken
        mockedToken = await smockit(token)
    }
    return mockedToken
}

async function getMockedArbSys(): Promise<MockContract> {
    const arbSysFactory = await ethers.getContractFactory("TestArbSys")
    const arbSys = await arbSysFactory.deploy()
    const mockedArbSys = await smockit(arbSys, { address: "0x0000000000000000000000000000000000000064" })
    mockedArbSys.smocked.arbBlockNumber.will.return.with(async () => {
        return 0
    })
    return mockedArbSys
}

export async function mockedClearingHouseFixture(): Promise<MockedClearingHouseFixture> {
    const { token0, mockedAggregator0, token1, mockedAggregator1 } = await tokensFixture()

    // deploy test tokens
    const tokenFactory = await ethers.getContractFactory("TestERC20")
    const USDC = (await tokenFactory.deploy("TestUSDC", "USDC")) as TestERC20
    const vaultFactory = await ethers.getContractFactory("Vault")
    const vault = (await vaultFactory.deploy(USDC.address)) as Vault
    const mockedUSDC = await smockit(USDC)
    const mockedVUSD = await smockit(token1)
    const mockedVault = await smockit(vault)

    // deploy UniV3 factory
    const factoryFactory = await ethers.getContractFactory("UniswapV3Factory")
    const uniV3Factory = (await factoryFactory.deploy()) as UniswapV3Factory
    const mockedUniV3Factory = await smockit(uniV3Factory)

    // deploy clearingHouse
    const clearingHouseFactory = await ethers.getContractFactory("ClearingHouse")
    const clearingHouse = (await clearingHouseFactory.deploy(
        mockedVault.address,
        mockedVUSD.address,
        mockedUniV3Factory.address,
        3600,
        0,
        0,
    )) as ClearingHouse

    // deployer ensure base token is always smaller than quote in order to achieve base=token0 and quote=token1
    const mockedBaseToken = await mockedTokenTo(ADDR_LESS_THAN, mockedVUSD.address)

    return { clearingHouse, mockedUniV3Factory, mockedVault, mockedVUSD, mockedUSDC, mockedBaseToken }
}

export async function deployERC20(): Promise<TestERC20> {
    const tokenFactory = await ethers.getContractFactory("TestERC20")
    return (await tokenFactory.deploy("Test", "Test")) as TestERC20
}
