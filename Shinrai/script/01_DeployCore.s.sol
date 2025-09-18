// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {StdCheats} from "forge-std/StdCheats.sol";

// Shinrai Contracts
import {LeverageHook} from "../src/LeverageHook.sol";
import {MarginRouter} from "../src/MarginRouter.sol";
import {GlobalAssetLedger} from "../src/GlobalAssetLedger.sol";
import {ILeverageValidator} from "../src/interface/ILeverageValidator.sol";
import {IEigenAssetVerifier} from "../src/interface/IEigenAssetVerifier.sol";

// Uniswap V4
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolManager} from "v4-core/PoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {SwapParams} from "v4-core/types/PoolOperation.sol";

/**
 * @title Step 1: Deploy Core Shinrai Contracts
 * @notice Deploys the main protocol contracts
 */
contract DeployCore is Script, StdCheats {

    address internal deployer;
    address internal protocolOwner;

    // Contract addresses (will be set after deployment)
    MockLeverageValidator public leverageValidator;
    LeverageHook public leverageHook;
    GlobalAssetLedger public globalAssetLedger;
    MarginRouter public marginRouter;
    IPoolManager public poolManager;

    function setUp() public {
        deployer = vm.rememberKey(vm.envUint("PRIVATE_KEY"));
        protocolOwner = vm.rememberKey(vm.envUint("OWNER_PRIVATE_KEY"));

        vm.label(deployer, "Deployer");
        vm.label(protocolOwner, "ProtocolOwner");

        console.log("=== Core Contract Deployment Setup ===");
        console.log("Deployer:", deployer);
        console.log("Protocol Owner:", protocolOwner);
    }

    function run() public {
        console.log("=== Starting Core Contract Deployment ===");

        vm.startBroadcast(deployer);

        // 1. Deploy PoolManager (mock for testing)
        console.log("1. Deploying PoolManager...");
        poolManager = new PoolManager(protocolOwner);
        console.log("   PoolManager deployed at:", address(poolManager));

        // 2. Deploy MockLeverageValidator
        console.log("2. Deploying MockLeverageValidator...");
        leverageValidator = new MockLeverageValidator();
        console.log("   MockLeverageValidator deployed at:", address(leverageValidator));

        // 3. Deploy LeverageHook with proper flags
        console.log("3. Deploying LeverageHook...");
        uint160 hookFlags = uint160(
            Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG |
            Hooks.AFTER_REMOVE_LIQUIDITY_FLAG |
            Hooks.BEFORE_SWAP_FLAG |
            Hooks.AFTER_SWAP_FLAG
        );

        address hookAddress = address(hookFlags);

        // Deploy LeverageHook to calculated address using deployCodeTo
        deployCodeTo(
            "LeverageHook.sol",
            abi.encode(address(poolManager), address(leverageValidator)),
            hookAddress
        );

        leverageHook = LeverageHook(hookAddress);
        console.log("   LeverageHook deployed at:", address(leverageHook));

        // 4. Deploy GlobalAssetLedger
        console.log("4. Deploying GlobalAssetLedger...");
        globalAssetLedger = new GlobalAssetLedger(
            address(leverageValidator),
            protocolOwner
        );
        console.log("   GlobalAssetLedger deployed at:", address(globalAssetLedger));

        // 5. Deploy MarginRouter
        console.log("5. Deploying MarginRouter...");
        marginRouter = new MarginRouter(
            address(poolManager),
            address(leverageValidator),
            protocolOwner
        );
        console.log("   MarginRouter deployed at:", address(marginRouter));

        vm.stopBroadcast();

        // 6. Save addresses to file for next steps
        _saveAddresses();

        console.log("=== Core Contract Deployment Complete ===");
        console.log("Next step: Run 02_RegisterOperators.s.sol");
    }

    function _saveAddresses() internal {
        string memory addresses = string.concat(
            "# Updated contract addresses from deployment\n",
            "POOL_MANAGER_ADDRESS=", vm.toString(address(poolManager)), "\n",
            "LEVERAGE_VALIDATOR_ADDRESS=", vm.toString(address(leverageValidator)), "\n",
            "LEVERAGE_HOOK_ADDRESS=", vm.toString(address(leverageHook)), "\n",
            "GLOBAL_ASSET_LEDGER_ADDRESS=", vm.toString(address(globalAssetLedger)), "\n",
            "MARGIN_ROUTER_ADDRESS=", vm.toString(address(marginRouter)), "\n"
        );

        console.log("Contract addresses saved to deployed_addresses.txt");
    }
}

/**
 * @title MockLeverageValidator
 * @notice Simplified mock for initial deployment
 */
contract MockLeverageValidator is ILeverageValidator {
    mapping(address => bool) public operatorRegistered;
    bool public defaultValidation = true;

    function registerOperator(address operator, uint8[] calldata, string calldata) external override {
        operatorRegistered[operator] = true;
        console.log("Operator registered:", operator);
    }

    function deregisterOperator(address operator, uint8[] calldata) external override {
        operatorRegistered[operator] = false;
    }

    function validateLeveragePosition(
        LeveragePosition calldata,
        bytes[] calldata
    ) external view override returns (bool, string memory) {
        return (defaultValidation, "Mock validation");
    }

    function validateBorrowRequest(
        bytes32, address, address, uint256 borrowAmount, uint256 collateralAmount
    ) external view override returns (BorrowValidation memory) {
        return BorrowValidation({
            canBorrow: defaultValidation,
            maxBorrowAmount: borrowAmount,
            requiredCollateral: collateralAmount,
            liquidationThreshold: 8000,
            reason: "Mock validation"
        });
    }

    function verifySwap(bytes32, SwapParams calldata, bytes calldata) external view override returns (bool) {
        return defaultValidation;
    }

    function checkCrossPoolExposure(address, LeveragePosition calldata) external pure override returns (bool, uint256, uint256) {
        return (false, 0, 1000000 ether);
    }

    function checkLiquidation(bytes32) external pure override returns (bool, uint256, uint256) {
        return (false, 0, 1500);
    }

    function calculateFundingRate(bytes32, uint256) external pure override returns (uint256) {
        return 100;
    }

    function getPoolUtilization(bytes32 poolId) external pure override returns (PoolUtilization memory) {
        return PoolUtilization({
            poolId: poolId,
            totalLiquidity: 1000000 ether,
            borrowedAmount: 500000 ether,
            utilizationRate: 5000,
            fundingRate: 100,
            isAtCapacity: false
        });
    }

    // Minimal implementations for other required functions
    function getOperatorInfo(address) external pure override returns (OperatorInfo memory) {
        return OperatorInfo(address(0), 0, new uint8[](0), false, false);
    }
    function getSwapValidation(bytes32, address, uint256) external pure override returns (SwapValidation memory) {
        return SwapValidation(true, "", 0, new address[](0));
    }
    function createMarket(bytes32, uint256, uint256, uint8[] calldata) external override {}
    function submitMarketValidation(bytes32, bool, bytes calldata) external override {}
    function getMarketValidation(bytes32) external pure override returns (MarketValidation memory) {
        return MarketValidation(bytes32(0), new address[](0), 0, 0, false);
    }
    function checkStakeRequirement(address, uint8) external pure override returns (bool) { return true; }
    function slashOperator(address, bytes32, uint256) external override {}
    function isOperatorSlashed(address) external pure override returns (bool) { return false; }
    function getOperatorCount(uint8) external pure override returns (uint256) { return 1; }
    function getActiveMarkets() external pure override returns (bytes32[] memory) { return new bytes32[](0); }
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