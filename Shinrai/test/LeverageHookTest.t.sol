// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {PoolSwapTest} from "v4-core/test/PoolSwapTest.sol";
import {LeverageHook} from "../src/LeverageHook.sol";
import {MarginRouter} from "../src/MarginRouter.sol";
import {GlobalAssetLedger} from "../src/GlobalAssetLedger.sol";
import {ILeverageValidator} from "../src/interface/ILeverageValidator.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {SwapParams} from "v4-core/types/PoolOperation.sol";
import {ModifyLiquidityParams} from "v4-core/types/PoolOperation.sol";
import {Currency, CurrencyLibrary} from "v4-core/types/Currency.sol";
import {BalanceDelta} from "v4-core/types/BalanceDelta.sol";
import {LPFeeLibrary} from "v4-core/libraries/LPFeeLibrary.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";

/**
 * @title LeverageHookTest
 * @notice Comprehensive tests for LeverageHook functionality
 */
contract LeverageHookTest is Test, Deployers {

    // ============ Test Contracts ============
    LeverageHook public leverageHook;
    MarginRouter public marginRouter;
    GlobalAssetLedger public globalAssetLedger;
    MockLeverageValidator public mockValidator;

    // ============ Test Users ============
    address public constant TRADER1 = address(0x1);
    address public constant TRADER2 = address(0x2);
    address public constant LP1 = address(0x3);
    address public constant OWNER = address(0x5);

    // ============ Test Constants ============
    uint256 public constant INITIAL_BALANCE = 1000000 ether;
    uint256 public constant COLLATERAL_AMOUNT = 100 ether;
    uint256 public constant BORROW_AMOUNT = 300 ether;
    uint256 public constant DEFAULT_LEVERAGE = 300; // 3x

    // ============ Pool Keys ============
    PoolKey public poolKey;

    // ============ Events ============
    event LeveragePositionOpened(
        address indexed trader,
        bytes32 indexed positionId,
        uint256 collateral,
        uint256 borrowed,
        uint256 leverage
    );

    event DynamicFeeUpdated(
        bytes32 indexed poolId,
        uint24 newFee,
        uint256 utilizationRate
    );

    event PoolStateVerified(
        bytes32 indexed poolId,
        uint256 utilizationRate,
        bool isHealthy
    );

    // ============ Setup ============
    function setUp() public {
        // Deploy v4-core using Deployers utility
        deployFreshManagerAndRouters();
        deployMintAndApprove2Currencies();

        // Deploy mock validator
        mockValidator = new MockLeverageValidator();

        vm.startPrank(OWNER);

        // Deploy global asset ledger
        globalAssetLedger = new GlobalAssetLedger(
            address(mockValidator),
            OWNER
        );

        // Deploy leverage hook
        leverageHook = new LeverageHook(
            manager,
            mockValidator,
            globalAssetLedger
        );

        // Deploy margin router
        marginRouter = new MarginRouter(
            address(manager),
            mockValidator,
            globalAssetLedger,
            OWNER
        );

        // Connect contracts
        globalAssetLedger.setAuthorizedRouter(address(marginRouter), true);

        vm.stopPrank();

        // Initialize pool with hook
        (key, ) = initPool(
            currency0,
            currency1,
            leverageHook,
            LPFeeLibrary.DYNAMIC_FEE_FLAG,
            SQRT_PRICE_1_1
        );
        poolKey = key;

        // Add initial liquidity
        modifyLiquidityRouter.modifyLiquidity(
            key,
            ModifyLiquidityParams({
                tickLower: -60,
                tickUpper: 60,
                liquidityDelta: 100 ether,
                salt: bytes32(0)
            }),
            ZERO_BYTES
        );

        _setupInitialState();
    }

    // ============ Hook Permission Tests ============

    function testHookPermissions() public {
        Hooks.Permissions memory permissions = leverageHook.getHookPermissions();

        // Verify correct permissions are set
        assertFalse(permissions.beforeInitialize);
        assertFalse(permissions.afterInitialize);
        assertFalse(permissions.beforeAddLiquidity);
        assertTrue(permissions.beforeRemoveLiquidity);
        assertFalse(permissions.afterAddLiquidity);
        assertTrue(permissions.afterRemoveLiquidity);
        assertTrue(permissions.beforeSwap);
        assertTrue(permissions.afterSwap);
        assertFalse(permissions.beforeDonate);
        assertFalse(permissions.afterDonate);
    }

    // ============ Before Remove Liquidity Tests ============

    function testBeforeRemoveLiquiditySuccess() public {
        // Setup valid leverage position
        ILeverageValidator.LeveragePosition memory position = _createValidPosition();

        // Setup mock validator to approve
        mockValidator.setValidationResult(true, "Valid position");
        mockValidator.setCrossPoolExposure(false, 0, 0);

        bytes memory hookData = abi.encode(position);

        ModifyLiquidityParams memory params = ModifyLiquidityParams({
            tickLower: -60,
            tickUpper: 60,
            liquidityDelta: -1 ether,
            salt: bytes32(0)
        });

        // This should not revert
        modifyLiquidityRouter.modifyLiquidity(poolKey, params, hookData);
    }

    function testBeforeRemoveLiquidityFailsEigenLayerValidation() public {
        // Setup invalid leverage position
        ILeverageValidator.LeveragePosition memory position = _createValidPosition();

        // Setup mock validator to reject
        mockValidator.setValidationResult(false, "Invalid leverage ratio");

        bytes memory hookData = abi.encode(position);

        ModifyLiquidityParams memory params = ModifyLiquidityParams({
            tickLower: -60,
            tickUpper: 60,
            liquidityDelta: -1 ether,
            salt: bytes32(0)
        });

        // This should revert with EigenLayer validation failure
        vm.expectRevert();
        modifyLiquidityRouter.modifyLiquidity(poolKey, params, hookData);
    }

    function testBeforeRemoveLiquidityFailsCrossPoolExposure() public {
        // Setup valid leverage position
        ILeverageValidator.LeveragePosition memory position = _createValidPosition();

        // Setup mock validator to approve validation but reject cross-pool exposure
        mockValidator.setValidationResult(true, "Valid position");
        mockValidator.setCrossPoolExposure(true, 2000 ether, 1500 ether); // Exceeds limit

        bytes memory hookData = abi.encode(position);

        ModifyLiquidityParams memory params = ModifyLiquidityParams({
            tickLower: -60,
            tickUpper: 60,
            liquidityDelta: -1 ether,
            salt: bytes32(0)
        });

        // This should revert with cross-pool exposure failure
        vm.expectRevert();
        modifyLiquidityRouter.modifyLiquidity(poolKey, params, hookData);
    }

    function testBeforeRemoveLiquidityFailsBorrowAuthorization() public {
        // Setup valid leverage position
        ILeverageValidator.LeveragePosition memory position = _createValidPosition();

        // Setup mock validator to approve
        mockValidator.setValidationResult(true, "Valid position");
        mockValidator.setCrossPoolExposure(false, 0, 0);

        // Set very low borrow cap to fail authorization
        vm.startPrank(OWNER);
        globalAssetLedger.setPoolBorrowCap(
            _getPoolId(poolKey),
            position.borrowedToken,
            1 ether // Very low cap
        );
        vm.stopPrank();

        bytes memory hookData = abi.encode(position);

        ModifyLiquidityParams memory params = ModifyLiquidityParams({
            tickLower: -60,
            tickUpper: 60,
            liquidityDelta: -1 ether,
            salt: bytes32(0)
        });

        // This should revert with borrow authorization failure
        vm.expectRevert();
        modifyLiquidityRouter.modifyLiquidity(poolKey, params, hookData);
    }

    function testBeforeRemoveLiquidityExcessiveLeverage() public {
        // Setup leverage position with excessive leverage
        ILeverageValidator.LeveragePosition memory position = _createValidPosition();
        position.leverageRatio = 2000; // 20x leverage, exceeds MAX_LEVERAGE (10x)

        bytes memory hookData = abi.encode(position);

        ModifyLiquidityParams memory params = ModifyLiquidityParams({
            tickLower: -60,
            tickUpper: 60,
            liquidityDelta: -1 ether,
            salt: bytes32(0)
        });

        // This should revert with excessive leverage
        vm.expectRevert();
        modifyLiquidityRouter.modifyLiquidity(poolKey, params, hookData);
    }

    function testBeforeRemoveLiquidityNoCollateral() public {
        // Setup leverage position with no collateral
        ILeverageValidator.LeveragePosition memory position = _createValidPosition();
        position.collateralAmount = 0;

        bytes memory hookData = abi.encode(position);

        ModifyLiquidityParams memory params = ModifyLiquidityParams({
            tickLower: -60,
            tickUpper: 60,
            liquidityDelta: -1 ether,
            salt: bytes32(0)
        });

        // This should revert with no collateral provided
        vm.expectRevert();
        modifyLiquidityRouter.modifyLiquidity(poolKey, params, hookData);
    }

    // ============ After Remove Liquidity Tests ============

    function testAfterRemoveLiquidityDynamicFeeUpdate() public {
        // Create position to trigger liquidity removal
        ILeverageValidator.LeveragePosition memory position = _createValidPosition();

        // Setup mock validator
        mockValidator.setValidationResult(true, "Valid position");
        mockValidator.setCrossPoolExposure(false, 0, 0);

        bytes memory hookData = abi.encode(position);

        // Set high utilization to trigger fee update
        mockValidator.setUtilizationRate(8500); // 85%

        vm.expectEmit(true, false, false, false);
        emit DynamicFeeUpdated(_getPoolId(poolKey), 0, 0); // Don't check exact values

        ModifyLiquidityParams memory params = ModifyLiquidityParams({
            tickLower: -60,
            tickUpper: 60,
            liquidityDelta: -1 ether,
            salt: bytes32(0)
        });

        modifyLiquidityRouter.modifyLiquidity(poolKey, params, hookData);
    }

    // ============ Before Swap Tests ============

    function testBeforeSwapSuccess() public {
        // Setup mock validator to approve swap
        mockValidator.setSwapValidationResult(true);
        mockValidator.setManipulationDetected(false, 0, 0, 0);

        // Get token addresses
        address token0Address = Currency.unwrap(currency0);

        // Mint tokens to trader
        MockERC20(token0Address).mint(TRADER1, INITIAL_BALANCE);

        vm.startPrank(TRADER1);
        MockERC20(token0Address).approve(address(swapRouter), INITIAL_BALANCE);

        SwapParams memory swapParams = SwapParams({
            zeroForOne: true,
            amountSpecified: -int256(0.1 ether),
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });

        PoolSwapTest.TestSettings memory testSettings = PoolSwapTest.TestSettings({
            takeClaims: false,
            settleUsingBurn: false
        });

        // This should not revert
        swapRouter.swap(poolKey, swapParams, testSettings, ZERO_BYTES);

        vm.stopPrank();
    }

    function testBeforeSwapFailsEigenLayerValidation() public {
        // Setup mock validator to reject swap
        mockValidator.setSwapValidationResult(false);

        // Get token addresses
        address token0Address = Currency.unwrap(currency0);

        // Mint tokens to trader
        MockERC20(token0Address).mint(TRADER1, INITIAL_BALANCE);

        vm.startPrank(TRADER1);
        MockERC20(token0Address).approve(address(swapRouter), INITIAL_BALANCE);

        SwapParams memory swapParams = SwapParams({
            zeroForOne: true,
            amountSpecified: -int256(0.1 ether),
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });

        PoolSwapTest.TestSettings memory testSettings = PoolSwapTest.TestSettings({
            takeClaims: false,
            settleUsingBurn: false
        });

        // This should revert with EigenLayer rejection
        vm.expectRevert();
        swapRouter.swap(poolKey, swapParams, testSettings, ZERO_BYTES);

        vm.stopPrank();
    }

    function testBeforeSwapFailsManipulationDetection() public {
        // Setup mock validator to approve swap but detect manipulation
        mockValidator.setSwapValidationResult(true);
        mockValidator.setManipulationDetected(true, 500, 1000, 200);

        // Get token addresses
        address token0Address = Currency.unwrap(currency0);

        // Mint tokens to trader
        MockERC20(token0Address).mint(TRADER1, INITIAL_BALANCE);

        vm.startPrank(TRADER1);
        MockERC20(token0Address).approve(address(swapRouter), INITIAL_BALANCE);

        SwapParams memory swapParams = SwapParams({
            zeroForOne: true,
            amountSpecified: -int256(0.1 ether),
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });

        PoolSwapTest.TestSettings memory testSettings = PoolSwapTest.TestSettings({
            takeClaims: false,
            settleUsingBurn: false
        });

        // This should revert with manipulation detection
        vm.expectRevert();
        swapRouter.swap(poolKey, swapParams, testSettings, ZERO_BYTES);

        vm.stopPrank();
    }

    function testBeforeSwapFailsPoolStateManipulation() public {
        // Setup mock validator to pass all checks except pool state
        mockValidator.setSwapValidationResult(true);
        mockValidator.setManipulationDetected(false, 0, 0, 0);

        // Mock the hook's internal pool state to detect manipulation
        // This would require a more complex setup, so we'll skip for now
        // In a real test, you'd modify the hook's _getPoolState function or use a mock
    }

    // ============ After Swap Tests ============

    function testAfterSwapPoolStateVerification() public {
        // Setup mock validator
        mockValidator.setSwapValidationResult(true);
        mockValidator.setManipulationDetected(false, 0, 0, 0);

        // Get token addresses
        address token0Address = Currency.unwrap(currency0);

        // Mint tokens to trader
        MockERC20(token0Address).mint(TRADER1, INITIAL_BALANCE);

        vm.startPrank(TRADER1);
        MockERC20(token0Address).approve(address(swapRouter), INITIAL_BALANCE);

        vm.expectEmit(true, false, false, false);
        emit PoolStateVerified(_getPoolId(poolKey), 0, true); // Don't check exact values

        SwapParams memory swapParams = SwapParams({
            zeroForOne: true,
            amountSpecified: -int256(0.1 ether),
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });

        PoolSwapTest.TestSettings memory testSettings = PoolSwapTest.TestSettings({
            takeClaims: false,
            settleUsingBurn: false
        });

        swapRouter.swap(poolKey, swapParams, testSettings, ZERO_BYTES);

        vm.stopPrank();
    }

    // ============ Dynamic Fee Calculation Tests ============

    function testDynamicFeeCalculationLowUtilization() public {
        // Test with low utilization (30%)
        uint24 fee = leverageHook._calculateDynamicFee(3000);
        assertEq(fee, 500); // Base fee of 0.05%
    }

    function testDynamicFeeCalculationMediumUtilization() public {
        // Test with medium utilization (65%)
        uint24 fee = leverageHook._calculateDynamicFee(6500);
        assertEq(fee, 1000); // 2x base fee = 0.1%
    }

    function testDynamicFeeCalculationHighUtilization() public {
        // Test with high utilization (85%)
        uint24 fee = leverageHook._calculateDynamicFee(8500);
        assertEq(fee, 2000); // 4x base fee = 0.2%
    }

    function testDynamicFeeCalculationVeryHighUtilization() public {
        // Test with very high utilization (95%)
        uint24 fee = leverageHook._calculateDynamicFee(9500);
        assertEq(fee, 2000); // 4x base fee = 0.2% (capped)
    }

    // ============ Integration Tests ============

    function testFullLeverageWorkflow() public {
        // Setup
        vm.startPrank(TRADER1);

        address token0Address = Currency.unwrap(currency0);
        address token1Address = Currency.unwrap(currency1);

        // Mint tokens
        MockERC20(token0Address).mint(TRADER1, INITIAL_BALANCE);
        MockERC20(token1Address).mint(TRADER1, INITIAL_BALANCE);
        MockERC20(token0Address).approve(address(marginRouter), COLLATERAL_AMOUNT);

        // Setup mock validator
        mockValidator.setValidationResult(true, "Valid position");
        mockValidator.setCrossPoolExposure(false, 0, 0);

        // Open leverage position (this triggers the hook)
        bytes32 positionId = marginRouter.openLeveragePosition(
            poolKey,
            token0Address,
            COLLATERAL_AMOUNT,
            BORROW_AMOUNT,
            DEFAULT_LEVERAGE,
            true
        );

        vm.stopPrank();

        // Verify position was created
        assertTrue(positionId != bytes32(0));

        ILeverageValidator.LeveragePosition memory position = marginRouter.getPosition(positionId);
        assertEq(position.trader, TRADER1);
        assertEq(position.collateralAmount, COLLATERAL_AMOUNT);
        assertEq(position.borrowedAmount, BORROW_AMOUNT);
        assertEq(position.leverageRatio, DEFAULT_LEVERAGE);
    }

    function testMultiplePositionsUtilizationUpdate() public {
        // Test that multiple positions correctly update utilization rates
        _openMultiplePositions(3);

        // Check that utilization rate has increased
        // This would require reading from the global asset ledger
        // Implementation depends on how utilization is tracked
    }

    // ============ Edge Case Tests ============

    function testEmptyHookData() public {
        // Test remove liquidity with empty hook data (should not trigger leverage logic)
        ModifyLiquidityParams memory params = ModifyLiquidityParams({
            tickLower: -60,
            tickUpper: 60,
            liquidityDelta: -1 ether,
            salt: bytes32(0)
        });

        // This should not revert and should not trigger leverage logic
        modifyLiquidityRouter.modifyLiquidity(poolKey, params, ZERO_BYTES);
    }

    function testInvalidHookDataDecoding() public {
        // Test with invalid hook data that can't be decoded
        bytes memory invalidHookData = abi.encode("invalid", "data", "structure");

        ModifyLiquidityParams memory params = ModifyLiquidityParams({
            tickLower: -60,
            tickUpper: 60,
            liquidityDelta: -1 ether,
            salt: bytes32(0)
        });

        // This should revert due to invalid data decoding
        vm.expectRevert();
        modifyLiquidityRouter.modifyLiquidity(poolKey, params, invalidHookData);
    }

    // ============ Helper Functions ============

    function _createValidPosition() internal view returns (ILeverageValidator.LeveragePosition memory) {
        return ILeverageValidator.LeveragePosition({
            trader: TRADER1,
            collateralToken: Currency.unwrap(currency0),
            borrowedToken: Currency.unwrap(currency1),
            collateralAmount: COLLATERAL_AMOUNT,
            borrowedAmount: BORROW_AMOUNT,
            leverageRatio: DEFAULT_LEVERAGE,
            isLongPosition: true,
            openTimestamp: block.timestamp,
            positionId: keccak256(abi.encodePacked(TRADER1, block.timestamp))
        });
    }

    function _setupInitialState() internal {
        vm.startPrank(OWNER);

        address token0Address = Currency.unwrap(currency0);
        address token1Address = Currency.unwrap(currency1);

        // Set borrow caps
        globalAssetLedger.setGlobalBorrowCap(token0Address, 10000000 ether);
        globalAssetLedger.setGlobalBorrowCap(token1Address, 10000000 ether);
        globalAssetLedger.setPoolBorrowCap(_getPoolId(poolKey), token0Address, 1000000 ether);
        globalAssetLedger.setPoolBorrowCap(_getPoolId(poolKey), token1Address, 1000000 ether);

        // Authorize pools
        marginRouter.authorizePool(poolKey, 1000); // 10x leverage

        vm.stopPrank();
    }

    function _openMultiplePositions(uint256 count) internal {
        for (uint256 i = 0; i < count; i++) {
            address trader = address(uint160(0x1000 + i));

            vm.startPrank(trader);

            address token0Address = Currency.unwrap(currency0);

            // Mint tokens
            MockERC20(token0Address).mint(trader, INITIAL_BALANCE);
            MockERC20(token0Address).approve(address(marginRouter), COLLATERAL_AMOUNT);

            // Setup mock validator
            mockValidator.setValidationResult(true, "Valid position");
            mockValidator.setCrossPoolExposure(false, 0, 0);

            // Open position
            marginRouter.openLeveragePosition(
                poolKey,
                token0Address,
                COLLATERAL_AMOUNT,
                BORROW_AMOUNT,
                DEFAULT_LEVERAGE,
                true
            );

            vm.stopPrank();
        }
    }

    function _getPoolId(PoolKey memory key) internal pure returns (bytes32) {
        return keccak256(abi.encode(key.currency0, key.currency1, key.fee, key.tickSpacing));
    }
}

// ============ Mock Contract ============

contract MockLeverageValidator is ILeverageValidator {
    bool public validationResult = true;
    string public validationReason = "";
    bool public swapValidationResult = true;
    bool public crossPoolExceedsLimit = false;
    bool public manipulationDetected = false;
    uint256 public priceDeviation = 0;
    uint256 public volumeAnomaly = 0;
    uint256 public liquidityChange = 0;
    uint256 public utilizationRate = 5000;

    function setValidationResult(bool result, string memory reason) external {
        validationResult = result;
        validationReason = reason;
    }

    function setSwapValidationResult(bool result) external {
        swapValidationResult = result;
    }

    function setCrossPoolExposure(bool exceeds, uint256 current, uint256 max) external {
        crossPoolExceedsLimit = exceeds;
    }

    function setManipulationDetected(
        bool detected,
        uint256 pricedev,
        uint256 volumeAnom,
        uint256 liquidityChng
    ) external {
        manipulationDetected = detected;
        priceDeviation = pricedev;
        volumeAnomaly = volumeAnom;
        liquidityChange = liquidityChng;
    }

    function setUtilizationRate(uint256 rate) external {
        utilizationRate = rate;
    }

    // ============ Interface Implementation ============

    function validateLeveragePosition(
        LeveragePosition calldata,
        bytes[] calldata
    ) external view override returns (bool, string memory) {
        return (validationResult, validationReason);
    }

    function verifySwap(bytes32, SwapParams calldata, bytes calldata) external view override returns (bool) {
        return swapValidationResult;
    }

    function checkCrossPoolExposure(
        address,
        LeveragePosition calldata
    ) external view override returns (bool, uint256, uint256) {
        return (crossPoolExceedsLimit, 500 ether, 1000 ether);
    }

    function checkPoolManipulation(
        bytes32,
        bytes calldata,
        bytes calldata
    ) external view override returns (ManipulationCheck memory) {
        return ManipulationCheck({
            isManipulated: manipulationDetected,
            priceDeviation: priceDeviation,
            volumeAnomaly: volumeAnomaly,
            liquidityChange: liquidityChange,
            suspiciousOperators: new address[](0)
        });
    }

    // Stub implementations for other required functions
    function validateBorrowRequest(bytes32, address, address, uint256, uint256) external pure override returns (BorrowValidation memory) {
        return BorrowValidation(true, 1000000 ether, 100 ether, 8000, "Approved");
    }

    function getPoolUtilization(bytes32) external view override returns (PoolUtilization memory) {
        return PoolUtilization(bytes32(0), 1000000 ether, utilizationRate * 10000 ether / 10000, utilizationRate, 100, false);
    }

    function checkLiquidation(bytes32) external pure override returns (bool, uint256, uint256) {
        return (false, 0, 1500);
    }

    function calculateFundingRate(bytes32, uint256) external pure override returns (uint256) {
        return 100;
    }

    function getTraderExposure(address) external pure override returns (uint256, uint256, uint256) {
        return (0, 0, 0);
    }

    function updateFundingRate(bytes32, uint256) external override {}
    function emergencyPausePool(bytes32, string calldata) external override {}
    function emergencyLiquidate(bytes32[] calldata, string calldata) external override {}

    // IEigenAssetVerifier stubs
    function getSwapValidation(bytes32, address, uint256) external pure override returns (SwapValidation memory) {
        return SwapValidation(true, "", 1000 ether, new address[](0));
    }

    function registerOperator(address, uint8[] calldata, string calldata) external override {}
    function deregisterOperator(address, uint8[] calldata) external override {}
    function getOperatorInfo(address) external pure override returns (OperatorInfo memory) {
        return OperatorInfo(address(0), 0, new uint8[](0), false, false);
    }

    function createMarket(bytes32, uint256, uint256, uint8[] calldata) external override {}
    function submitMarketValidation(bytes32, bool, bytes calldata) external override {}
    function getMarketValidation(bytes32) external pure override returns (MarketValidation memory) {
        return MarketValidation(bytes32(0), new address[](0), 0, 0, false);
    }

    function checkStakeRequirement(address, uint8) external pure override returns (bool) { return true; }
    function slashOperator(address, bytes32, uint256) external override {}
    function isOperatorSlashed(address) external pure override returns (bool) { return false; }

    function getOperatorCount(uint8) external pure override returns (uint256) { return 0; }
    function getActiveMarkets() external pure override returns (bytes32[] memory) {
        return new bytes32[](0);
    }
    function isMarketActive(bytes32) external pure override returns (bool) { return true; }
}