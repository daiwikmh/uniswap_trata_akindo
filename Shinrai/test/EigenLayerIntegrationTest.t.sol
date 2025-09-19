// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {Deployers} from "@uniswap/v4-core/test/utils/Deployers.sol";
import {LeverageHook} from "../src/LeverageHook.sol";
import {MarginRouter} from "../src/MarginRouter.sol";
import {GlobalAssetLedger} from "../src/GlobalAssetLedger.sol";
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
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";

/**
 * @title EigenLayerIntegrationTest
 * @notice Tests for EigenLayer operator validation and consensus mechanisms
 */
contract EigenLayerIntegrationTest is Test, Deployers {

    // ============ Test Contracts ============
    LeverageHook public leverageHook;
    MarginRouter public marginRouter;
    GlobalAssetLedger public globalAssetLedger;
    MockEigenLayerValidator public mockValidator;

    // ============ Test Users ============
    address public constant TRADER1 = address(0x1);
    address public constant TRADER2 = address(0x2);
    address public constant OPERATOR1 = address(0x4);
    address public constant OPERATOR2 = address(0x5);
    address public constant OPERATOR3 = address(0x6);
    address public constant OWNER = address(0x7);

    // ============ Test Constants ============
    uint256 public constant INITIAL_BALANCE = 1000000 ether;
    uint256 public constant COLLATERAL_AMOUNT = 100 ether;
    uint256 public constant BORROW_AMOUNT = 300 ether;
    uint256 public constant DEFAULT_LEVERAGE = 300; // 3x

    // ============ Pool Keys ============
    PoolKey public poolKey;

    // ============ Events ============
    event OperatorRegistered(address indexed operator, uint8[] quorums, uint256 stake);
    event OperatorSlashed(address indexed operator, bytes32 indexed marketId, uint256 slashedAmount);
    event LeveragePositionValidated(
        bytes32 indexed positionId,
        address indexed trader,
        bool approved,
        string reason
    );
    event PoolManipulationDetected(
        bytes32 indexed poolId,
        uint256 priceDeviation,
        address[] operators
    );

    // ============ Setup ============
    function setUp() public {
        // Deploy v4-core using Deployers utility
        deployFreshManagerAndRouters();
        deployMintAndApprove2Currencies();

        // Deploy mock validator with enhanced EigenLayer features
        mockValidator = new MockEigenLayerValidator();

        // Deploy hook with proper flags
        uint160 flags = uint160(
            Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG |
            Hooks.AFTER_REMOVE_LIQUIDITY_FLAG |
            Hooks.BEFORE_SWAP_FLAG |
            Hooks.AFTER_SWAP_FLAG
        );

        vm.startPrank(OWNER);

        // Deploy global asset ledger
        globalAssetLedger = new GlobalAssetLedger(
            address(mockValidator),
            OWNER
        );

        // Deploy leverageHook with proper constructor
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

        // Initialize pool
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

    // ============ Operator Registration Tests ============

    function testOperatorRegistration() public {
        uint8[] memory quorums = new uint8[](2);
        quorums[0] = 0;
        quorums[1] = 1;

        vm.expectEmit(true, false, false, true);
        emit OperatorRegistered(OPERATOR1, quorums, 1000 ether);

        vm.startPrank(OPERATOR1);
        mockValidator.registerOperator(OPERATOR1, quorums, "socket://operator1:8080");
        vm.stopPrank();

        // Verify operator info
        IEigenAssetVerifier.OperatorInfo memory info = mockValidator.getOperatorInfo(OPERATOR1);
        assertTrue(info.isRegistered);
        assertEq(info.operator, OPERATOR1);
        assertEq(info.stakedAmount, 1000 ether);
        assertFalse(info.isSlashed);
    }

    function testOperatorDeregistration() public {
        uint8[] memory quorums = new uint8[](1);
        quorums[0] = 0;

        // Register first
        vm.startPrank(OPERATOR1);
        mockValidator.registerOperator(OPERATOR1, quorums, "socket://operator1:8080");

        // Then deregister
        mockValidator.deregisterOperator(OPERATOR1, quorums);
        vm.stopPrank();

        // Verify operator is no longer registered
        IEigenAssetVerifier.OperatorInfo memory info = mockValidator.getOperatorInfo(OPERATOR1);
        assertFalse(info.isRegistered);
    }

    function testOperatorSlashing() public {
        uint8[] memory quorums = new uint8[](1);
        quorums[0] = 0;

        // Register operator
        vm.startPrank(OPERATOR1);
        mockValidator.registerOperator(OPERATOR1, quorums, "socket://operator1:8080");
        vm.stopPrank();

        bytes32 marketId = _getPoolId(poolKey);
        uint256 slashAmount = 100 ether;

        vm.expectEmit(true, true, false, true);
        emit OperatorSlashed(OPERATOR1, marketId, slashAmount);

        // Slash operator for incorrect validation
        mockValidator.slashOperator(OPERATOR1, marketId, slashAmount);

        // Verify operator is slashed
        assertTrue(mockValidator.isOperatorSlashed(OPERATOR1));
    }

    // ============ Consensus Validation Tests ============

    function testLeveragePositionValidationConsensus() public {
        _registerMultipleOperators();

        // Create leverage position
        ILeverageValidator.LeveragePosition memory position = ILeverageValidator.LeveragePosition({
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

        // Test with sufficient consensus (2/3 operators approve)
        mockValidator.setConsensusThreshold(2);
        mockValidator.setOperatorApprovals(OPERATOR1, true);
        mockValidator.setOperatorApprovals(OPERATOR2, true);
        mockValidator.setOperatorApprovals(OPERATOR3, false);

        (bool isValid, string memory reason) = mockValidator.validateLeveragePosition(
            position,
            new bytes[](0)
        );

        assertTrue(isValid);
        assertEq(keccak256(bytes(reason)), keccak256(bytes("Consensus reached")));
    }

    function testLeveragePositionValidationConsensusFailure() public {
        _registerMultipleOperators();

        // Create leverage position
        ILeverageValidator.LeveragePosition memory position = ILeverageValidator.LeveragePosition({
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

        // Test with insufficient consensus (1/3 operators approve)
        mockValidator.setConsensusThreshold(2);
        mockValidator.setOperatorApprovals(OPERATOR1, true);
        mockValidator.setOperatorApprovals(OPERATOR2, false);
        mockValidator.setOperatorApprovals(OPERATOR3, false);

        (bool isValid, string memory reason) = mockValidator.validateLeveragePosition(
            position,
            new bytes[](0)
        );

        assertFalse(isValid);
        assertEq(keccak256(bytes(reason)), keccak256(bytes("Insufficient operator consensus")));
    }

    // ============ Pool Manipulation Detection Tests ============

    function testPoolManipulationDetection() public {
        _registerMultipleOperators();

        bytes32 marketId = _getPoolId(poolKey);

        // Mock manipulation detection with operator consensus
        mockValidator.setManipulationDetected(true, 500, 1000, 200); // 5% price deviation, 10x volume spike, 2% liquidity change

        address[] memory suspiciousOperators = new address[](1);
        suspiciousOperators[0] = OPERATOR3;
        mockValidator.setSuspiciousOperators(suspiciousOperators);

        vm.expectEmit(true, false, false, false);
        emit PoolManipulationDetected(marketId, 500, suspiciousOperators);

        ILeverageValidator.ManipulationCheck memory manipulation = mockValidator.checkPoolManipulation(
            marketId,
            abi.encode("price_data"),
            abi.encode("volume_data")
        );

        assertTrue(manipulation.isManipulated);
        assertEq(manipulation.priceDeviation, 500);
        assertEq(manipulation.volumeAnomaly, 1000);
        assertEq(manipulation.liquidityChange, 200);
        assertEq(manipulation.suspiciousOperators.length, 1);
        assertEq(manipulation.suspiciousOperators[0], OPERATOR3);
    }

    function testSwapValidationWithManipulation() public {
        _registerMultipleOperators();

        bytes32 marketId = _getPoolId(poolKey);

        // Setup manipulation detection
        mockValidator.setManipulationDetected(true, 500, 1000, 200);

        // Create swap params
        SwapParams memory swapParams = SwapParams({
            zeroForOne: true,
            amountSpecified: -int256(1 ether),
            sqrtPriceLimitX96: TickMath.MIN_SQRT_PRICE + 1
        });

        // Should reject swap due to manipulation
        bool canSwap = mockValidator.verifySwap(marketId, swapParams, ZERO_BYTES);
        assertFalse(canSwap);
    }

    // ============ Cross-Pool Exposure Tests ============

    function testCrossPoolExposureValidation() public {
        _registerMultipleOperators();

        // Create first position
        ILeverageValidator.LeveragePosition memory position1 = ILeverageValidator.LeveragePosition({
            trader: TRADER1,
            collateralToken: Currency.unwrap(currency0),
            borrowedToken: Currency.unwrap(currency1),
            collateralAmount: COLLATERAL_AMOUNT,
            borrowedAmount: BORROW_AMOUNT,
            leverageRatio: DEFAULT_LEVERAGE,
            isLongPosition: true,
            openTimestamp: block.timestamp,
            positionId: keccak256(abi.encodePacked(TRADER1, block.timestamp, "1"))
        });

        // Set current exposure to near limit
        mockValidator.setTraderExposure(TRADER1, 800 ether, 2400 ether, 1600 ether); // Near 3000 ether limit

        // Try to add second position that would exceed limit
        ILeverageValidator.LeveragePosition memory position2 = ILeverageValidator.LeveragePosition({
            trader: TRADER1,
            collateralToken: Currency.unwrap(currency0),
            borrowedToken: Currency.unwrap(currency1),
            collateralAmount: COLLATERAL_AMOUNT,
            borrowedAmount: BORROW_AMOUNT * 2, // Large borrow that exceeds limit
            leverageRatio: DEFAULT_LEVERAGE,
            isLongPosition: false,
            openTimestamp: block.timestamp,
            positionId: keccak256(abi.encodePacked(TRADER1, block.timestamp, "2"))
        });

        (bool exceedsLimit, uint256 currentExposure, uint256 maxAllowed) = mockValidator.checkCrossPoolExposure(
            TRADER1,
            position2
        );

        assertTrue(exceedsLimit);
        assertEq(currentExposure, 2400 ether);
        assertEq(maxAllowed, 3000 ether);
    }

    // ============ Dynamic Funding Rate Tests ============

    function testDynamicFundingRateCalculation() public {
        bytes32 marketId = _getPoolId(poolKey);

        // Test low utilization (30%) - should have low funding rate
        uint256 lowUtilizationRate = mockValidator.calculateFundingRate(marketId, 3000);
        assertEq(lowUtilizationRate, 50); // 0.5% base rate

        // Test medium utilization (60%) - should have moderate funding rate
        uint256 mediumUtilizationRate = mockValidator.calculateFundingRate(marketId, 6000);
        assertEq(mediumUtilizationRate, 100); // 1.0% rate

        // Test high utilization (90%) - should have high funding rate
        uint256 highUtilizationRate = mockValidator.calculateFundingRate(marketId, 9000);
        assertEq(highUtilizationRate, 300); // 3.0% rate
    }

    function testFundingRateUpdate() public {
        bytes32 marketId = _getPoolId(poolKey);

        // Update funding rate
        mockValidator.updateFundingRate(marketId, 250); // 2.5%

        // Verify rate was updated
        ILeverageValidator.PoolUtilization memory utilization = mockValidator.getPoolUtilization(marketId);
        assertEq(utilization.fundingRate, 250);
    }

    // ============ Emergency Functions Tests ============

    function testEmergencyPoolPause() public {
        _registerMultipleOperators();

        bytes32 marketId = _getPoolId(poolKey);

        // Emergency pause requires operator consensus
        mockValidator.setEmergencyConsensus(true);

        mockValidator.emergencyPausePool(marketId, "Suspected manipulation detected");

        // Verify pool operations are paused
        bool isPaused = mockValidator.isPoolPaused(marketId);
        assertTrue(isPaused);
    }

    function testEmergencyLiquidation() public {
        _registerMultipleOperators();

        bytes32[] memory positionIds = new bytes32[](2);
        positionIds[0] = keccak256(abi.encodePacked("position1"));
        positionIds[1] = keccak256(abi.encodePacked("position2"));

        // Set positions as requiring liquidation
        mockValidator.setLiquidationRequired(positionIds[0], true);
        mockValidator.setLiquidationRequired(positionIds[1], true);

        // Emergency liquidation requires operator consensus
        mockValidator.setEmergencyConsensus(true);

        mockValidator.emergencyLiquidate(positionIds, "Market crash - immediate liquidation required");

        // Verify liquidations were executed
        assertTrue(mockValidator.wasLiquidated(positionIds[0]));
        assertTrue(mockValidator.wasLiquidated(positionIds[1]));
    }

    // ============ Market Creation and Validation Tests ============

    function testMarketCreation() public {
        bytes32 marketId = keccak256(abi.encodePacked("test_market"));
        uint8[] memory quorums = new uint8[](1);
        quorums[0] = 0;

        mockValidator.createMarket(
            marketId,
            1000 ether, // Required stake
            2, // Validation threshold
            quorums
        );

        IEigenAssetVerifier.MarketValidation memory validation = mockValidator.getMarketValidation(marketId);
        assertTrue(validation.isActive);
        assertEq(validation.marketId, marketId);
        assertEq(validation.requiredStake, 1000 ether);
        assertEq(validation.validationThreshold, 2);
    }

    function testMarketValidationSubmission() public {
        bytes32 marketId = _getPoolId(poolKey);

        // Submit market validation with BLS signature
        bytes memory signature = abi.encode("mock_bls_signature");

        mockValidator.submitMarketValidation(marketId, true, signature);

        // Verify validation was submitted
        IEigenAssetVerifier.MarketValidation memory validation = mockValidator.getMarketValidation(marketId);
        assertTrue(validation.isActive);
    }

    // ============ Helper Functions ============

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

    function _registerMultipleOperators() internal {
        uint8[] memory quorums = new uint8[](1);
        quorums[0] = 0;

        // Register three operators
        vm.startPrank(OPERATOR1);
        mockValidator.registerOperator(OPERATOR1, quorums, "socket://operator1:8080");
        vm.stopPrank();

        vm.startPrank(OPERATOR2);
        mockValidator.registerOperator(OPERATOR2, quorums, "socket://operator2:8080");
        vm.stopPrank();

        vm.startPrank(OPERATOR3);
        mockValidator.registerOperator(OPERATOR3, quorums, "socket://operator3:8080");
        vm.stopPrank();
    }

    function _getPoolId(PoolKey memory key) internal pure returns (bytes32) {
        return keccak256(abi.encode(key.currency0, key.currency1, key.fee, key.tickSpacing));
    }
}

// ============ Enhanced Mock Contracts ============

contract MockEigenLayerValidator is ILeverageValidator {
    // Operator management
    mapping(address => IEigenAssetVerifier.OperatorInfo) public operators;
    mapping(address => mapping(uint8 => bool)) public operatorQuorums;
    mapping(address => bool) public slashedOperators;

    // Consensus tracking
    mapping(address => bool) public operatorApprovals;
    uint256 public consensusThreshold = 2;

    // Market management
    mapping(bytes32 => IEigenAssetVerifier.MarketValidation) public markets;
    mapping(bytes32 => bool) public poolPaused;

    // Manipulation detection
    bool public manipulationDetected = false;
    uint256 public priceDeviation = 0;
    uint256 public volumeAnomaly = 0;
    uint256 public liquidityChange = 0;
    address[] public suspiciousOperators;

    // Cross-pool exposure
    mapping(address => uint256) public traderCollateral;
    mapping(address => uint256) public traderBorrowed;
    mapping(address => uint256) public traderNetExposure;

    // Emergency functions
    bool public emergencyConsensusReached = false;
    mapping(bytes32 => bool) public liquidationRequired;
    mapping(bytes32 => bool) public liquidationExecuted;

    // ============ Configuration Functions ============

    function setConsensusThreshold(uint256 _threshold) external {
        consensusThreshold = _threshold;
    }

    function setOperatorApprovals(address operator, bool approved) external {
        operatorApprovals[operator] = approved;
    }

    function setManipulationDetected(
        bool _detected,
        uint256 _priceDeviation,
        uint256 _volumeAnomaly,
        uint256 _liquidityChange
    ) external {
        manipulationDetected = _detected;
        priceDeviation = _priceDeviation;
        volumeAnomaly = _volumeAnomaly;
        liquidityChange = _liquidityChange;
    }

    function setSuspiciousOperators(address[] memory _operators) external {
        delete suspiciousOperators;
        for (uint256 i = 0; i < _operators.length; i++) {
            suspiciousOperators.push(_operators[i]);
        }
    }

    function setTraderExposure(
        address trader,
        uint256 collateral,
        uint256 borrowed,
        uint256 netExposure
    ) external {
        traderCollateral[trader] = collateral;
        traderBorrowed[trader] = borrowed;
        traderNetExposure[trader] = netExposure;
    }

    function setEmergencyConsensus(bool consensus) external {
        emergencyConsensusReached = consensus;
    }

    function setLiquidationRequired(bytes32 positionId, bool required) external {
        liquidationRequired[positionId] = required;
    }

    function isPoolPaused(bytes32 poolId) external view returns (bool) {
        return poolPaused[poolId];
    }

    function wasLiquidated(bytes32 positionId) external view returns (bool) {
        return liquidationExecuted[positionId];
    }

    // ============ ILeverageValidator Implementation ============

    function validateLeveragePosition(
        LeveragePosition calldata,
        bytes[] calldata
    ) external view override returns (bool isValid, string memory reason) {
        // Count operator approvals
        uint256 approvals = 0;
        if (operatorApprovals[address(0x4)]) approvals++; // OPERATOR1
        if (operatorApprovals[address(0x5)]) approvals++; // OPERATOR2
        if (operatorApprovals[address(0x6)]) approvals++; // OPERATOR3

        if (approvals >= consensusThreshold) {
            return (true, "Consensus reached");
        } else {
            return (false, "Insufficient operator consensus");
        }
    }

    function validateBorrowRequest(
        bytes32,
        address,
        address,
        uint256,
        uint256
    ) external pure override returns (BorrowValidation memory) {
        return BorrowValidation({
            canBorrow: true,
            maxBorrowAmount: 1000000 ether,
            requiredCollateral: 100 ether,
            liquidationThreshold: 8000,
            reason: "Approved"
        });
    }

    function verifySwap(
        bytes32,
        SwapParams calldata,
        bytes calldata
    ) external view override returns (bool) {
        return !manipulationDetected;
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
            suspiciousOperators: suspiciousOperators
        });
    }

    function checkCrossPoolExposure(
        address trader,
        LeveragePosition calldata newPosition
    ) external view override returns (bool exceedsLimit, uint256 currentExposure, uint256 maxAllowedExposure) {
        uint256 newBorrowed = traderBorrowed[trader] + newPosition.borrowedAmount;
        maxAllowedExposure = 3000 ether; // 3000 ether limit
        currentExposure = traderBorrowed[trader];
        exceedsLimit = newBorrowed > maxAllowedExposure;
    }

    function getTraderExposure(
        address trader
    ) external view override returns (uint256 totalCollateral, uint256 totalBorrowed, uint256 netExposure) {
        return (traderCollateral[trader], traderBorrowed[trader], traderNetExposure[trader]);
    }

    function checkLiquidation(
        bytes32 positionId
    ) external view override returns (bool shouldLiquidate, uint256 liquidationPrice, uint256 healthFactor) {
        return (liquidationRequired[positionId], 50 ether, 800);
    }

    function calculateFundingRate(
        bytes32,
        uint256 targetUtilization
    ) external pure override returns (uint256) {
        if (targetUtilization < 5000) return 50; // 0.5%
        if (targetUtilization < 7000) return 100; // 1.0%
        return 300; // 3.0%
    }

    function getPoolUtilization(
        bytes32
    ) external view override returns (PoolUtilization memory) {
        return PoolUtilization({
            poolId: bytes32(0),
            totalLiquidity: 1000000 ether,
            borrowedAmount: 500000 ether,
            utilizationRate: 5000,
            fundingRate: 100,
            isAtCapacity: false
        });
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

    function registerOperator(
        address operator,
        uint8[] calldata quorums,
        string calldata
    ) external override {
        operators[operator] = IEigenAssetVerifier.OperatorInfo({
            operator: operator,
            stakedAmount: 1000 ether,
            quorums: quorums,
            isRegistered: true,
            isSlashed: false
        });

        for (uint256 i = 0; i < quorums.length; i++) {
            operatorQuorums[operator][quorums[i]] = true;
        }

        emit OperatorRegistered(operator, quorums, 1000 ether);
    }

    function deregisterOperator(address operator, uint8[] calldata quorums) external override {
        operators[operator].isRegistered = false;
        for (uint256 i = 0; i < quorums.length; i++) {
            operatorQuorums[operator][quorums[i]] = false;
        }
    }

    function getOperatorInfo(address operator) external view override returns (IEigenAssetVerifier.OperatorInfo memory) {
        return operators[operator];
    }

    function createMarket(
        bytes32 marketId,
        uint256 requiredStake,
        uint256 validationThreshold,
        uint8[] calldata
    ) external override {
        markets[marketId] = IEigenAssetVerifier.MarketValidation({
            marketId: marketId,
            validators: new address[](0),
            requiredStake: requiredStake,
            validationThreshold: validationThreshold,
            isActive: true
        });
    }

    function submitMarketValidation(bytes32 marketId, bool, bytes calldata) external override {
        markets[marketId].isActive = true;
    }

    function getMarketValidation(bytes32 marketId) external view override returns (IEigenAssetVerifier.MarketValidation memory) {
        return markets[marketId];
    }

    function slashOperator(address operator, bytes32 marketId, uint256 slashAmount) external override {
        operators[operator].isSlashed = true;
        slashedOperators[operator] = true;
        emit OperatorSlashed(operator, marketId, slashAmount);
    }

    function isOperatorSlashed(address operator) external view override returns (bool) {
        return slashedOperators[operator];
    }

    // ============ Stub Implementations ============

    function getSwapValidation(bytes32, address, uint256) external pure override returns (SwapValidation memory) {
        return SwapValidation(true, "", 1000 ether, new address[](0));
    }

    function checkStakeRequirement(address, uint8) external pure override returns (bool) { return true; }
    function getOperatorCount(uint8) external pure override returns (uint256) { return 3; }
    function getActiveMarkets() external pure override returns (bytes32[] memory) {
        return new bytes32[](0);
    }
    function isMarketActive(bytes32) external pure override returns (bool) { return true; }
}