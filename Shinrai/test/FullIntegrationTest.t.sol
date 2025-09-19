// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {PoolSwapTest} from "v4-core/test/PoolSwapTest.sol";
import {LeverageHook} from "../src/LeverageHook.sol";
import {MarginRouter} from "../src/MarginRouter.sol";
import {GlobalAssetLedger} from "../src/GlobalAssetLedger.sol";
import {MockTestToken} from "../src/MockTestToken.sol";
import {ILeverageValidator} from "../src/interface/ILeverageValidator.sol";
import {IEigenAssetVerifier} from "../src/interface/IEigenAssetVerifier.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {SwapParams} from "v4-core/types/PoolOperation.sol";
import {ModifyLiquidityParams} from "v4-core/types/PoolOperation.sol";
import {Currency, CurrencyLibrary} from "v4-core/types/Currency.sol";
import {LPFeeLibrary} from "v4-core/libraries/LPFeeLibrary.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";

/**
 * @title FullIntegrationTest
 * @notice End-to-end integration tests for the complete Shinrai leverage system
 */
contract FullIntegrationTest is Test, Deployers {

    // ============ Test Contracts ============
    LeverageHook public leverageHook;
    MarginRouter public marginRouter;
    GlobalAssetLedger public globalAssetLedger;
    MockTestToken public collateralToken;
    MockTestToken public borrowToken;
    ComprehensiveMockValidator public validator;

    // ============ Test Users ============
    address public constant OWNER = address(0x1);
    address public constant TRADER1 = address(0x2);
    address public constant TRADER2 = address(0x3);
    address public constant LIQUIDATOR = address(0x4);
    address public constant LP_PROVIDER = address(0x5);
    address public constant OPERATOR1 = address(0x6);
    address public constant OPERATOR2 = address(0x7);
    address public constant OPERATOR3 = address(0x8);

    // ============ Test Constants ============
    uint256 public constant INITIAL_BALANCE = 1000000 ether;
    uint256 public constant COLLATERAL_AMOUNT = 1000 ether;
    uint256 public constant BORROW_AMOUNT = 2000 ether; // 2x leverage
    uint256 public constant HIGH_LEVERAGE_BORROW = 5000 ether; // 5x leverage
    uint256 public constant GLOBAL_BORROW_CAP = 1000000 ether;
    uint256 public constant POOL_BORROW_CAP = 500000 ether;

    // ============ Pool Keys ============
    PoolKey public ethUsdcPool;
    PoolKey public btcEthPool;

    // ============ Test Scenarios ============

    function setUp() public {
        // Deploy v4-core contracts
        deployFreshManagerAndRouters();

        // Deploy custom tokens for better control
        vm.startPrank(OWNER);
        collateralToken = new MockTestToken("Wrapped ETH", "WETH", 18, OWNER);
        borrowToken = new MockTestToken("USD Coin", "USDC", 6, OWNER);

        // Deploy comprehensive validator
        validator = new ComprehensiveMockValidator();

        // Deploy core system contracts
        globalAssetLedger = new GlobalAssetLedger(address(validator), OWNER);
        leverageHook = new LeverageHook(manager, validator, globalAssetLedger);
        marginRouter = new MarginRouter(
            address(manager),
            validator,
            globalAssetLedger,
            OWNER
        );

        // Configure system
        globalAssetLedger.setAuthorizedRouter(address(marginRouter), true);
        globalAssetLedger.setGlobalBorrowCap(address(borrowToken), GLOBAL_BORROW_CAP);
        globalAssetLedger.setGlobalBorrowCap(address(collateralToken), GLOBAL_BORROW_CAP);

        vm.stopPrank();

        // Deploy mock currencies for Uniswap pools
        deployMintAndApprove2Currencies();

        // Initialize ETH/USDC pool
        (ethUsdcPool, ) = initPool(
            Currency.wrap(address(collateralToken)),
            Currency.wrap(address(borrowToken)),
            leverageHook,
            LPFeeLibrary.DYNAMIC_FEE_FLAG,
            SQRT_PRICE_1_1
        );

        // Initialize BTC/ETH pool
        (btcEthPool, ) = initPool(
            currency0,
            Currency.wrap(address(collateralToken)),
            leverageHook,
            LPFeeLibrary.DYNAMIC_FEE_FLAG,
            SQRT_PRICE_1_1
        );

        _setupSystemConfiguration();
        _setupUserBalances();
        _setupEigenLayerOperators();
    }

    // ============ Scenario 1: Basic Leverage Position Lifecycle ============

    function testScenario1_BasicLeverageLifecycle() public {
        console.log("=== Scenario 1: Basic Leverage Position Lifecycle ===");

        // Step 1: Trader opens a 2x leveraged long ETH position
        console.log("Step 1: Opening 2x leveraged ETH position");

        vm.startPrank(TRADER1);
        collateralToken.approve(address(marginRouter), COLLATERAL_AMOUNT);

        bytes32 positionId = marginRouter.openLeveragePosition(
            ethUsdcPool,
            address(collateralToken), // ETH collateral
            COLLATERAL_AMOUNT,
            BORROW_AMOUNT, // Borrow USDC
            200, // 2x leverage
            true // Long position
        );

        vm.stopPrank();

        // Verify position was created
        ILeverageValidator.LeveragePosition memory position = marginRouter.getPosition(positionId);
        assertEq(position.trader, TRADER1);
        assertEq(position.leverageRatio, 200);
        assertTrue(position.isLongPosition);

        console.log("Position opened successfully with ID:", vm.toString(positionId));

        // Step 2: Check position health
        (bool isHealthy, uint256 healthFactor) = marginRouter.checkPositionHealth(positionId);
        assertTrue(isHealthy);
        assertGt(healthFactor, 1200); // Should be above 120%
        console.log("Position health factor:", healthFactor);

        // Step 3: Simulate favorable price movement and close position
        console.log("Step 3: Closing position after favorable movement");

        vm.startPrank(TRADER1);
        int256 pnl = marginRouter.closeLeveragePosition(positionId, ethUsdcPool);
        vm.stopPrank();

        console.log("Position closed with PnL:", vm.toString(pnl));

        // Verify position was cleaned up
        ILeverageValidator.LeveragePosition memory closedPosition = marginRouter.getPosition(positionId);
        assertEq(closedPosition.trader, address(0));
    }

    // ============ Scenario 2: Cross-Pool Exposure Management ============

    function testScenario2_CrossPoolExposureManagement() public {
        console.log("=== Scenario 2: Cross-Pool Exposure Management ===");

        // Step 1: Open position in ETH/USDC pool
        vm.startPrank(TRADER1);
        collateralToken.approve(address(marginRouter), COLLATERAL_AMOUNT * 2);

        bytes32 position1 = marginRouter.openLeveragePosition(
            ethUsdcPool,
            address(collateralToken),
            COLLATERAL_AMOUNT,
            BORROW_AMOUNT,
            200,
            true
        );

        vm.stopPrank();
        console.log("Opened first position in ETH/USDC pool");

        // Step 2: Try to open large position in BTC/ETH pool (should be limited by cross-pool exposure)
        validator.setTraderExposure(TRADER1, COLLATERAL_AMOUNT, BORROW_AMOUNT, BORROW_AMOUNT);
        validator.setCrossPoolExposure(true, BORROW_AMOUNT, 3000 ether); // Exceeds limit

        vm.startPrank(TRADER1);
        currency0.mint(TRADER1, INITIAL_BALANCE);
        MockERC20(Currency.unwrap(currency0)).approve(address(marginRouter), COLLATERAL_AMOUNT);

        vm.expectRevert("MarginRouter: Exceeds cross-pool exposure");
        marginRouter.openLeveragePosition(
            btcEthPool,
            Currency.unwrap(currency0), // BTC collateral
            COLLATERAL_AMOUNT,
            HIGH_LEVERAGE_BORROW, // Large borrow that exceeds cross-pool limits
            500,
            false
        );

        vm.stopPrank();
        console.log("Successfully prevented excessive cross-pool exposure");

        // Step 3: Open smaller position that stays within limits
        validator.setCrossPoolExposure(false, BORROW_AMOUNT, 5000 ether); // Within limit

        vm.startPrank(TRADER1);
        bytes32 position2 = marginRouter.openLeveragePosition(
            btcEthPool,
            Currency.unwrap(currency0),
            COLLATERAL_AMOUNT / 2,
            BORROW_AMOUNT / 2,
            200,
            false
        );

        vm.stopPrank();
        console.log("Opened second position within cross-pool limits");

        // Verify both positions exist
        bytes32[] memory traderPositions = marginRouter.getTraderPositions(TRADER1);
        assertEq(traderPositions.length, 2);
    }

    // ============ Scenario 3: EigenLayer Operator Consensus ============

    function testScenario3_EigenLayerOperatorConsensus() public {
        console.log("=== Scenario 3: EigenLayer Operator Consensus ===");

        // Step 1: Test position approval with sufficient consensus (2/3 operators approve)
        validator.setConsensusThreshold(2);
        validator.setOperatorApprovals(OPERATOR1, true);
        validator.setOperatorApprovals(OPERATOR2, true);
        validator.setOperatorApprovals(OPERATOR3, false);

        vm.startPrank(TRADER1);
        collateralToken.approve(address(marginRouter), COLLATERAL_AMOUNT);

        bytes32 positionId = marginRouter.openLeveragePosition(
            ethUsdcPool,
            address(collateralToken),
            COLLATERAL_AMOUNT,
            BORROW_AMOUNT,
            200,
            true
        );

        vm.stopPrank();
        assertTrue(positionId != bytes32(0));
        console.log("Position approved with operator consensus (2/3)");

        // Step 2: Test position rejection with insufficient consensus (1/3 operators approve)
        validator.setOperatorApprovals(OPERATOR1, true);
        validator.setOperatorApprovals(OPERATOR2, false);
        validator.setOperatorApprovals(OPERATOR3, false);

        vm.startPrank(TRADER2);
        collateralToken.mint(TRADER2, INITIAL_BALANCE);
        collateralToken.approve(address(marginRouter), COLLATERAL_AMOUNT);

        vm.expectRevert();
        marginRouter.openLeveragePosition(
            ethUsdcPool,
            address(collateralToken),
            COLLATERAL_AMOUNT,
            BORROW_AMOUNT,
            200,
            true
        );

        vm.stopPrank();
        console.log("Position rejected with insufficient consensus (1/3)");
    }

    // ============ Scenario 4: Pool Manipulation Detection ============

    function testScenario4_PoolManipulationDetection() public {
        console.log("=== Scenario 4: Pool Manipulation Detection ===");

        // Step 1: Normal swap when no manipulation detected
        validator.setManipulationDetected(false, 0, 0, 0);

        vm.startPrank(TRADER1);
        collateralToken.approve(address(swapRouter), 10 ether);

        SwapParams memory normalSwap = SwapParams({
            zeroForOne: true,
            amountSpecified: -int256(1 ether),
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });

        PoolSwapTest.TestSettings memory testSettings = PoolSwapTest.TestSettings({
            takeClaims: false,
            settleUsingBurn: false
        });

        swapRouter.swap(ethUsdcPool, normalSwap, testSettings, ZERO_BYTES);
        vm.stopPrank();
        console.log("Normal swap executed successfully");

        // Step 2: Swap rejection when manipulation detected
        validator.setManipulationDetected(true, 500, 1000, 200); // 5% price deviation, 10x volume, 2% liquidity change

        address[] memory suspiciousOps = new address[](1);
        suspiciousOps[0] = OPERATOR3;
        validator.setSuspiciousOperators(suspiciousOps);

        vm.startPrank(TRADER1);
        vm.expectRevert();
        swapRouter.swap(ethUsdcPool, normalSwap, testSettings, ZERO_BYTES);
        vm.stopPrank();
        console.log("Swap rejected due to manipulation detection");

        // Step 3: Emergency pool pause by operators
        validator.setEmergencyConsensus(true);
        bytes32 poolId = _getPoolId(ethUsdcPool);

        validator.emergencyPausePool(poolId, "Manipulation detected by operators");
        assertTrue(validator.isPoolPaused(poolId));
        console.log("Pool emergency paused by operator consensus");
    }

    // ============ Scenario 5: Dynamic Fee Adjustment ============

    function testScenario5_DynamicFeeAdjustment() public {
        console.log("=== Scenario 5: Dynamic Fee Adjustment ===");

        // Step 1: Test fee calculation at different utilization levels
        uint24 lowUtilizationFee = leverageHook._calculateDynamicFee(3000); // 30%
        uint24 mediumUtilizationFee = leverageHook._calculateDynamicFee(6500); // 65%
        uint24 highUtilizationFee = leverageHook._calculateDynamicFee(8500); // 85%

        assertEq(lowUtilizationFee, 500); // 0.05%
        assertEq(mediumUtilizationFee, 1000); // 0.1%
        assertEq(highUtilizationFee, 2000); // 0.2%

        console.log("Dynamic fees calculated:");
        console.log("- Low utilization (30%):", lowUtilizationFee);
        console.log("- Medium utilization (65%):", mediumUtilizationFee);
        console.log("- High utilization (85%):", highUtilizationFee);

        // Step 2: Test fee updates through liquidity operations
        validator.setUtilizationRate(8500); // High utilization

        vm.startPrank(TRADER1);
        collateralToken.approve(address(marginRouter), COLLATERAL_AMOUNT);

        marginRouter.openLeveragePosition(
            ethUsdcPool,
            address(collateralToken),
            COLLATERAL_AMOUNT,
            BORROW_AMOUNT,
            200,
            true
        );

        vm.stopPrank();
        console.log("Leverage position opened with high utilization rate");
    }

    // ============ Scenario 6: Liquidation Process ============

    function testScenario6_LiquidationProcess() public {
        console.log("=== Scenario 6: Liquidation Process ===");

        // Step 1: Open position that will become unhealthy
        vm.startPrank(TRADER1);
        collateralToken.approve(address(marginRouter), COLLATERAL_AMOUNT);

        bytes32 positionId = marginRouter.openLeveragePosition(
            ethUsdcPool,
            address(collateralToken),
            COLLATERAL_AMOUNT,
            BORROW_AMOUNT,
            200,
            true
        );

        vm.stopPrank();
        console.log("Opened position that will become unhealthy");

        // Step 2: Simulate adverse price movement making position unhealthy
        validator.setLiquidationStatus(true, 50 ether, 800); // Health factor below 120%

        (bool isHealthy, uint256 healthFactor) = marginRouter.checkPositionHealth(positionId);
        assertFalse(isHealthy);
        assertLt(healthFactor, 1200);
        console.log("Position became unhealthy with health factor:", healthFactor);

        // Step 3: Force liquidation through position closure
        vm.startPrank(TRADER1);
        int256 pnl = marginRouter.closeLeveragePosition(positionId, ethUsdcPool);
        vm.stopPrank();

        console.log("Position liquidated with PnL:", vm.toString(pnl));

        // Verify position was cleaned up
        ILeverageValidator.LeveragePosition memory liquidatedPosition = marginRouter.getPosition(positionId);
        assertEq(liquidatedPosition.trader, address(0));
    }

    // ============ Scenario 7: Emergency Functions ============

    function testScenario7_EmergencyFunctions() public {
        console.log("=== Scenario 7: Emergency Functions ===");

        // Step 1: Emergency pause of margin router
        vm.startPrank(OWNER);
        marginRouter.setEmergencyPause(true);
        vm.stopPrank();

        assertTrue(marginRouter.emergencyPaused());

        // Step 2: Verify operations are blocked
        vm.startPrank(TRADER1);
        collateralToken.approve(address(marginRouter), COLLATERAL_AMOUNT);

        vm.expectRevert("MarginRouter: Emergency paused");
        marginRouter.openLeveragePosition(
            ethUsdcPool,
            address(collateralToken),
            COLLATERAL_AMOUNT,
            BORROW_AMOUNT,
            200,
            true
        );

        vm.stopPrank();
        console.log("Operations successfully blocked during emergency pause");

        // Step 3: Emergency liquidation of multiple positions
        bytes32[] memory positionsToLiquidate = new bytes32[](2);
        positionsToLiquidate[0] = keccak256("position1");
        positionsToLiquidate[1] = keccak256("position2");

        validator.setLiquidationRequired(positionsToLiquidate[0], true);
        validator.setLiquidationRequired(positionsToLiquidate[1], true);
        validator.setEmergencyConsensus(true);

        validator.emergencyLiquidate(positionsToLiquidate, "Market crash - emergency liquidation");

        assertTrue(validator.wasLiquidated(positionsToLiquidate[0]));
        assertTrue(validator.wasLiquidated(positionsToLiquidate[1]));
        console.log("Emergency liquidation executed successfully");
    }

    // ============ Scenario 8: Funding Rate Evolution ============

    function testScenario8_FundingRateEvolution() public {
        console.log("=== Scenario 8: Funding Rate Evolution ===");

        bytes32 poolId = _getPoolId(ethUsdcPool);

        // Step 1: Low utilization period
        validator.setUtilizationRate(3000); // 30%
        globalAssetLedger.updateFundingRate(poolId);
        uint256 lowRate = globalAssetLedger.poolFundingRates(poolId);
        console.log("Low utilization funding rate:", lowRate);

        // Step 2: Medium utilization period
        validator.setUtilizationRate(6000); // 60%
        globalAssetLedger.updateFundingRate(poolId);
        uint256 mediumRate = globalAssetLedger.poolFundingRates(poolId);
        console.log("Medium utilization funding rate:", mediumRate);

        // Step 3: High utilization period
        validator.setUtilizationRate(9000); // 90%
        globalAssetLedger.updateFundingRate(poolId);
        uint256 highRate = globalAssetLedger.poolFundingRates(poolId);
        console.log("High utilization funding rate:", highRate);

        // Verify rates increase with utilization
        assertGt(mediumRate, lowRate);
        assertGt(highRate, mediumRate);
    }

    // ============ Helper Functions ============

    function _setupSystemConfiguration() internal {
        vm.startPrank(OWNER);

        // Configure borrow caps for both pools
        bytes32 ethUsdcPoolId = _getPoolId(ethUsdcPool);
        bytes32 btcEthPoolId = _getPoolId(btcEthPool);

        globalAssetLedger.setPoolBorrowCap(ethUsdcPoolId, address(borrowToken), POOL_BORROW_CAP);
        globalAssetLedger.setPoolBorrowCap(ethUsdcPoolId, address(collateralToken), POOL_BORROW_CAP);
        globalAssetLedger.setPoolBorrowCap(btcEthPoolId, Currency.unwrap(currency0), POOL_BORROW_CAP);
        globalAssetLedger.setPoolBorrowCap(btcEthPoolId, address(collateralToken), POOL_BORROW_CAP);

        // Authorize pools for leverage trading
        marginRouter.authorizePool(ethUsdcPool, 1000); // 10x max leverage
        marginRouter.authorizePool(btcEthPool, 1000);

        vm.stopPrank();
    }

    function _setupUserBalances() internal {
        // Mint tokens to all test users
        address[] memory users = new address[](5);
        users[0] = TRADER1;
        users[1] = TRADER2;
        users[2] = LIQUIDATOR;
        users[3] = LP_PROVIDER;
        users[4] = OWNER;

        for (uint256 i = 0; i < users.length; i++) {
            collateralToken.mint(users[i], INITIAL_BALANCE);
            borrowToken.mint(users[i], INITIAL_BALANCE);
        }
    }

    function _setupEigenLayerOperators() internal {
        uint8[] memory quorums = new uint8[](1);
        quorums[0] = 0;

        // Register operators
        vm.startPrank(OPERATOR1);
        validator.registerOperator(OPERATOR1, quorums, "socket://operator1:8080");
        vm.stopPrank();

        vm.startPrank(OPERATOR2);
        validator.registerOperator(OPERATOR2, quorums, "socket://operator2:8080");
        vm.stopPrank();

        vm.startPrank(OPERATOR3);
        validator.registerOperator(OPERATOR3, quorums, "socket://operator3:8080");
        vm.stopPrank();

        // Set default approvals
        validator.setOperatorApprovals(OPERATOR1, true);
        validator.setOperatorApprovals(OPERATOR2, true);
        validator.setOperatorApprovals(OPERATOR3, true);
    }

    function _getPoolId(PoolKey memory key) internal pure returns (bytes32) {
        return keccak256(abi.encode(key.currency0, key.currency1, key.fee, key.tickSpacing));
    }
}

// ============ Comprehensive Mock Validator ============

contract ComprehensiveMockValidator is ILeverageValidator {
    // Operator management
    mapping(address => IEigenAssetVerifier.OperatorInfo) public operators;
    mapping(address => bool) public operatorApprovals;
    uint256 public consensusThreshold = 2;

    // Cross-pool exposure tracking
    mapping(address => uint256) public traderCollateral;
    mapping(address => uint256) public traderBorrowed;
    mapping(address => uint256) public traderNetExposure;
    bool public crossPoolExceedsLimit = false;

    // Manipulation detection
    bool public manipulationDetected = false;
    uint256 public priceDeviation = 0;
    uint256 public volumeAnomaly = 0;
    uint256 public liquidityChange = 0;
    address[] public suspiciousOperators;

    // Pool state
    mapping(bytes32 => bool) public poolPaused;
    uint256 public utilizationRate = 5000;

    // Liquidation
    mapping(bytes32 => bool) public liquidationRequired;
    mapping(bytes32 => bool) public liquidationExecuted;
    bool public emergencyConsensusReached = false;

    // ============ Configuration Functions ============

    function setConsensusThreshold(uint256 _threshold) external {
        consensusThreshold = _threshold;
    }

    function setOperatorApprovals(address operator, bool approved) external {
        operatorApprovals[operator] = approved;
    }

    function setTraderExposure(address trader, uint256 collateral, uint256 borrowed, uint256 netExposure) external {
        traderCollateral[trader] = collateral;
        traderBorrowed[trader] = borrowed;
        traderNetExposure[trader] = netExposure;
    }

    function setCrossPoolExposure(bool exceeds, uint256 current, uint256 max) external {
        crossPoolExceedsLimit = exceeds;
    }

    function setManipulationDetected(bool detected, uint256 pricedev, uint256 volumeAnom, uint256 liquidityChng) external {
        manipulationDetected = detected;
        priceDeviation = pricedev;
        volumeAnomaly = volumeAnom;
        liquidityChange = liquidityChng;
    }

    function setSuspiciousOperators(address[] memory _operators) external {
        delete suspiciousOperators;
        for (uint256 i = 0; i < _operators.length; i++) {
            suspiciousOperators.push(_operators[i]);
        }
    }

    function setUtilizationRate(uint256 rate) external {
        utilizationRate = rate;
    }

    function setLiquidationStatus(bool liquidate, uint256 price, uint256 health) external {
        // This is a simplified way to set liquidation status for testing
        // In a real implementation, you'd track individual positions
    }

    function setLiquidationRequired(bytes32 positionId, bool required) external {
        liquidationRequired[positionId] = required;
    }

    function setEmergencyConsensus(bool consensus) external {
        emergencyConsensusReached = consensus;
    }

    function isPoolPaused(bytes32 poolId) external view returns (bool) {
        return poolPaused[poolId];
    }

    function wasLiquidated(bytes32 positionId) external view returns (bool) {
        return liquidationExecuted[positionId];
    }

    // ============ ILeverageValidator Implementation ============

    function validateLeveragePosition(LeveragePosition calldata, bytes[] calldata) external view override returns (bool isValid, string memory reason) {
        uint256 approvals = 0;
        if (operatorApprovals[address(0x6)]) approvals++; // OPERATOR1
        if (operatorApprovals[address(0x7)]) approvals++; // OPERATOR2
        if (operatorApprovals[address(0x8)]) approvals++; // OPERATOR3

        if (approvals >= consensusThreshold) {
            return (true, "Consensus reached");
        } else {
            return (false, "Insufficient operator consensus");
        }
    }

    function validateBorrowRequest(bytes32, address, address, uint256, uint256) external pure override returns (BorrowValidation memory) {
        return BorrowValidation(true, 1000000 ether, 100 ether, 8000, "Approved");
    }

    function verifySwap(bytes32, SwapParams calldata, bytes calldata) external view override returns (bool) {
        return !manipulationDetected;
    }

    function checkPoolManipulation(bytes32, bytes calldata, bytes calldata) external view override returns (ManipulationCheck memory) {
        return ManipulationCheck({
            isManipulated: manipulationDetected,
            priceDeviation: priceDeviation,
            volumeAnomaly: volumeAnomaly,
            liquidityChange: liquidityChange,
            suspiciousOperators: suspiciousOperators
        });
    }

    function checkCrossPoolExposure(address trader, LeveragePosition calldata newPosition) external view override returns (bool exceedsLimit, uint256 currentExposure, uint256 maxAllowedExposure) {
        uint256 newBorrowed = traderBorrowed[trader] + newPosition.borrowedAmount;
        maxAllowedExposure = 3000 ether;
        currentExposure = traderBorrowed[trader];
        exceedsLimit = crossPoolExceedsLimit || newBorrowed > maxAllowedExposure;
    }

    function getTraderExposure(address trader) external view override returns (uint256 totalCollateral, uint256 totalBorrowed, uint256 netExposure) {
        return (traderCollateral[trader], traderBorrowed[trader], traderNetExposure[trader]);
    }

    function checkLiquidation(bytes32 positionId) external view override returns (bool shouldLiquidate, uint256 liquidationPrice, uint256 healthFactor) {
        return (liquidationRequired[positionId], 50 ether, 800);
    }

    function calculateFundingRate(bytes32, uint256 targetUtilization) external pure override returns (uint256) {
        if (targetUtilization < 5000) return 50;
        if (targetUtilization < 7000) return 100;
        return 300;
    }

    function getPoolUtilization(bytes32) external view override returns (PoolUtilization memory) {
        return PoolUtilization(bytes32(0), 1000000 ether, utilizationRate * 10000 ether / 10000, utilizationRate, 100, false);
    }

    function updateFundingRate(bytes32, uint256) external override {}

    function emergencyPausePool(bytes32 poolId, string calldata) external override {
        require(emergencyConsensusReached, "Emergency consensus required");
        poolPaused[poolId] = true;
    }

    function emergencyLiquidate(bytes32[] calldata positionIds, string calldata) external override {
        require(emergencyConsensusReached, "Emergency consensus required");
        for (uint256 i = 0; i < positionIds.length; i++) {
            liquidationExecuted[positionIds[i]] = true;
        }
    }

    // ============ IEigenAssetVerifier Implementation ============

    function registerOperator(address operator, uint8[] calldata quorums, string calldata) external override {
        operators[operator] = IEigenAssetVerifier.OperatorInfo({
            operator: operator,
            stakedAmount: 1000 ether,
            quorums: quorums,
            isRegistered: true,
            isSlashed: false
        });
        emit OperatorRegistered(operator, quorums, 1000 ether);
    }

    function deregisterOperator(address operator, uint8[] calldata) external override {
        operators[operator].isRegistered = false;
    }

    function getOperatorInfo(address operator) external view override returns (IEigenAssetVerifier.OperatorInfo memory) {
        return operators[operator];
    }

    // ============ Stub Implementations ============

    function getSwapValidation(bytes32, address, uint256) external pure override returns (SwapValidation memory) {
        return SwapValidation(true, "", 1000 ether, new address[](0));
    }

    function createMarket(bytes32, uint256, uint256, uint8[] calldata) external override {}
    function submitMarketValidation(bytes32, bool, bytes calldata) external override {}
    function getMarketValidation(bytes32) external pure override returns (MarketValidation memory) {
        return MarketValidation(bytes32(0), new address[](0), 0, 0, false);
    }

    function checkStakeRequirement(address, uint8) external pure override returns (bool) { return true; }
    function slashOperator(address, bytes32, uint256) external override {}
    function isOperatorSlashed(address) external pure override returns (bool) { return false; }

    function getOperatorCount(uint8) external pure override returns (uint256) { return 3; }
    function getActiveMarkets() external pure override returns (bytes32[] memory) {
        return new bytes32[](0);
    }
    function isMarketActive(bytes32) external pure override returns (bool) { return true; }
}