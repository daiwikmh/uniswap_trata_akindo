// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

// Shinrai Contracts
import {LeverageHook} from "../src/LeverageHook.sol";
import {MarginRouter} from "../src/MarginRouter.sol";
import {GlobalAssetLedger} from "../src/GlobalAssetLedger.sol";
import {ILeverageValidator} from "../src/interface/ILeverageValidator.sol";
import {IEigenAssetVerifier} from "../src/interface/IEigenAssetVerifier.sol";

// EigenLayer Contracts
import {IDelegationManager, IDelegationManagerTypes} from "eigenlayer-contracts/src/contracts/interfaces/IDelegationManager.sol";
import {ISignatureUtilsMixinTypes} from "eigenlayer-contracts/src/contracts/interfaces/ISignatureUtilsMixin.sol";
import {IAVSDirectory} from "eigenlayer-contracts/src/contracts/interfaces/IAVSDirectory.sol";

// Uniswap V4
import {SwapParams} from "v4-core/types/PoolOperation.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolManager} from "v4-core/PoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";

/**
 * @title DeployShinraiProtocol
 * @notice Deployment script for Shinrai leveraged trading protocol with EigenLayer integration
 * @dev Follows the pattern from example/my.s.sol for EigenLayer operator registration
 */
contract DeployShinraiProtocol is Script {

    // ============ EigenLayer Core Contracts (Holesky Testnet) ============
    address internal constant AVS_DIRECTORY = 0x055733000064333CaDDbC92763c58BF0192fFeBf;
    address internal constant DELEGATION_MANAGER = 0xA44151489861Fe9e3055d95adC98FbD462B948e7;

    // ============ Uniswap V4 (Mock for testing) ============
    // Note: Replace with actual PoolManager address when available
    address internal constant POOL_MANAGER = address(0); // To be deployed or set

    // ============ Deployment Addresses ============
    address internal deployer;
    address internal operator1;
    address internal operator2;
    address internal protocolOwner;

    // ============ Deployed Contracts ============
    MockLeverageValidator public leverageValidator;
    LeverageHook public leverageHook;
    GlobalAssetLedger public globalAssetLedger;
    MarginRouter public marginRouter;
    IPoolManager public poolManager;

    // ============ Configuration Constants ============
    uint256 public constant MAX_GLOBAL_LEVERAGE = 1000; // 10x
    uint256 public constant INITIAL_GLOBAL_BORROW_CAP = 10000000 ether;
    uint256 public constant INITIAL_POOL_BORROW_CAP = 1000000 ether;

    function setUp() public virtual {
        // Load private keys from environment
        deployer = vm.rememberKey(vm.envUint("PRIVATE_KEY"));
        operator1 = vm.rememberKey(vm.envUint("OPERATOR1_PRIVATE_KEY"));
        operator2 = vm.rememberKey(vm.envUint("OPERATOR2_PRIVATE_KEY"));
        protocolOwner = vm.rememberKey(vm.envUint("OWNER_PRIVATE_KEY"));

        // Label addresses for better logging
        vm.label(deployer, "Deployer");
        vm.label(operator1, "Operator1");
        vm.label(operator2, "Operator2");
        vm.label(protocolOwner, "ProtocolOwner");

        console.log("=== Shinrai Protocol Deployment Setup ===");
        console.log("Deployer address:", deployer);
        console.log("Operator1 address:", operator1);
        console.log("Operator2 address:", operator2);
        console.log("Protocol Owner address:", protocolOwner);
    }

    function run() public {
        console.log("=== Starting Shinrai Protocol Deployment ===");

        // Phase 1: Deploy Core Contracts
        _deployContracts();

        // Phase 2: Register Operators with EigenLayer
        _registerOperators();

        // Phase 3: Configure Protocol
        _configureProtocol();

        // Phase 4: Verify Deployment
        _verifyDeployment();

        console.log("=== Shinrai Protocol Deployment Complete ===");
    }

    /**
     * @notice Deploy all Shinrai protocol contracts
     */
    function _deployContracts() internal {
        console.log("=== Phase 1: Deploying Contracts ===");

        vm.startBroadcast(deployer);

        // Deploy mock PoolManager if not set
        if (POOL_MANAGER == address(0)) {
            poolManager = new PoolManager(protocolOwner);
            console.log("PoolManager deployed at:", address(poolManager));
        } else {
            poolManager = IPoolManager(POOL_MANAGER);
            console.log("Using existing PoolManager at:", POOL_MANAGER);
        }

        // Deploy MockLeverageValidator (implements ILeverageValidator)
        leverageValidator = new MockLeverageValidator();
        console.log("MockLeverageValidator deployed at:", address(leverageValidator));

        // Calculate hook address with proper flags
        uint160 hookFlags = uint160(
            Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG |
            Hooks.AFTER_REMOVE_LIQUIDITY_FLAG |
            Hooks.BEFORE_SWAP_FLAG |
            Hooks.AFTER_SWAP_FLAG
        );

        // Deploy LeverageHook to calculated address
        address hookAddress = address(hookFlags);
        bytes memory hookCreationCode = abi.encodePacked(
            type(LeverageHook).creationCode,
            abi.encode(address(poolManager), address(leverageValidator))
        );

        assembly {
            let hook := create2(0, add(hookCreationCode, 0x20), mload(hookCreationCode), 0)
            if iszero(hook) { revert(0, 0) }
        }

        leverageHook = LeverageHook(hookAddress);
        console.log("LeverageHook deployed at:", address(leverageHook));

        // Deploy GlobalAssetLedger
        globalAssetLedger = new GlobalAssetLedger(
            address(leverageValidator),
            protocolOwner
        );
        console.log("GlobalAssetLedger deployed at:", address(globalAssetLedger));

        // Deploy MarginRouter
        marginRouter = new MarginRouter(
            address(poolManager),
            address(leverageValidator),
            protocolOwner
        );
        console.log("MarginRouter deployed at:", address(marginRouter));

        vm.stopBroadcast();
    }

    /**
     * @notice Register operators with EigenLayer following the example pattern
     */
    function _registerOperators() internal {
        console.log("=== Phase 2: Registering Operators ===");

        _registerSingleOperator(operator1, vm.envUint("OPERATOR1_PRIVATE_KEY"));
        _registerSingleOperator(operator2, vm.envUint("OPERATOR2_PRIVATE_KEY"));
    }

    /**
     * @notice Register a single operator with EigenLayer
     * @param operatorAddress The operator's address
     * @param operatorPrivateKey The operator's private key for signing
     */
    function _registerSingleOperator(address operatorAddress, uint256 operatorPrivateKey) internal {
        console.log("Registering operator:", operatorAddress);

        IDelegationManager delegationManager = IDelegationManager(DELEGATION_MANAGER);

        // Register as operator in EigenLayer
        vm.startBroadcast(operatorAddress);
        try delegationManager.registerAsOperator(
            address(0), // initDelegationApprover (no approval required)
            0,          // allocationDelay
            ""          // metadataURI
        ) {
            console.log("  - Registered with DelegationManager");
        } catch {
            console.log("  - Already registered with DelegationManager");
        }
        vm.stopBroadcast();

        // Create operator registration signature for AVS
        IAVSDirectory avsDirectory = IAVSDirectory(AVS_DIRECTORY);
        bytes32 salt = keccak256(abi.encodePacked(block.timestamp, operatorAddress));
        uint256 expiry = block.timestamp + 1 hours;

        bytes32 digestHash = avsDirectory.calculateOperatorAVSRegistrationDigestHash(
            operatorAddress,
            address(leverageValidator),
            salt,
            expiry
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(operatorPrivateKey, digestHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        ISignatureUtilsMixinTypes.SignatureWithSaltAndExpiry memory operatorSignature =
            ISignatureUtilsMixinTypes.SignatureWithSaltAndExpiry({
                signature: signature,
                salt: salt,
                expiry: expiry
            });

        // Register operator to our AVS
        vm.startBroadcast(deployer);
        try leverageValidator.registerOperator(
            operatorAddress,
            new uint8[](0), // quorums - empty for now
            ""              // socket info
        ) {
            console.log("  - Registered with Leverage AVS");
        } catch Error(string memory reason) {
            console.log("  - Registration failed:", reason);
        }
        vm.stopBroadcast();
    }

    /**
     * @notice Configure protocol parameters and connections
     */
    function _configureProtocol() internal {
        console.log("=== Phase 3: Configuring Protocol ===");

        vm.startBroadcast(protocolOwner);

        // Configure GlobalAssetLedger
        console.log("Configuring GlobalAssetLedger...");
        globalAssetLedger.setAuthorizedRouter(address(marginRouter), true);

        // Set default borrow caps (using mock token addresses for now)
        address mockToken0 = address(0x1111111111111111111111111111111111111111);
        address mockToken1 = address(0x2222222222222222222222222222222222222222);

        globalAssetLedger.setGlobalBorrowCap(mockToken0, INITIAL_GLOBAL_BORROW_CAP);
        globalAssetLedger.setGlobalBorrowCap(mockToken1, INITIAL_GLOBAL_BORROW_CAP);

        // Configure MarginRouter
        console.log("Configuring MarginRouter...");
        marginRouter.setMaxGlobalLeverage(MAX_GLOBAL_LEVERAGE);

        // Create mock pool key for authorization (replace with real pool when available)
        PoolKey memory mockPoolKey = PoolKey({
            currency0: Currency.wrap(mockToken0),
            currency1: Currency.wrap(mockToken1),
            fee: 3000,
            tickSpacing: 60,
            hooks: IHooks(address(leverageHook))
        });

        marginRouter.authorizePool(mockPoolKey, MAX_GLOBAL_LEVERAGE);

        bytes32 mockPoolId = keccak256(abi.encode(mockToken0, mockToken1, uint24(3000), int24(60)));

        globalAssetLedger.setPoolBorrowCap(mockPoolId, mockToken0, INITIAL_POOL_BORROW_CAP);
        globalAssetLedger.setPoolBorrowCap(mockPoolId, mockToken1, INITIAL_POOL_BORROW_CAP);

        vm.stopBroadcast();

        console.log("Protocol configuration complete");
    }

    /**
     * @notice Verify deployment was successful
     */
    function _verifyDeployment() internal view {
        console.log("=== Phase 4: Verifying Deployment ===");

        // Verify contract addresses
        require(address(leverageValidator) != address(0), "LeverageValidator not deployed");
        require(address(leverageHook) != address(0), "LeverageHook not deployed");
        require(address(globalAssetLedger) != address(0), "GlobalAssetLedger not deployed");
        require(address(marginRouter) != address(0), "MarginRouter not deployed");

        // Verify connections
        require(
            address(globalAssetLedger.leverageValidator()) == address(leverageValidator),
            "GlobalAssetLedger validator mismatch"
        );
        require(
            address(marginRouter.leverageValidator()) == address(leverageValidator),
            "MarginRouter validator mismatch"
        );
        require(
            marginRouter.maxGlobalLeverage() == MAX_GLOBAL_LEVERAGE,
            "Max leverage not set correctly"
        );

        console.log("All contracts deployed successfully");
        console.log("Contract connections verified");
        console.log("Configuration applied");

        // Log final addresses
        console.log("");
        console.log("=== Deployed Contract Addresses ===");
        console.log("LeverageValidator:", address(leverageValidator));
        console.log("LeverageHook:", address(leverageHook));
        console.log("GlobalAssetLedger:", address(globalAssetLedger));
        console.log("MarginRouter:", address(marginRouter));
        console.log("PoolManager:", address(poolManager));
    }
}

/**
 * @title MockLeverageValidator
 * @notice Mock implementation of ILeverageValidator for testing and development
 * @dev This should be replaced with actual EigenLayer AVS implementation in production
 */
contract MockLeverageValidator is ILeverageValidator {
    // Operator management
    mapping(address => bool) public operatorRegistered;
    mapping(address => OperatorInfo) public operators;

    // Validation settings
    bool public defaultValidationResult = true;
    string public defaultValidationReason = "Mock validation approved";


    function registerOperator(address operator, uint8[] calldata quorums, string calldata socket) external override {
        operatorRegistered[operator] = true;
        operators[operator] = OperatorInfo({
            operator: operator,
            stakedAmount: 100 ether, // Mock stake
            quorums: quorums,
            isRegistered: true,
            isSlashed: false
        });
    }

    function deregisterOperator(address operator, uint8[] calldata) external override {
        operatorRegistered[operator] = false;
        operators[operator].isRegistered = false;
    }

    function validateLeveragePosition(
        LeveragePosition calldata position,
        bytes[] calldata
    ) external view override returns (bool isValid, string memory reason) {
        return (defaultValidationResult, defaultValidationReason);
    }

    function validateBorrowRequest(
        bytes32,
        address,
        address,
        uint256 borrowAmount,
        uint256 collateralAmount
    ) external view override returns (BorrowValidation memory) {
        return BorrowValidation({
            canBorrow: defaultValidationResult,
            maxBorrowAmount: borrowAmount,
            requiredCollateral: collateralAmount,
            liquidationThreshold: 8000, // 80%
            reason: defaultValidationReason
        });
    }

    function verifySwap(bytes32, SwapParams calldata, bytes calldata) external view override returns (bool) {
        return defaultValidationResult;
    }

    function checkCrossPoolExposure(
        address,
        LeveragePosition calldata
    ) external pure override returns (bool, uint256, uint256) {
        return (false, 0, 1000000 ether); // Not exceeding, current: 0, max: 1M
    }

    function checkLiquidation(bytes32) external pure override returns (bool, uint256, uint256) {
        return (false, 0, 1500); // No liquidation needed, price: 0, health: 150%
    }

    function calculateFundingRate(bytes32, uint256) external pure override returns (uint256) {
        return 100; // 1% funding rate
    }

    function getPoolUtilization(bytes32 poolId) external pure override returns (PoolUtilization memory) {
        return PoolUtilization({
            poolId: poolId,
            totalLiquidity: 1000000 ether,
            borrowedAmount: 500000 ether,
            utilizationRate: 5000, // 50%
            fundingRate: 100, // 1%
            isAtCapacity: false
        });
    }

    // Additional required functions with minimal implementations
    function getOperatorInfo(address operator) external view override returns (OperatorInfo memory) {
        return operators[operator];
    }

    function getSwapValidation(bytes32, address, uint256) external pure override returns (SwapValidation memory) {
        return SwapValidation(true, "Mock approved", 1000000 ether, new address[](0));
    }

    function createMarket(bytes32, uint256, uint256, uint8[] calldata) external override {}
    function submitMarketValidation(bytes32, bool, bytes calldata) external override {}
    function getMarketValidation(bytes32) external pure override returns (MarketValidation memory) {
        return MarketValidation(bytes32(0), new address[](0), 0, 0, false);
    }

    function checkStakeRequirement(address, uint8) external pure override returns (bool) { return true; }
    function slashOperator(address, bytes32, uint256) external override {}
    function isOperatorSlashed(address) external pure override returns (bool) { return false; }
    function getOperatorCount(uint8) external pure override returns (uint256) { return 2; }
    function getActiveMarkets() external pure override returns (bytes32[] memory) { return new bytes32[](0); }
    function isMarketActive(bytes32) external pure override returns (bool) { return true; }

    function checkPoolManipulation(bytes32, bytes calldata, bytes calldata) external pure override returns (ManipulationCheck memory) {
        return ManipulationCheck(false, 0, 0, 0, new address[](0));
    }

    function getTraderExposure(address) external pure override returns (uint256, uint256, uint256) {
        return (100 ether, 200 ether, 100 ether);
    }

    function updateFundingRate(bytes32, uint256) external override {}
    function emergencyPausePool(bytes32, string calldata) external override {}
    function emergencyLiquidate(bytes32[] calldata, string calldata) external override {}
}