// SPDX-License-Identifier: GPL-2.0-or-later
pragma solidity 0.7.6;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { Math } from "@openzeppelin/contracts/math/Math.sol";
import { SafeMath } from "@openzeppelin/contracts/math/SafeMath.sol";
import { SignedSafeMath } from "@openzeppelin/contracts/math/SignedSafeMath.sol";
import { TransferHelper } from "@uniswap/lib/contracts/libraries/TransferHelper.sol";
import { IERC20Metadata } from "./interface/IERC20Metadata.sol";
import { ISettlement } from "./interface/ISettlement.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/SafeCast.sol";
import { ClearingHouse } from "./ClearingHouse.sol";
import { SettlementTokenMath } from "./lib/SettlementTokenMath.sol";
import { PerpMath } from "./lib/PerpMath.sol";
import { IVault } from "./interface/IVault.sol";

contract Vault is ReentrancyGuard, Ownable, IVault {
    using SafeMath for uint256;
    using SafeCast for uint256;
    using SafeCast for int256;
    using SignedSafeMath for int256;
    using SettlementTokenMath for uint256;
    using SettlementTokenMath for int256;
    using PerpMath for int256;

    event Deposited(address indexed collateralToken, address indexed account, uint256 amount);
    event Withdrawn(address indexed collateralToken, address indexed account, uint256 amount);

    address public immutable settlementToken;
    address public clearingHouse;

    uint8 public immutable override decimals;

    // those 4 are not used until multi collateral is implemented
    // uint256 public maxCloseFactor;
    // uint256 public minCloseFactor;
    // uint256 public liquidationDiscount;
    // address[] private _assetLiquidationOrder;

    // key: trader, token address
    mapping(address => mapping(address => uint256)) private _balance;
    // key: trader
    mapping(address => uint256) private _debt;

    // key: token
    // TODO: change bool to collateral factor
    mapping(address => bool) private _collateralTokenMap;
    address[] private _collateralTokens;

    constructor(address settlementTokenArg) {
        settlementToken = settlementTokenArg;
        decimals = IERC20Metadata(settlementTokenArg).decimals();

        _addCollateralToken(settlementTokenArg);
    }

    function setClearingHouse(address clearingHouseArg) external onlyOwner {
        // TODO add event
        clearingHouse = clearingHouseArg;
    }

    function deposit(
        address from,
        address token,
        uint256 amount
    ) external nonReentrant() {
        // collateralToken not found
        require(_collateralTokenMap[token], "V_CNF");

        _increaseBalance(from, token, amount);
        TransferHelper.safeTransferFrom(token, from, address(this), amount);

        emit Deposited(token, from, amount);
    }

    function withdraw(address token, uint256 amount) external nonReentrant() {
        address account = _msgSender();

        // settle ClearingHouse's owedRealizedPnl to collateral
        int256 pnl = ClearingHouse(clearingHouse).settle(account);
        if (pnl > 0) {
            _increaseBalance(account, settlementToken, pnl.toUint256());
        } else if (pnl < 0) {
            _decreaseBalance(account, settlementToken, pnl.abs());
        }

        // V_NEB: not enough balance
        require(_getBalance(account, token) >= amount, "V_NEB");
        _decreaseBalance(account, token, amount);

        // V_NEFC: not enough free collateral
        require(_getFreeCollateral(account) >= 0, "V_NEFC");
        TransferHelper.safeTransfer(token, account, amount);
        emit Withdrawn(token, account, amount);
    }

    // expensive call
    function balanceOf(address account) public view override returns (uint256) {
        uint256 settlementTokenValue;
        for (uint256 i = 0; i < _collateralTokens.length; i++) {
            address token = _collateralTokens[i];
            if (settlementToken != token) {
                revert("TBD - token twap * account's balance");
            }
            // is settlement token
            settlementTokenValue = settlementTokenValue.add(_getBalance(account, token));
        }

        return settlementTokenValue;
    }

    function getFreeCollateral(address account) external view returns (uint256) {
        int256 freeCollateral = _getFreeCollateral(account);
        return freeCollateral > 0 ? freeCollateral.toUint256() : 0;
    }

    function _addCollateralToken(address token) private {
        // collateral token existed
        require(!_collateralTokenMap[token], "V_CTE");
        _collateralTokenMap[token] = true;
        _collateralTokens.push(token);
    }

    function _increaseBalance(
        address account,
        address token,
        uint256 amount
    ) private {
        _balance[account][token] = _getBalance(account, token).add(amount);
    }

    function _decreaseBalance(
        address account,
        address token,
        uint256 amount
    ) private {
        _balance[account][token] = _getBalance(account, token).sub(amount);
    }

    function _liquidate(
        address account,
        address collateralToken,
        uint256 amount
    ) private {
        revert("TBD");
    }

    function _getBalance(address account, address token) private view returns (uint256) {
        return _balance[account][token];
    }

    // TODO reduce external calls
    // min(collateral, accountValue) - (totalBaseDebt + totalQuoteDebt) * imRatio
    function _getFreeCollateral(address account) private view returns (int256) {
        // totalOpenOrderMarginRequirement = (totalBaseDebtValue + totalQuoteDebtValue) * imRatio
        uint256 openOrderMarginRequirement = ClearingHouse(clearingHouse).getTotalOpenOrderMarginRequirement(account);

        // accountValue = totalCollateralValue + totalMarketPnl
        int256 owedRealizedPnl = ClearingHouse(clearingHouse).getOwedRealizedPnl(account);
        int256 collateralValue = balanceOf(account).toInt256().addS(owedRealizedPnl, decimals);
        int256 totalMarketPnl = ClearingHouse(clearingHouse).getTotalUnrealizedPnl(account);
        int256 accountValue = collateralValue.addS(totalMarketPnl, decimals);

        // collateral
        int256 min = collateralValue < accountValue ? collateralValue : accountValue;

        return min.subS(openOrderMarginRequirement.toInt256(), decimals);
    }
}