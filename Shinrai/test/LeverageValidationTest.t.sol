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
import {PoolManager} from "v4-core/PoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {SwapParams} from "v4-core/types/PoolOperation.sol";
import {ModifyLiquidityParams} from "v4-core/types/PoolOperation.sol";
import {Currency, CurrencyLibrary} from "v4-core/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "v4-core/types/PoolId.sol";
import {LPFeeLibrary} from "v4-core/libraries/LPFeeLibrary.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";
import {TickMath} from "v4-core/libraries/TickMath.sol";
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";

/**
 * @title LeverageValidationTest
 * @notice Comprehensive test suite for leverage validation flow
 */
contract LeverageValidationTest is Test, Deployers {

    // ============ Test Contracts ============
    LeverageHook public leverageHook;
    MarginRouter public marginRouter;
    GlobalAssetLedger public globalAssetLedger;
    MockLeverageValidator public mockValidator;

    // ============ Mock Tokens ============
    MockERC20 public token0;
    MockERC20 public token1;

    // ============ Test Users ============
    address public constant TRADER1 = address(0x1);
    address public constant TRADER2 = address(0x2);
    address public constant LP1 = address(0x3);
    address public constant OPERATOR1 = address(0x4);
    address public constant OWNER = address(0x5);

    // ============ Test Constants ============
    uint256 public constant INITIAL_BALANCE = 1000000 ether;
    uint256 public constant DEFAULT_LEVERAGE = 300; // 3x
    uint256 public constant HIGH_LEVERAGE = 1000; // 10x
    uint256 public constant COLLATERAL_AMOUNT = 100 ether;
    uint256 public constant BORROW_AMOUNT = 300 ether;

    // ============ Pool Keys ============
    PoolKey public poolKey;

    // ============ Events ============
    event LeveragePositionOpened(
        bytes32 indexed positionId,
        address indexed trader,
        bytes32 indexed poolId,
        uint256 collateral,
        uint256 borrowed,
        uint256 leverage
    );

    event BorrowAuthorized(
        bytes32 indexed poolId,
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 collateral
    );

    event FundingRateUpdated(
        bytes32 indexed poolId,
        uint256 oldRate,
        uint256 newRate,
        uint256 utilization
    );

    // ============ Setup ============
    function setUp() public {
        // Deploy v4-core using Deployers utility
        deployFreshManagerAndRouters();

        // Deploy mock tokens and approve
        deployMintAndApprove2Currencies();

        // Deploy mock validator
        mockValidator = new MockLeverageValidator();

        // Deploy our hook with the proper flags
        uint160 flags = uint160(
            Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG |
            Hooks.AFTER_REMOVE_LIQUIDITY_FLAG |
            Hooks.BEFORE_SWAP_FLAG |
            Hooks.AFTER_SWAP_FLAG
        );
        deployCodeTo("LeverageHook.sol", abi.encode(manager, address(mockValidator)), address(flags));

        // Deploy our hook
        leverageHook = LeverageHook(address(flags));

        // Deploy other contracts
        vm.startPrank(OWNER);

        globalAssetLedger = new GlobalAssetLedger(
            address(mockValidator),
            OWNER
        );

        marginRouter = new MarginRouter(
            address(manager),
            address(mockValidator),
            OWNER
        );

        // Connect contracts
        globalAssetLedger.setAuthorizedRouter(address(marginRouter), true);

        vm.stopPrank();

        // Initialize pool with dynamic fees and our hook
        (key, ) = initPool(
            currency0,
            currency1,
            leverageHook,
            LPFeeLibrary.DYNAMIC_FEE_FLAG,
            SQRT_PRICE_1_1
        );

        // Store the pool key for tests
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

        // Setup initial state
        _setupInitialState();
    }

    // ============ Leverage Position Tests ============

    function testOpenLeveragePositionSuccess() public {
        vm.startPrank(TRADER1);

        // Get token addresses from currencies
        address token0Address = Currency.unwrap(currency0);
        address token1Address = Currency.unwrap(currency1);

        // Mint tokens to trader
        MockERC20(token0Address).mint(TRADER1, INITIAL_BALANCE);
        MockERC20(token1Address).mint(TRADER1, INITIAL_BALANCE);

        // Approve tokens
        MockERC20(token0Address).approve(address(marginRouter), COLLATERAL_AMOUNT);

        // Expect events (don't check positionId since it's generated)
        vm.expectEmit(false, true, true, true);
        emit LeveragePositionOpened(
            bytes32(0), // positionId will be generated - not checked
            TRADER1,
            _getPoolId(poolKey),
            COLLATERAL_AMOUNT,
            BORROW_AMOUNT,
            DEFAULT_LEVERAGE
        );

        // Open position
        bytes32 positionId = marginRouter.openLeveragePosition(
            poolKey,
            token0Address,
            COLLATERAL_AMOUNT,
            BORROW_AMOUNT,
            DEFAULT_LEVERAGE,
            true // long position
        );

        vm.stopPrank();

        // Verify position was created
        assertTrue(positionId != bytes32(0));

        ILeverageValidator.LeveragePosition memory position = marginRouter.getPosition(positionId);
        assertEq(position.trader, TRADER1);
        assertEq(position.collateralAmount, COLLATERAL_AMOUNT);
        assertEq(position.borrowedAmount, BORROW_AMOUNT);
        assertEq(position.leverageRatio, DEFAULT_LEVERAGE);
        assertTrue(position.isLongPosition);

        // Verify trader positions
        bytes32[] memory traderPositions = marginRouter.getTraderPositions(TRADER1);
        assertEq(traderPositions.length, 1);
        assertEq(traderPositions[0], positionId);
    }

    function testOpenLeveragePositionExceedsLeverage() public {
        vm.startPrank(TRADER1);

        // Get token addresses
        address token0Address = Currency.unwrap(currency0);

        // Mint and approve tokens
        MockERC20(token0Address).mint(TRADER1, INITIAL_BALANCE);
        MockERC20(token0Address).approve(address(marginRouter), COLLATERAL_AMOUNT);

        // Try to open position with excessive leverage
        vm.expectRevert("MarginRouter: Exceeds global cap");
        marginRouter.openLeveragePosition(
            poolKey,
            token0Address,
            COLLATERAL_AMOUNT,
            BORROW_AMOUNT,
            5001, // > maxGlobalLeverage (1000)
            true
        );

        vm.stopPrank();
    }

    function testOpenLeveragePositionInvalidPool() public {
        vm.startPrank(TRADER1);

        // Get token addresses
        address token0Address = Currency.unwrap(currency0);

        // Mint and approve tokens
        MockERC20(token0Address).mint(TRADER1, INITIAL_BALANCE);
        MockERC20(token0Address).approve(address(marginRouter), COLLATERAL_AMOUNT);

        // Create unauthorized pool key
        PoolKey memory unauthorizedPool = PoolKey({
            currency0: currency0,
            currency1: currency1,
            fee: 10000, // Different fee makes it unauthorized
            tickSpacing: 200,
            hooks: leverageHook
        });

        // Try to open position in unauthorized pool
        vm.expectRevert("MarginRouter: Exceeds pool cap");
        marginRouter.openLeveragePosition(
            unauthorizedPool, // Not authorized
            token0Address,
            COLLATERAL_AMOUNT,
            BORROW_AMOUNT,
            DEFAULT_LEVERAGE,
            true
        );

        vm.stopPrank();
    }

    function testOpenLeveragePositionInsufficientCollateral() public {
        vm.startPrank(TRADER1);

        // Get token addresses
        address token0Address = Currency.unwrap(currency0);

        // Mint and approve tokens
        MockERC20(token0Address).mint(TRADER1, INITIAL_BALANCE);
        MockERC20(token0Address).approve(address(marginRouter), COLLATERAL_AMOUNT);

        vm.expectRevert("MarginRouter: Invalid collateral");
        marginRouter.openLeveragePosition(
            poolKey,
            token0Address,
            0, // No collateral
            BORROW_AMOUNT,
            DEFAULT_LEVERAGE,
            true
        );

        vm.stopPrank();
    }

    // ============ Borrow Authorization Tests ============

    function testBorrowAuthorizationSuccess() public {
        vm.startPrank(address(marginRouter));

        // Setup mock validator to approve
        mockValidator.setValidationResult(true, "");

        // Get token addresses
        address token0Address = Currency.unwrap(currency0);
        address token1Address = Currency.unwrap(currency1);

        // Note: Using the struct from GlobalAssetLedger since it defines BorrowAuthorization
        GlobalAssetLedger.BorrowAuthorization memory auth = globalAssetLedger.authorizeBorrow(
            _getPoolId(poolKey),
            TRADER1,
            token1Address,
            BORROW_AMOUNT,
            token0Address,
            COLLATERAL_AMOUNT
        );

        vm.stopPrank();

        assertTrue(auth.authorized);
        assertEq(auth.maxAmount, BORROW_AMOUNT);
        assertEq(keccak256(bytes(auth.reason)), keccak256(bytes("Authorized")));
    }

    function testBorrowAuthorizationExceedsGlobalCap() public {
        vm.startPrank(OWNER);

        // Get token addresses
        address token1Address = Currency.unwrap(currency1);

        // Set very low global cap
        globalAssetLedger.setGlobalBorrowCap(token1Address, 1 ether);

        vm.stopPrank();

        vm.startPrank(address(marginRouter));

        // Get token addresses
        address token0Address = Currency.unwrap(currency0);

        GlobalAssetLedger.BorrowAuthorization memory auth = globalAssetLedger.authorizeBorrow(
            _getPoolId(poolKey),
            TRADER1,
            token1Address,
            BORROW_AMOUNT, // Much higher than cap
            token0Address,
            COLLATERAL_AMOUNT
        );

        vm.stopPrank();

        assertFalse(auth.authorized);
        assertEq(keccak256(bytes(auth.reason)), keccak256(bytes("Exceeds global borrow cap")));
    }

    function testBorrowAuthorizationExceedsPoolCap() public {
        vm.startPrank(OWNER);

        // Get token addresses
        address token1Address = Currency.unwrap(currency1);

        // Set pool cap lower than borrow amount
        globalAssetLedger.setPoolBorrowCap(_getPoolId(poolKey), token1Address, 1 ether);

        vm.stopPrank();

        vm.startPrank(address(marginRouter));

        // Get token addresses
        address token0Address = Currency.unwrap(currency0);

        GlobalAssetLedger.BorrowAuthorization memory auth = globalAssetLedger.authorizeBorrow(
            _getPoolId(poolKey),
            TRADER1,
            token1Address,
            BORROW_AMOUNT,
            token0Address,
            COLLATERAL_AMOUNT
        );

        vm.stopPrank();

        assertFalse(auth.authorized);
        assertEq(keccak256(bytes(auth.reason)), keccak256(bytes("Exceeds pool borrow cap")));
    }

    function testBorrowAuthorizationEigenLayerReject() public {
        vm.startPrank(address(marginRouter));

        // Setup mock validator to reject
        mockValidator.setValidationResult(false, "Insufficient operator consensus");

        // Get token addresses
        address token0Address = Currency.unwrap(currency0);
        address token1Address = Currency.unwrap(currency1);

        GlobalAssetLedger.BorrowAuthorization memory auth = globalAssetLedger.authorizeBorrow(
            _getPoolId(poolKey),
            TRADER1,
            token1Address,
            BORROW_AMOUNT,
            token0Address,
            COLLATERAL_AMOUNT
        );

        vm.stopPrank();

        assertFalse(auth.authorized);
        assertEq(keccak256(bytes(auth.reason)), keccak256(bytes("Insufficient operator consensus")));
    }

    // ============ Hook Validation Tests ============

    // function testHookBeforeSwapValidation() public {
    //     // Setup mock validator to approve
    //     mockValidator.setSwapValidationResult(true);

    //     // Get token addresses
    //     address token0Address = Currency.unwrap(currency0);
    //     address token1Address = Currency.unwrap(currency1);

    //     // Mint tokens to test user
    //     MockERC20(token0Address).mint(TRADER1, INITIAL_BALANCE);
    //     MockERC20(token0Address).approve(address(swapRouter), INITIAL_BALANCE);

    //     vm.startPrank(TRADER1);

    //     // Should not revert with valid swap through pool manager
    //     SwapParams memory swapParams = SwapParams({
    //         zeroForOne: true,
    //         amountSpecified: -int256(0.001 ether),
    //         sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
    //     });

    //     PoolSwapTest.TestSettings memory testSettings = PoolSwapTest.TestSettings({
    //         takeClaims: false,
    //         settleUsingBurn: false
    //     });

    //     swapRouter.swap(poolKey, swapParams, testSettings, ZERO_BYTES);

    //     vm.stopPrank();
    // }

    // function testHookBeforeSwapValidationFail() public {
    //     // Setup mock validator to reject
    //     mockValidator.setSwapValidationResult(false);

    //     // Get token addresses
    //     address token0Address = Currency.unwrap(currency0);

    //     // Mint tokens to test user
    //     MockERC20(token0Address).mint(TRADER1, INITIAL_BALANCE);
    //     MockERC20(token0Address).approve(address(swapRouter), INITIAL_BALANCE);

    //     vm.startPrank(TRADER1);

    //     // Should revert with invalid swap through pool manager
    //     SwapParams memory swapParams = SwapParams({
    //         zeroForOne: true,
    //         amountSpecified: -0.001 ether, // Small swap amount to avoid underflow
    //         sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
    //     });

    //     PoolSwapTest.TestSettings memory testSettings = PoolSwapTest.TestSettings({
    //         takeClaims: false,
    //         settleUsingBurn: false
    //     });

    //     vm.expectRevert(); // Just expect any revert since error is wrapped
    //     swapRouter.swap(poolKey, swapParams, testSettings, ZERO_BYTES);

    //     vm.stopPrank();
    // }

    // function testHookRemoveLiquidityForLeverage() public {
    //     // Setup mock validator
    //     mockValidator.setSwapValidationResult(true);

    //     // Get token addresses
    //     address token0Address = Currency.unwrap(currency0);
    //     address token1Address = Currency.unwrap(currency1);

    //     // Create leverage request
    //     ILeverageValidator.LeveragePosition memory leverageReq = ILeverageValidator.LeveragePosition({
    //         trader: TRADER1,
    //         collateralToken: token0Address,
    //         borrowedToken: token1Address,
    //         collateralAmount: COLLATERAL_AMOUNT,
    //         borrowedAmount: BORROW_AMOUNT,
    //         leverageRatio: DEFAULT_LEVERAGE,
    //         isLongPosition: true,
    //         openTimestamp: block.timestamp,
    //         positionId: keccak256(abi.encodePacked(TRADER1, block.timestamp))
    //     });

    //     bytes memory hookData = abi.encode(leverageReq);

    //     ModifyLiquidityParams memory params = ModifyLiquidityParams({
    //         tickLower: -60,
    //         tickUpper: 60,
    //         liquidityDelta: -1 ether, // Remove small amount of liquidity
    //         salt: bytes32(0)
    //     });

    //     // Test through the pool manager using modifyLiquidityRouter
    //     // Use small amount to avoid underflow
    //     ModifyLiquidityParams memory smallParams = ModifyLiquidityParams({
    //         tickLower: -60,
    //         tickUpper: 60,
    //         liquidityDelta: -1000, // Very small amount
    //         salt: bytes32(0)
    //     });

    //     modifyLiquidityRouter.modifyLiquidity(poolKey, smallParams, hookData);
    // }

    // ============ Cross-Pool Exposure Tests ============

    function testCrossPoolExposureValidation() public {
        // Open first position
        vm.startPrank(TRADER1);

        // Get token addresses
        address token0Address = Currency.unwrap(currency0);

        // Mint and approve tokens
        MockERC20(token0Address).mint(TRADER1, INITIAL_BALANCE);
        MockERC20(token0Address).approve(address(marginRouter), COLLATERAL_AMOUNT * 2);

        bytes32 position1 = marginRouter.openLeveragePosition(
            poolKey,
            token0Address,
            COLLATERAL_AMOUNT,
            BORROW_AMOUNT,
            DEFAULT_LEVERAGE,
            true
        );

        // Try to open second position that would exceed exposure
        mockValidator.setCrossPoolExposure(true, 0, 0); // Exceeds limit

        vm.expectRevert("MarginRouter: Exceeds cross-pool exposure");
        marginRouter.openLeveragePosition(
            poolKey,
            token0Address,
            COLLATERAL_AMOUNT,
            BORROW_AMOUNT,
            DEFAULT_LEVERAGE,
            false
        );

        vm.stopPrank();
    }

    // ============ Liquidation Tests ============

    function testPositionLiquidation() public {
        // Open position
        vm.startPrank(TRADER1);

        // Get token addresses
        address token0Address = Currency.unwrap(currency0);

        // Mint and approve tokens
        MockERC20(token0Address).mint(TRADER1, INITIAL_BALANCE);
        MockERC20(token0Address).approve(address(marginRouter), COLLATERAL_AMOUNT);

        bytes32 positionId = marginRouter.openLeveragePosition(
            poolKey,
            token0Address,
            COLLATERAL_AMOUNT,
            BORROW_AMOUNT,
            DEFAULT_LEVERAGE,
            true
        );

        vm.stopPrank();

        // Simulate position becoming unhealthy
        mockValidator.setLiquidationStatus(true, 50 ether, 800); // Should liquidate

        // Check position health
        (bool isHealthy, uint256 healthFactor) = marginRouter.checkPositionHealth(positionId);
        assertFalse(isHealthy);
        assertEq(healthFactor, 800);

        // Close position (should trigger liquidation)
        vm.startPrank(TRADER1);

        int256 pnl = marginRouter.closeLeveragePosition(positionId, poolKey);

        vm.stopPrank();

        // Verify position was closed
        ILeverageValidator.LeveragePosition memory position = marginRouter.getPosition(positionId);
        assertEq(position.trader, address(0)); // Position should be deleted
    }

    // ============ Funding Rate Tests ============

    function testFundingRateUpdate() public {
        bytes32 poolId = _getPoolId(poolKey);

        // Mock high utilization
        mockValidator.setUtilizationRate(9000); // 90%
        mockValidator.setFundingRate(200); // 2%

        vm.expectEmit(true, false, false, false);
        emit FundingRateUpdated(poolId, 0, 0, 0); // Don't check values, just event emission

        globalAssetLedger.updateFundingRate(poolId);

        uint256 fundingRate = globalAssetLedger.poolFundingRates(poolId);
        assertEq(fundingRate, 200);
    }

    // ============ Emergency Functions Tests ============

    function testEmergencyPause() public {
        vm.startPrank(OWNER);

        marginRouter.setEmergencyPause(true);

        vm.stopPrank();

        assertTrue(marginRouter.emergencyPaused());

        // Should revert when paused
        vm.startPrank(TRADER1);

        // Get token addresses
        address token0Address = Currency.unwrap(currency0);

        // Mint and approve tokens
        MockERC20(token0Address).mint(TRADER1, INITIAL_BALANCE);
        MockERC20(token0Address).approve(address(marginRouter), COLLATERAL_AMOUNT);

        vm.expectRevert("MarginRouter: Emergency paused");
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

    // ============ Helper Functions ============


    function _setupInitialState() internal {
        vm.startPrank(OWNER);

        // Get token addresses
        address token0Address = Currency.unwrap(currency0);
        address token1Address = Currency.unwrap(currency1);

        // Set global borrow caps
        globalAssetLedger.setGlobalBorrowCap(token0Address, 10000000 ether);
        globalAssetLedger.setGlobalBorrowCap(token1Address, 10000000 ether);

        // Set pool borrow caps
        globalAssetLedger.setPoolBorrowCap(_getPoolId(poolKey), token0Address, 1000000 ether);
        globalAssetLedger.setPoolBorrowCap(_getPoolId(poolKey), token1Address, 1000000 ether);

        // Authorize pools
        marginRouter.authorizePool(poolKey, HIGH_LEVERAGE);

        vm.stopPrank();
    }

    function _getPoolId(PoolKey memory key) internal pure returns (bytes32) {
        return keccak256(abi.encode(key.currency0, key.currency1, key.fee, key.tickSpacing));
    }
}

// ============ Mock Interfaces ============
// Simplified - removed unused EigenLayer interfaces

// ============ Mock Contracts ============

contract MockLeverageValidator is ILeverageValidator {
    bool public validationResult = true;
    string public validationReason = "";
    bool public swapValidationResult = true;
    bool public crossPoolExceedsLimit = false;
    bool public shouldLiquidate = false;
    uint256 public liquidationPrice = 0;
    uint256 public healthFactor = 1500;
    uint256 public utilizationRate = 5000;
    uint256 public fundingRate = 100;

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

    function setLiquidationStatus(bool liquidate, uint256 price, uint256 health) external {
        shouldLiquidate = liquidate;
        liquidationPrice = price;
        healthFactor = health;
    }

    function setUtilizationRate(uint256 rate) external {
        utilizationRate = rate;
    }

    function setFundingRate(uint256 rate) external {
        fundingRate = rate;
    }

    // Implement required interface functions
    function validateLeveragePosition(
        LeveragePosition calldata,
        bytes[] calldata
    ) external view override returns (bool, string memory) {
        return (validationResult, validationReason);
    }

    function validateBorrowRequest(
        bytes32,
        address,
        address,
        uint256,
        uint256
    ) external view override returns (BorrowValidation memory) {
        return BorrowValidation({
            canBorrow: validationResult,
            maxBorrowAmount: 1000000 ether,
            requiredCollateral: 100 ether,
            liquidationThreshold: 8000,
            reason: validationReason
        });
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

    function checkLiquidation(bytes32) external view override returns (bool, uint256, uint256) {
        return (shouldLiquidate, liquidationPrice, healthFactor);
    }

    function calculateFundingRate(bytes32, uint256) external view override returns (uint256) {
        return fundingRate;
    }

    function getPoolUtilization(bytes32) external view override returns (PoolUtilization memory) {
        return PoolUtilization({
            poolId: bytes32(0),
            totalLiquidity: 1000000 ether,
            borrowedAmount: utilizationRate * 10000 ether / 10000,
            utilizationRate: utilizationRate,
            fundingRate: fundingRate,
            isAtCapacity: false
        });
    }

    // Stub implementations for other required functions
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

    function checkPoolManipulation(bytes32, bytes calldata, bytes calldata) external pure override returns (ManipulationCheck memory) {
        return ManipulationCheck(false, 0, 0, 0, new address[](0));
    }
    function getTraderExposure(address) external pure override returns (uint256, uint256, uint256) {
        return (0, 0, 0);
    }
    function updateFundingRate(bytes32, uint256) external override {}
    function emergencyPausePool(bytes32, string calldata) external override {}
    function emergencyLiquidate(bytes32[] calldata, string calldata) external override {}
}

