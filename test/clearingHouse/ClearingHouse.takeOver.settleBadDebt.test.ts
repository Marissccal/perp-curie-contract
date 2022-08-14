import { MockContract } from "@eth-optimism/smock"
import { expect } from "chai"
import { BigNumber, BigNumberish } from "ethers"
import { parseEther, parseUnits } from "ethers/lib/utils"
import { ethers, waffle } from "hardhat"
import {
    BaseToken,
    Exchange,
    InsuranceFund,
    OrderBook,
    QuoteToken,
    TestAccountBalance,
    TestClearingHouse,
    TestERC20,
    UniswapV3Pool,
    Vault,
} from "../../typechain"
import { b2qExactOutput, q2bExactInput, syncIndexToMarketPrice } from "../helper/clearingHouseHelper"
import { initAndAddPool } from "../helper/marketHelper"
import { getMaxTickRange } from "../helper/number"
import { deposit, mintAndDeposit } from "../helper/token"
import { encodePriceSqrt } from "../shared/utilities"
import { ClearingHouseFixture, createClearingHouseFixture } from "./fixtures"

describe("ClearingHouse liquidate", () => {
    const [admin, alice, bob, carol, davis] = waffle.provider.getWallets()
    const loadFixture: ReturnType<typeof waffle.createFixtureLoader> = waffle.createFixtureLoader([admin])
    let million: BigNumber
    let hundred: BigNumber
    let fixture: ClearingHouseFixture
    let clearingHouse: TestClearingHouse
    let exchange: Exchange
    let orderBook: OrderBook
    let accountBalance: TestAccountBalance
    let vault: Vault
    let insuranceFund: InsuranceFund
    let collateral: TestERC20
    let weth: TestERC20
    let wethPriceFeed: MockContract
    let baseToken: BaseToken
    let quoteToken: QuoteToken
    let pool: UniswapV3Pool
    let baseToken2: BaseToken
    let pool2: UniswapV3Pool
    let mockedBaseAggregator: MockContract
    let mockedBaseAggregator2: MockContract
    let collateralDecimals: number
    const oracleDecimals = 6
    const blockTimeStamp = 1

    function setPool1IndexPrice(price: BigNumberish) {
        mockedBaseAggregator.smocked.latestRoundData.will.return.with(async () => {
            return [0, parseUnits(price.toString(), oracleDecimals), 0, 0, 0]
        })
    }

    function setPool2IndexPrice(price: BigNumberish) {
        mockedBaseAggregator2.smocked.latestRoundData.will.return.with(async () => {
            return [0, parseUnits(price.toString(), oracleDecimals), 0, 0, 0]
        })
    }

    beforeEach(async () => {
        fixture = await loadFixture(createClearingHouseFixture())

        clearingHouse = fixture.clearingHouse as TestClearingHouse
        orderBook = fixture.orderBook
        exchange = fixture.exchange
        accountBalance = fixture.accountBalance as TestAccountBalance
        vault = fixture.vault
        insuranceFund = fixture.insuranceFund
        collateral = fixture.USDC
        weth = fixture.WETH
        wethPriceFeed = fixture.mockedWethPriceFeed
        baseToken = fixture.baseToken
        quoteToken = fixture.quoteToken
        pool = fixture.pool
        baseToken2 = fixture.baseToken2
        pool2 = fixture.pool2
        mockedBaseAggregator = fixture.mockedBaseAggregator
        mockedBaseAggregator2 = fixture.mockedBaseAggregator2
        collateralDecimals = await collateral.decimals()

        million = parseUnits("1000000", collateralDecimals)
        hundred = parseUnits("100", collateralDecimals)

        // initialize ETH pool
        await initAndAddPool(
            fixture,
            pool,
            baseToken.address,
            encodePriceSqrt("151.3733069", "1"),
            10000,
            // set maxTickCrossed as maximum tick range of pool by default, that means there is no over price when swap
            getMaxTickRange(),
        )
        setPool1IndexPrice("151")

        // initialize BTC pool
        await initAndAddPool(
            fixture,
            pool2,
            baseToken2.address,
            encodePriceSqrt("151.3733069", "1"),
            10000,
            // set maxTickCrossed as maximum tick range of pool by default, that means there is no over price when swap
            getMaxTickRange(),
        )
        setPool2IndexPrice("151")

        // set weth as collateral
        wethPriceFeed.smocked.getPrice.will.return.with(parseUnits("100", 8))

        // mint
        collateral.mint(alice.address, hundred)
        collateral.mint(bob.address, million)
        collateral.mint(carol.address, million)
        await weth.mint(alice.address, parseEther("1"))
        await weth.connect(alice).approve(vault.address, ethers.constants.MaxUint256)

        await deposit(alice, vault, 10, collateral)
        await deposit(bob, vault, 1000000, collateral)
        await deposit(carol, vault, 1000000, collateral)

        await clearingHouse.connect(carol).addLiquidity({
            baseToken: baseToken.address,
            base: parseEther("100"),
            quote: parseEther("15000"),
            lowerTick: 49000,
            upperTick: 51400,
            minBase: 0,
            minQuote: 0,
            useTakerBalance: false,
            deadline: ethers.constants.MaxUint256,
        })
        await clearingHouse.connect(carol).addLiquidity({
            baseToken: baseToken2.address,
            base: parseEther("100"),
            quote: parseEther("15000"),
            lowerTick: 49000,
            upperTick: 51400,
            minBase: 0,
            minQuote: 0,
            useTakerBalance: false,
            deadline: ethers.constants.MaxUint256,
        })

        await syncIndexToMarketPrice(mockedBaseAggregator, pool)
        await syncIndexToMarketPrice(mockedBaseAggregator2, pool2)

        // set blockTimestamp
        await clearingHouse.setBlockTimestamp(blockTimeStamp)

        // increase insuranceFund capacity
        await collateral.mint(insuranceFund.address, parseUnits("1000000", 6))
    })

    describe("settle bad debt", () => {
        beforeEach(async () => {
            await mintAndDeposit(fixture, admin, 10000)

            // alice long 90 usd
            await q2bExactInput(fixture, alice, 90)

            await syncIndexToMarketPrice(mockedBaseAggregator, pool)

            // bob short 12000 usd
            await b2qExactOutput(fixture, bob, 12000)
        })

        it("do not settle bad debt if user has non-settlement collateral after liquidation", async () => {
            await syncIndexToMarketPrice(mockedBaseAggregator, pool)

            await deposit(alice, vault, 0.001, weth)

            await expect(
                clearingHouse.connect(admin)["liquidate(address,address)"](alice.address, baseToken.address),
            ).not.emit(vault, "BadDebtSettled")

            expect(await vault.getAccountValue(alice.address)).to.be.lt("0")
            expect(await vault.getAccountValue(insuranceFund.address)).to.be.gte("0")
        })

        it("do not settle bad debt if user still has position after liquidation", async () => {
            await q2bExactInput(fixture, alice, 1, baseToken2.address)

            await syncIndexToMarketPrice(mockedBaseAggregator, pool)

            await expect(
                clearingHouse.connect(admin)["liquidate(address,address)"](alice.address, baseToken.address),
            ).not.emit(vault, "BadDebtSettled")

            expect(await vault.getAccountValue(alice.address)).to.be.lt("0")
            expect(await vault.getAccountValue(insuranceFund.address)).to.be.gte("0")
        })

        it("settle bad debt after last liquidation", async () => {
            await syncIndexToMarketPrice(mockedBaseAggregator, pool)

            await expect(clearingHouse.connect(admin)["liquidate(address,address)"](alice.address, baseToken.address))
                .to.emit(vault, "BadDebtSettled")
                .withArgs(alice.address, "1081016")

            // liquidatePositionSize: 588407511354640018 = 0.58840751135464
            // indexPrice: 137562058000000010000 = 137.562058
            // exchangedPositionNotional = liquidatePositionSize * indexPrice / 1e18 = 80942548204602648725 = 80.94254820460266
            // liquidationPenalty = exchangedPositionNotional * 0.025 = 2023563705115066218 = 2.023563705115066
            // alice original takeOpenNotional = -90
            // alice original deposit = 10
            // alice after takerOpenNotional = -90 + 80.94254820460266 = -9.057451795397341
            // alice after accountValue = 10 - 9.057451795397341 - 2.023563705115066(fee) = -1.0810155005124074
            // insuranceFund owedRealizedPnl = liquidationPenalty * 0.5 = 1011781852557533000 = 1.011781852557533
            // insuranceFund accountValue = 1011781852557533000 / 1e12 - 1081016 = -69234.14744246693 => -69235 (round down) = 0.069235
            expect(await vault.getAccountValue(alice.address)).to.be.eq("0")
            expect(await vault.getAccountValue(insuranceFund.address)).to.be.eq("-69235")
            expect(await vault.getBalance(insuranceFund.address)).to.be.eq("-1081016")
        })
    })
})
