// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolManager} from "v4-core/PoolManager.sol";
import {HookMiner} from "v4-periphery/src/utils/HookMiner.sol";
import {LeverageHook} from "../src/LeverageHook.sol";
import {MarginRouter} from "../src/MarginRouter.sol";
import {GlobalAssetLedger} from "../src/GlobalAssetLedger.sol";
import {ILeverageValidator} from "../src/interface/ILeverageValidator.sol";
import {IDelegationManager} from "eigenlayer-contracts/src/contracts/interfaces/IDelegationManager.sol";
import {IAVSDirectory} from "eigenlayer-contracts/src/contracts/interfaces/IAVSDirectory.sol";
import {ISignatureUtilsMixinTypes} from "eigenlayer-contracts/src/contracts/interfaces/ISignatureUtilsMixin.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";

// Standard Foundry CREATE2 deployer
address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

/**
 * @title DeployShinraiProtocol
 * @notice Deployment script for Shinrai leveraged trading protocol with EigenLayer integration
 */
contract DeployShinraiProtocol is Script {
    // ============ EigenLayer Core Contracts (Holesky Testnet) ============
    address internal constant AVS_DIRECTORY = 0x055733000064333CaDDbC92763c58BF0192fFeBf;
    address internal constant DELEGATION_MANAGER = 0xA44151489861Fe9e3055d95adC98FbD462B948e7;

    // ============ Uniswap V4 (Mock for testing) ============
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
        deployer = vm.rememberKey(vm.envUint("PRIVATE_KEY"));
        operator1 = vm.rememberKey(vm.envUint("OPERATOR1_PRIVATE_KEY"));
        operator2 = vm.rememberKey(vm.envUint("OPERATOR2_PRIVATE_KEY"));
        protocolOwner = vm.rememberKey(vm.envUint("OWNER_PRIVATE_KEY"));

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
        _deployContracts();
        _registerOperators();
        _configureProtocol();
        _verifyDeployment();
        console.log("=== Shinrai Protocol Deployment Complete ===");
    }

    function _deployContracts() internal {
        console.log("=== Phase 1: Deploying Contracts ===");
        vm.startBroadcast(deployer);

        // Deploy or use existing PoolManager
        if (POOL_MANAGER == address(0)) {
            poolManager = new PoolManager(protocolOwner);
            console.log("PoolManager deployed at:", address(poolManager));
        } else {
            poolManager = IPoolManager(POOL_MANAGER);
            console.log("Using existing PoolManager at:", POOL_MANAGER);
        }

        // Deploy MockLeverageValidator
        console.log("Deploying MockLeverageValidator...");
        leverageValidator = new MockLeverageValidator();
        console.log("MockLeverageValidator deployed at:", address(leverageValidator));

        // Deploy LeverageHook
        console.log("Deploying LeverageHook...");
        leverageHook = _deployLeverageHook();
        console.log("LeverageHook deployed at:", address(leverageHook));

        // Deploy GlobalAssetLedger
        console.log("Deploying GlobalAssetLedger...");
        globalAssetLedger = new GlobalAssetLedger(address(leverageValidator), protocolOwner);
        console.log("GlobalAssetLedger deployed at:", address(globalAssetLedger));

        // Deploy MarginRouter
        console.log("Deploying MarginRouter...");
        marginRouter = new MarginRouter(address(poolManager), address(leverageValidator), protocolOwner);
        console.log("MarginRouter deployed at:", address(marginRouter));

        vm.stopBroadcast();
    }

    function _deployLeverageHook() internal returns (LeverageHook hook) {
        uint160 flags = uint160(
            Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG |
            Hooks.AFTER_REMOVE_LIQUIDITY_FLAG |
            Hooks.BEFORE_SWAP_FLAG |
            Hooks.AFTER_SWAP_FLAG
        );
        console.log("   Required hook flags:", flags);

        bytes memory constructorArgs = abi.encode(address(poolManager), address(leverageValidator));
        bytes32 salt = _getOrMineSalt(flags, constructorArgs);

        address hookAddress = vm.computeCreate2Address(
            salt,
            keccak256(abi.encodePacked(type(LeverageHook).creationCode, constructorArgs)),
            CREATE2_DEPLOYER
        );
        console.log("   Hook will be deployed at:", hookAddress);

        require(HookMiner.validateHookAddress(hookAddress, flags), "Hook address does not match required permissions");

        try new LeverageHook{salt: salt}(IPoolManager(address(poolManager)), address(leverageValidator)) returns (
            LeverageHook deployedHook
        ) {
            hook = deployedHook;
        } catch Error(string memory reason) {
            console.log("   Deployment failed with reason:", reason);
            revert(reason);
        } catch (bytes memory lowLevelData) {
            console.log("   Low-level error data:", vm.toString(lowLevelData));
            revert("Low-level deployment error");
        }

        uint160 ALL_HOOK_MASK = uint160((1 << 14) - 1); // 0x3FFF
        uint160 deployedFlags = uint160(address(hook)) & ALL_HOOK_MASK;
        require(deployedFlags == flags, "LeverageHook: hook flags mismatch");
        console.log("   Hook flags verified successfully");

        return hook;
    }

    function _getOrMineSalt(uint160 flags, bytes memory constructorArgs) internal returns (bytes32 salt) {
        try vm.envBytes32("LEVERAGE_HOOK_SALT") returns (bytes32 envSalt) {
            address computedAddress = vm.computeCreate2Address(
                envSalt,
                keccak256(abi.encodePacked(type(LeverageHook).creationCode, constructorArgs)),
                CREATE2_DEPLOYER
            );
            if (HookMiner.validateHookAddress(computedAddress, flags)) {
                console.log("   Using pre-computed salt from environment");
                return envSalt;
            } else {
                console.log("   Environment salt invalid, mining new salt...");
            }
        } catch {
            console.log("   No pre-computed salt found, mining new salt...");
        }

        console.log("   Mining hook address (this may take a while)...");
        console.log("   Using CREATE2_DEPLOYER:", CREATE2_DEPLOYER);

        (address hookAddress, bytes32 minedSalt) = HookMiner.find(
            CREATE2_DEPLOYER,
            flags,
            type(LeverageHook).creationCode,
            constructorArgs
        );

        console.log("   Mined address:", hookAddress);
        console.logBytes32(minedSalt);
        console.log("   Save this salt to .env as LEVERAGE_HOOK_SALT for future deployments");

        return minedSalt;
    }

    function _registerOperators() internal {
        console.log("=== Phase 2: Registering Operators ===");
        _registerSingleOperator(operator1, vm.envUint("OPERATOR1_PRIVATE_KEY"));
        _registerSingleOperator(operator2, vm.envUint("OPERATOR2_PRIVATE_KEY"));
    }

    function _registerSingleOperator(address operatorAddress, uint256 operatorPrivateKey) internal {
        console.log("Registering operator:", operatorAddress);
        IDelegationManager delegationManager = IDelegationManager(DELEGATION_MANAGER);

        vm.startBroadcast(operatorAddress);
        try delegationManager.registerAsOperator(address(0), 0, "") {
            console.log("  - Registered with DelegationManager");
        } catch {
            console.log("  - Already registered with DelegationManager");
        }
        vm.stopBroadcast();

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

        ISignatureUtilsMixinTypes.SignatureWithSaltAndExpiry memory operatorSignature = ISignatureUtilsMixinTypes
            .SignatureWithSaltAndExpiry({signature: signature, salt: salt, expiry: expiry});

        vm.startBroadcast(deployer);
        try leverageValidator.registerOperator(operatorAddress, new uint8[](0), "") {
            console.log("  - Registered with Leverage AVS");
        } catch Error(string memory reason) {
            console.log("  - Registration failed:", reason);
        }
        vm.stopBroadcast();
    }

    function _configureProtocol() internal {
        console.log("=== Phase 3: Configuring Protocol ===");
        vm.startBroadcast(protocolOwner);

        console.log("Configuring GlobalAssetLedger...");
        globalAssetLedger.setAuthorizedRouter(address(marginRouter), true);

        address mockToken0 = address(0x1111111111111111111111111111111111111111);
        address mockToken1 = address(0x2222222222222222222222222222222222222222);

        globalAssetLedger.setGlobalBorrowCap(mockToken0, INITIAL_GLOBAL_BORROW_CAP);
        globalAssetLedger.setGlobalBorrowCap(mockToken1, INITIAL_GLOBAL_BORROW_CAP);

        console.log("Configuring MarginRouter...");
        marginRouter.setMaxGlobalLeverage(MAX_GLOBAL_LEVERAGE);

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

    function _verifyDeployment() internal view {
        console.log("=== Phase 4: Verifying Deployment ===");
        require(address(leverageValidator) != address(0), "LeverageValidator not deployed");
        require(address(leverageHook) != address(0), "LeverageHook not deployed");
        require(address(globalAssetLedger) != address(0), "GlobalAssetLedger not deployed");
        require(address(marginRouter) != address(0), "MarginRouter not deployed");

        require(
            address(globalAssetLedger.leverageValidator()) == address(leverageValidator),
            "GlobalAssetLedger validator mismatch"
        );
        require(
            address(marginRouter.leverageValidator()) == address(leverageValidator),
            "MarginRouter validator mismatch"
        );
        require(marginRouter.maxGlobalLeverage() == MAX_GLOBAL_LEVERAGE, "Max leverage not set correctly");

        console.log("All contracts deployed successfully");
        console.log("Contract connections verified");
        console.log("Configuration applied");

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
 */
contract MockLeverageValidator is ILeverageValidator {
    mapping(address => bool) public operatorRegistered;
    mapping(address => OperatorInfo) public operators;

    bool public defaultValidationResult = true;
    string public defaultValidationReason = "Mock validation approved";

    function registerOperator(address operator, uint8[] calldata quorums, string calldata socket) external override {
        operatorRegistered[operator] = true;
        operators[operator] = OperatorInfo({
            operator: operator,
            stakedAmount: 100 ether,
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
        return
            BorrowValidation({
                canBorrow: defaultValidationResult,
                maxBorrowAmount: borrowAmount,
                requiredCollateral: collateralAmount,
                liquidationThreshold: 8000,
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
        return (false, 0, 1000000 ether);
    }

    function checkLiquidation(bytes32) external pure override returns (bool, uint256, uint256) {
        return (false, 0, 1500);
    }

    function calculateFundingRate(bytes32, uint256) external pure override returns (uint256) {
        return 100;
    }

    function getPoolUtilization(bytes32 poolId) external pure override returns (PoolUtilization memory) {
        return
            PoolUtilization({
                poolId: poolId,
                totalLiquidity: 1000000 ether,
                borrowedAmount: 500000 ether,
                utilizationRate: 5000,
                fundingRate: 100,
                isAtCapacity: false
            });
    }

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

    function checkStakeRequirement(address, uint8) external pure override returns (bool) {
        return true;
    }

    function slashOperator(address, bytes32, uint256) external override {}

    function isOperatorSlashed(address) external pure override returns (bool) {
        return false;
    }

    function getOperatorCount(uint8) external pure override returns (uint256) {
        return 2;
    }

    function getActiveMarkets() external pure override returns (bytes32[] memory) {
        return new bytes32[](0);
    }

    function isMarketActive(bytes32) external pure override returns (bool) {
        return true;
    }

    function checkPoolManipulation(
        bytes32,
        bytes calldata,
        bytes calldata
    ) external pure override returns (ManipulationCheck memory) {
        return ManipulationCheck(false, 0, 0, 0, new address[](0));
    }

    function getTraderExposure(address) external pure override returns (uint256, uint256, uint256) {
        return (100 ether, 200 ether, 100 ether);
    }

    function updateFundingRate(bytes32, uint256) external override {}

    function emergencyPausePool(bytes32, string calldata) external override {}

    function emergencyLiquidate(bytes32[] calldata, string calldata) external override {}
}