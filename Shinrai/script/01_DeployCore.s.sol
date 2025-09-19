// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import "forge-std/console.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolManager} from "v4-core/PoolManager.sol";
import {HookMiner} from "v4-periphery/src/utils/HookMiner.sol";
import {LeverageHook} from "../src/LeverageHook.sol";
import {MarginRouter} from "../src/MarginRouter.sol";
import {GlobalAssetLedger} from "../src/GlobalAssetLedger.sol";
import {ILeverageValidator} from "../src/interface/ILeverageValidator.sol";
import {SwapParams} from "v4-core/types/PoolOperation.sol";

// EigenLayer Contracts
import {IDelegationManager} from "eigenlayer-contracts/src/contracts/interfaces/IDelegationManager.sol";
import {IAVSDirectory} from "eigenlayer-contracts/src/contracts/interfaces/IAVSDirectory.sol";
import {ISignatureUtilsMixinTypes} from "eigenlayer-contracts/src/contracts/interfaces/ISignatureUtilsMixin.sol";


/**
 * @title Step 1: Deploy Core Shinrai Contracts
 * @notice Deploys the main protocol contracts
 */
contract DeployCore is Script {
    address internal deployer;
    address internal protocolOwner;
    LeverageHook public leverageHook;
    GlobalAssetLedger public globalAssetLedger;
    MarginRouter public marginRouter;
    IPoolManager public poolManager;

    // Standard Foundry CREATE2 deployer
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    // EigenLayer addresses (Holesky testnet) - Real deployed contracts
    address internal constant AVS_DIRECTORY = 0xa789c91ECDdae96865913130B786140Ee17aF545;
    address internal constant DELEGATION_MANAGER = 0xD4A7E1Bd8015057293f0D0A557088c286942e84b;

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

        // 1. Deploy PoolManager
        console.log("1. Deploying PoolManager...");
        poolManager = new PoolManager(protocolOwner);
        console.log("   PoolManager deployed at:", address(poolManager));

        // 2. Reference EigenLayer contracts directly
        console.log("2. Using EigenLayer contracts directly...");
        console.log("   DelegationManager:", DELEGATION_MANAGER);
        console.log("   AVSDirectory:", AVS_DIRECTORY);

        // 3. Mine salt for LeverageHook
        console.log("3. Preparing hook deployment...");
        console.log("   Using standard CREATE2_DEPLOYER:", CREATE2_DEPLOYER);
        uint160 flags = uint160(
            Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG |
            Hooks.AFTER_REMOVE_LIQUIDITY_FLAG |
            Hooks.BEFORE_SWAP_FLAG |
            Hooks.AFTER_SWAP_FLAG
        );
        console.log("   Required hook flags:", flags);

        bytes memory constructorArgs = abi.encode(address(poolManager), DELEGATION_MANAGER);
        (address hookAddress, bytes32 salt) = HookMiner.find(
            CREATE2_DEPLOYER,
            flags,
            type(LeverageHook).creationCode,
            constructorArgs
        );

        console.log("   Mined hook address:", hookAddress);
        console.log("   Mined salt:", vm.toString(salt));
        console.log("   Add this to .env: LEVERAGE_HOOK_SALT=", vm.toString(salt));

        // Verify flags before deploy
        uint160 ALL_HOOK_MASK = uint160((1 << 14) - 1);
        uint160 addressFlags = uint160(hookAddress) & ALL_HOOK_MASK;
        require(addressFlags == flags, "Hook flags verification failed");
        console.log("   Hook flags verified successfully");

        // 4. Deploy LeverageHook
        console.log("4. Deploying LeverageHook with standard CREATE2...");
        leverageHook = new LeverageHook{salt: salt}(
            IPoolManager(address(poolManager)),
            DELEGATION_MANAGER
        );
        console.log("   LeverageHook deployed at:", address(leverageHook));

        // Verify hook flags
        uint160 deployedFlags = uint160(address(leverageHook)) & ALL_HOOK_MASK;
        require(deployedFlags == flags, "LeverageHook: hook flags mismatch");
        console.log("   Hook flags verified successfully");

        // 5. Deploy GlobalAssetLedger
        console.log("5. Deploying GlobalAssetLedger...");
        globalAssetLedger = new GlobalAssetLedger(
            DELEGATION_MANAGER,
            protocolOwner
        );
        console.log("   GlobalAssetLedger deployed at:", address(globalAssetLedger));

        // 6. Deploy MarginRouter
        console.log("6. Deploying MarginRouter...");
        marginRouter = new MarginRouter(
            address(poolManager),
            DELEGATION_MANAGER,
            protocolOwner
        );
        console.log("   MarginRouter deployed at:", address(marginRouter));

        vm.stopBroadcast();

        // 7. Save addresses
        _saveAddresses();

        console.log("=== Core Contract Deployment Complete ===");
        console.log("Next step: Run 02_RegisterOperators.s.sol");
    }

    function _saveAddresses() internal {
        string memory addresses = string.concat(
            "# Updated contract addresses from deployment\n",
            "# Using standard CREATE2_DEPLOYER: ", vm.toString(CREATE2_DEPLOYER), "\n",
            "POOL_MANAGER_ADDRESS=", vm.toString(address(poolManager)), "\n",
            "DELEGATION_MANAGER_ADDRESS=", vm.toString(DELEGATION_MANAGER), "\n",
            "AVS_DIRECTORY_ADDRESS=", vm.toString(AVS_DIRECTORY), "\n",
            "LEVERAGE_HOOK_ADDRESS=", vm.toString(address(leverageHook)), "\n",
            "GLOBAL_ASSET_LEDGER_ADDRESS=", vm.toString(address(globalAssetLedger)), "\n",
            "MARGIN_ROUTER_ADDRESS=", vm.toString(address(marginRouter)), "\n"
        );

    }
}


