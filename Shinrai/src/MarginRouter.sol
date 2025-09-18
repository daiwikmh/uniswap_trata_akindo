// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {SwapParams} from "v4-core/types/PoolOperation.sol";
import {ModifyLiquidityParams} from "v4-core/types/PoolOperation.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {ILeverageValidator} from "./interface/ILeverageValidator.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MarginRouter
 * @notice Entry point for all leveraged trades with EigenLayer validation
 * @dev Ensures authorization, caps, and limits before executing trades
 */
contract MarginRouter is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ============ State Variables ============

    /// @notice Uniswap V4 Pool Manager
    IPoolManager public immutable poolManager;

    /// @notice EigenLayer leverage validator
    ILeverageValidator public immutable leverageValidator;

    /// @notice Maximum leverage allowed globally
    uint256 public maxGlobalLeverage = 1000; // 10x

    /// @notice Global position counter
    uint256 public positionCounter;

    /// @notice Emergency pause state
    bool public emergencyPaused;

    // ============ Mappings ============

    /// @notice Trader positions mapping
    mapping(address => bytes32[]) public traderPositions;

    /// @notice Position details mapping
    mapping(bytes32 => ILeverageValidator.LeveragePosition) public positions;

    /// @notice Authorized pools for leverage trading
    mapping(bytes32 => bool) public authorizedPools;

    /// @notice Pool-specific leverage caps
    mapping(bytes32 => uint256) public poolLeverageCaps;

    // ============ Events ============

    event LeveragePositionOpened(
        bytes32 indexed positionId,
        address indexed trader,
        bytes32 indexed poolId,
        uint256 collateral,
        uint256 borrowed,
        uint256 leverage
    );

    event LeveragePositionClosed(
        bytes32 indexed positionId,
        address indexed trader,
        int256 pnl
    );

    event PoolAuthorized(bytes32 indexed poolId, uint256 leverageCap);

    event EmergencyPauseToggled(bool paused);

    // ============ Modifiers ============

    modifier onlyAuthorizedPool(bytes32 poolId) {
        require(authorizedPools[poolId], "MarginRouter: Pool not authorized");
        _;
    }

    modifier notPaused() {
        require(!emergencyPaused, "MarginRouter: Emergency paused");
        _;
    }

    modifier validLeverage(uint256 leverage, bytes32 poolId) {
        require(leverage > 100, "MarginRouter: Leverage too low"); // Min 1x
        require(leverage <= maxGlobalLeverage, "MarginRouter: Exceeds global cap");
        require(leverage <= poolLeverageCaps[poolId], "MarginRouter: Exceeds pool cap");
        _;
    }

    // ============ Constructor ============

    constructor(
        address _poolManager,
        address _leverageValidator,
        address _owner
    ) Ownable(_owner) {
        poolManager = IPoolManager(_poolManager);
        leverageValidator = ILeverageValidator(_leverageValidator);
    }

    // ============ Core Functions ============

    /**
     * @notice Open a leveraged position
     * @param poolKey The Uniswap V4 pool key
     * @param collateralToken Token used as collateral
     * @param collateralAmount Amount of collateral to deposit
     * @param borrowAmount Amount to borrow for leverage
     * @param leverageRatio Desired leverage ratio (100 = 1x, 1000 = 10x)
     * @param isLongPosition True for long, false for short
     * @return positionId The created position ID
     */
    function openLeveragePosition(
        PoolKey calldata poolKey,
        address collateralToken,
        uint256 collateralAmount,
        uint256 borrowAmount,
        uint256 leverageRatio,
        bool isLongPosition
    ) external nonReentrant notPaused returns (bytes32 positionId) {
        bytes32 poolId = _getPoolId(poolKey);

        require(collateralAmount > 0, "MarginRouter: Invalid collateral");

        // Validate leverage constraints
        _validateLeverageConstraints(poolId, leverageRatio);

        // Transfer collateral from trader
        IERC20(collateralToken).safeTransferFrom(
            msg.sender,
            address(this),
            collateralAmount
        );

        // Generate position ID
        positionId = keccak256(abi.encodePacked(
            msg.sender,
            block.timestamp,
            positionCounter++
        ));

        // Create position struct
        ILeverageValidator.LeveragePosition memory position = ILeverageValidator.LeveragePosition({
            trader: msg.sender,
            collateralToken: collateralToken,
            borrowedToken: isLongPosition ? Currency.unwrap(poolKey.currency1) : Currency.unwrap(poolKey.currency0),
            collateralAmount: collateralAmount,
            borrowedAmount: borrowAmount,
            leverageRatio: leverageRatio,
            isLongPosition: isLongPosition,
            openTimestamp: block.timestamp,
            positionId: positionId
        });

        // Validate through EigenLayer operators
        (bool isValid, string memory reason) = leverageValidator.validateLeveragePosition(
            position,
            new bytes[](0) // Empty signatures for now - would be populated in production
        );

        require(isValid, string(abi.encodePacked("MarginRouter: ", reason)));

        // Check cross-pool exposure limits
        (bool exceedsLimit,,) = leverageValidator.checkCrossPoolExposure(msg.sender, position);
        require(!exceedsLimit, "MarginRouter: Exceeds cross-pool exposure");

        // Store position
        positions[positionId] = position;
        traderPositions[msg.sender].push(positionId);

        // Execute leverage operation through pool
        _executeLeverageOperation(poolKey, position);

        emit LeveragePositionOpened(
            positionId,
            msg.sender,
            poolId,
            collateralAmount,
            borrowAmount,
            leverageRatio
        );

        return positionId;
    }

    /**
     * @notice Close a leveraged position
     * @param positionId The position to close
     * @param poolKey The associated pool key
     * @return pnl The profit/loss from the position
     */
    function closeLeveragePosition(
        bytes32 positionId,
        PoolKey calldata poolKey
    ) external nonReentrant notPaused returns (int256 pnl) {
        ILeverageValidator.LeveragePosition memory position = positions[positionId];

        require(position.trader == msg.sender, "MarginRouter: Not position owner");
        require(position.openTimestamp > 0, "MarginRouter: Position not found");

        // Check if position needs liquidation
        (bool shouldLiquidate,,) = leverageValidator.checkLiquidation(positionId);

        if (shouldLiquidate) {
            // Force liquidation
            pnl = _liquidatePosition(positionId, poolKey);
        } else {
            // Normal closure
            pnl = _closePosition(positionId, poolKey);
        }

        // Clean up position data
        delete positions[positionId];
        _removePositionFromTrader(msg.sender, positionId);

        emit LeveragePositionClosed(positionId, msg.sender, pnl);

        return pnl;
    }

    // ============ View Functions ============

    /**
     * @notice Get trader's positions
     * @param trader The trader address
     * @return positionIds Array of position IDs
     */
    function getTraderPositions(
        address trader
    ) external view returns (bytes32[] memory positionIds) {
        return traderPositions[trader];
    }

    /**
     * @notice Get position details
     * @param positionId The position ID
     * @return position The position details
     */
    function getPosition(
        bytes32 positionId
    ) external view returns (ILeverageValidator.LeveragePosition memory position) {
        return positions[positionId];
    }

    /**
     * @notice Check if position is healthy
     * @param positionId The position ID
     * @return isHealthy Whether position is above liquidation threshold
     * @return healthFactor Current health factor
     */
    function checkPositionHealth(
        bytes32 positionId
    ) external view returns (bool isHealthy, uint256 healthFactor) {
        (bool shouldLiquidate,, uint256 health) = leverageValidator.checkLiquidation(positionId);
        return (!shouldLiquidate, health);
    }

    // ============ Admin Functions ============

    /**
     * @notice Authorize a pool for leverage trading
     * @param poolKey The pool to authorize
     * @param leverageCap Maximum leverage for this pool
     */
    function authorizePool(
        PoolKey calldata poolKey,
        uint256 leverageCap
    ) external onlyOwner {
        bytes32 poolId = _getPoolId(poolKey);
        authorizedPools[poolId] = true;
        poolLeverageCaps[poolId] = leverageCap;

        emit PoolAuthorized(poolId, leverageCap);
    }

    /**
     * @notice Emergency pause all operations
     * @param paused Whether to pause or unpause
     */
    function setEmergencyPause(bool paused) external onlyOwner {
        emergencyPaused = paused;
        emit EmergencyPauseToggled(paused);
    }

    /**
     * @notice Update global leverage cap
     * @param newCap New maximum leverage (100 = 1x, 1000 = 10x)
     */
    function setMaxGlobalLeverage(uint256 newCap) external onlyOwner {
        require(newCap >= 100 && newCap <= 5000, "MarginRouter: Invalid leverage cap");
        maxGlobalLeverage = newCap;
    }

    // ============ Internal Functions ============

    /**
     * @notice Generate pool ID from pool key
     */
    function _getPoolId(PoolKey calldata key) internal pure returns (bytes32) {
        return keccak256(abi.encode(key.currency0, key.currency1, key.fee, key.tickSpacing));
    }

    /**
     * @notice Validate leverage constraints
     */
    function _validateLeverageConstraints(
        bytes32 poolId,
        uint256 leverageRatio
    ) internal view validLeverage(leverageRatio, poolId) onlyAuthorizedPool(poolId) {
        // Additional validations can be added here
    }

    /**
     * @notice Execute leverage operation through Uniswap V4
     */
    function _executeLeverageOperation(
        PoolKey calldata poolKey,
        ILeverageValidator.LeveragePosition memory position
    ) internal {
        // Encode position data for hook
        bytes memory hookData = abi.encode(position);

        // Create liquidity removal params to trigger leverage hook
        ModifyLiquidityParams memory params = ModifyLiquidityParams({
            tickLower: -887220, // Full range
            tickUpper: 887220,
            liquidityDelta: -int256(position.borrowedAmount), // Remove liquidity = borrow
            salt: 0
        });

        // Execute through PoolManager with hook integration
        // Note: Actual implementation would use PoolManager.modifyLiquidity
        // poolManager.modifyLiquidity(poolKey, params, hookData);
    }

    /**
     * @notice Close position and calculate PnL
     */
    function _closePosition(
        bytes32 positionId,
        PoolKey calldata poolKey
    ) internal returns (int256 pnl) {
        // Implementation would calculate current value vs initial
        // Return liquidity to pool, repay borrowed amount
        // Return remaining collateral to trader
        return 0; // Placeholder
    }

    /**
     * @notice Liquidate underwater position
     */
    function _liquidatePosition(
        bytes32 positionId,
        PoolKey calldata poolKey
    ) internal returns (int256 pnl) {
        // Implementation would liquidate position at current market price
        // Apply liquidation penalty
        return 0; // Placeholder
    }

    /**
     * @notice Remove position from trader's position array
     */
    function _removePositionFromTrader(address trader, bytes32 positionId) internal {
        bytes32[] storage positions = traderPositions[trader];
        for (uint256 i = 0; i < positions.length; i++) {
            if (positions[i] == positionId) {
                positions[i] = positions[positions.length - 1];
                positions.pop();
                break;
            }
        }
    }
}