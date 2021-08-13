import { MockContract } from "@eth-optimism/smock"
import { expect } from "chai"
import { parseEther, parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import { ClearingHouse, TestERC20, UniswapV3Pool, Vault, VirtualToken } from "../../typechain"
import { deposit } from "../helper/token"
import { encodePriceSqrt } from "../shared/utilities"
import { BaseQuoteOrdering, createClearingHouseFixture } from "./fixtures"

describe("ClearingHouse getNetQuoteBalance", () => {
    const [admin, maker, taker] = waffle.provider.getWallets()
    const loadFixture: ReturnType<typeof waffle.createFixtureLoader> = waffle.createFixtureLoader([admin])
    let clearingHouse: ClearingHouse
    let vault: Vault
    let collateral: TestERC20
    let baseToken: VirtualToken
    let quoteToken: VirtualToken
    let pool: UniswapV3Pool
    let mockedBaseAggregator: MockContract
    let collateralDecimals: number

    beforeEach(async () => {
        const _clearingHouseFixture = await loadFixture(createClearingHouseFixture(BaseQuoteOrdering.BASE_0_QUOTE_1))
        clearingHouse = _clearingHouseFixture.clearingHouse
        collateral = _clearingHouseFixture.USDC
        vault = _clearingHouseFixture.vault
        baseToken = _clearingHouseFixture.baseToken
        quoteToken = _clearingHouseFixture.quoteToken
        mockedBaseAggregator = _clearingHouseFixture.mockedBaseAggregator
        pool = _clearingHouseFixture.pool
        collateralDecimals = await collateral.decimals()

        mockedBaseAggregator.smocked.latestRoundData.will.return.with(async () => {
            return [0, parseUnits("100", 6), 0, 0, 0]
        })

        // prepare collateral for maker
        const makerCollateralAmount = parseUnits("100000", collateralDecimals)
        await collateral.mint(maker.address, makerCollateralAmount)
        await deposit(maker, vault, 100000, collateral)

        // prepare collateral for taker
        const takerCollateral = parseUnits("10000", collateralDecimals)
        await collateral.mint(taker.address, takerCollateral)
        await deposit(taker, vault, 10000, collateral)
    })

    describe("no swaps, costBasis should be 0", async () => {
        describe("initialized price = 200", () => {
            beforeEach(async () => {
                await pool.initialize(encodePriceSqrt("200", "1"))
                // add pool after it's initialized
                await clearingHouse.addPool(baseToken.address, 10000)
            })

            it("taker has no position", async () => {
                expect(await clearingHouse.getPositionSize(taker.address, baseToken.address)).to.eq(parseEther("0"))
                expect(await clearingHouse.getNetQuoteBalance(taker.address)).to.eq(parseEther("0"))
            })

            it("taker mints quote", async () => {
                const quoteAmount = parseEther("100")
                await clearingHouse.connect(taker).mint(quoteToken.address, quoteAmount)
                expect(await clearingHouse.getPositionSize(taker.address, baseToken.address)).to.eq(parseEther("0"))
                expect(await clearingHouse.getNetQuoteBalance(taker.address)).to.eq(parseEther("0"))
            })

            it("maker adds liquidity below price with quote only", async () => {
                await clearingHouse.connect(maker).mint(quoteToken.address, parseEther("100"))
                await clearingHouse.connect(maker).addLiquidity({
                    baseToken: baseToken.address,
                    base: parseEther("0"),
                    quote: parseEther("100"),
                    lowerTick: 50000, // 148.3760629
                    upperTick: 50200, // 151.3733069
                    minBase: 0,
                    minQuote: 0,
                    deadline: ethers.constants.MaxUint256,
                })

                expect(await clearingHouse.getPositionSize(maker.address, baseToken.address)).to.eq(0)
                expect(await clearingHouse.getNetQuoteBalance(maker.address)).to.eq(0)
            })
        })

        describe("initialized price = 100", () => {
            beforeEach(async () => {
                await pool.initialize(encodePriceSqrt("100", "1"))
                // add pool after it's initialized
                await clearingHouse.addPool(baseToken.address, 10000)
            })

            it("maker adds liquidity above price with base only", async () => {
                await clearingHouse.connect(maker).mint(baseToken.address, parseEther("5"))

                await clearingHouse.connect(maker).addLiquidity({
                    baseToken: baseToken.address,
                    base: parseEther("2"),
                    quote: parseEther("0"),
                    lowerTick: 50000, // 148.3760629
                    upperTick: 50200, // 151.3733069
                    minBase: 0,
                    minQuote: 0,
                    deadline: ethers.constants.MaxUint256,
                })

                expect(await clearingHouse.getPositionSize(maker.address, baseToken.address)).to.eq(parseEther("0"))
                expect(await clearingHouse.getNetQuoteBalance(maker.address)).to.eq(parseEther("0"))

                await clearingHouse.connect(maker).addLiquidity({
                    baseToken: baseToken.address,
                    base: parseEther("3"),
                    quote: parseEther("0"),
                    lowerTick: 49000,
                    upperTick: 50400,
                    minBase: 0,
                    minQuote: 0,
                    deadline: ethers.constants.MaxUint256,
                })

                expect(await clearingHouse.getPositionSize(maker.address, baseToken.address)).to.eq(parseEther("0"))
                expect(await clearingHouse.getNetQuoteBalance(maker.address)).to.eq(parseEther("0"))
            })

            it("maker adds liquidity with both quote and base", async () => {
                await clearingHouse.connect(maker).mint(quoteToken.address, parseEther("100"))
                await clearingHouse.connect(maker).mint(baseToken.address, parseEther("1"))
                await clearingHouse.connect(maker).addLiquidity({
                    baseToken: baseToken.address,
                    base: parseEther("1"),
                    quote: parseEther("100"),
                    lowerTick: 0, // $1
                    upperTick: 100000, // $22015.4560485522
                    minBase: 0,
                    minQuote: 0,
                    deadline: ethers.constants.MaxUint256,
                })
                expect(await clearingHouse.getPositionSize(maker.address, baseToken.address)).to.deep.eq(
                    parseEther("0"),
                )
                expect(await clearingHouse.getNetQuoteBalance(maker.address)).to.deep.eq(0)
            })
        })
    })
})