// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import "forge-std/console.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolManager} from "v4-core/PoolManager.sol";
import {HookMiner} from "v4-periphery/src/utils/HookMiner.sol";
import {CoWUniswapV4Hook} from "../src/CowHook.sol";
import {CoWSolver} from "../src/solver.sol";

/**
 * @title Deploy CoW Protocol Contracts
 * @notice Deploys CoWUniswapV4Hook and CoWSolver contracts
 */
contract DeployCoWProtocol is Script {
    address internal deployer;
    address internal protocolOwner;
    CoWUniswapV4Hook public cowHook;
    CoWSolver public cowSolver;
    IPoolManager public poolManager;

    // Standard Foundry CREATE2 deployer
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    function setUp() public {
        deployer = vm.rememberKey(vm.envUint("PRIVATE_KEY"));
        protocolOwner = vm.rememberKey(vm.envUint("OWNER_PRIVATE_KEY"));

        vm.label(deployer, "Deployer");
        vm.label(protocolOwner, "ProtocolOwner");

        console.log("=== CoW Protocol Deployment Setup ===");
        console.log("Deployer:", deployer);
        console.log("Protocol Owner:", protocolOwner);

        // Load existing pool manager address if available
        try vm.envAddress("POOL_MANAGER_ADDRESS") returns (address poolAddr) {
            poolManager = IPoolManager(poolAddr);
            console.log("Using existing PoolManager:", address(poolManager));
        } catch {
            console.log("POOL_MANAGER_ADDRESS not found in env - will deploy new one");
        }
    }

    function run() public {
        console.log("=== Starting CoW Protocol Deployment ===");
        vm.startBroadcast(deployer);

        // 1. Deploy PoolManager if not already deployed
        if (address(poolManager) == address(0)) {
            console.log("1. Deploying PoolManager...");
            poolManager = new PoolManager(protocolOwner);
            console.log("   PoolManager deployed at:", address(poolManager));
        } else {
            console.log("1. Using existing PoolManager at:", address(poolManager));
        }

        // 2. Mine salt for CoWUniswapV4Hook
        console.log("2. Preparing CoW hook deployment...");
        console.log("   Using standard CREATE2_DEPLOYER:", CREATE2_DEPLOYER);

        // CoW Hook needs beforeSwap and afterSwap permissions
        uint160 flags = uint160(
            Hooks.BEFORE_SWAP_FLAG |
            Hooks.AFTER_SWAP_FLAG
        );
        console.log("   Required hook flags:", flags);

        bytes memory constructorArgs = abi.encode(address(poolManager));
        (address hookAddress, bytes32 salt) = HookMiner.find(
            CREATE2_DEPLOYER,
            flags,
            type(CoWUniswapV4Hook).creationCode,
            constructorArgs
        );

        console.log("   Mined hook address:", hookAddress);
        console.log("   Mined salt:", vm.toString(salt));
        console.log("   Add this to .env: COW_HOOK_SALT=", vm.toString(salt));

        // Verify flags before deploy
        uint160 ALL_HOOK_MASK = uint160((1 << 14) - 1);
        uint160 addressFlags = uint160(hookAddress) & ALL_HOOK_MASK;
        require(addressFlags == flags, "Hook flags verification failed");
        console.log("   Hook flags verified successfully");

        // 3. Deploy CoWUniswapV4Hook
        console.log("3. Deploying CoWUniswapV4Hook with standard CREATE2...");
        cowHook = new CoWUniswapV4Hook{salt: salt}(
            IPoolManager(address(poolManager))
        );
        console.log("   CoWUniswapV4Hook deployed at:", address(cowHook));

        // Verify hook flags
        uint160 deployedFlags = uint160(address(cowHook)) & ALL_HOOK_MASK;
        require(deployedFlags == flags, "CoWUniswapV4Hook: hook flags mismatch");
        console.log("   Hook flags verified successfully");

        // 4. Deploy CoWSolver
        console.log("4. Deploying CoWSolver...");
        cowSolver = new CoWSolver(address(cowHook));
        console.log("   CoWSolver deployed at:", address(cowSolver));

        vm.stopBroadcast();

        // 5. Save addresses
        _saveAddresses();

        console.log("=== CoW Protocol Deployment Complete ===");
        console.log("CoWUniswapV4Hook:", address(cowHook));
        console.log("CoWSolver:", address(cowSolver));
        console.log("PoolManager:", address(poolManager));
    }

    function _saveAddresses() internal {
        string memory addresses = string.concat(
            "# CoW Protocol contract addresses from deployment\n",
            "# Using standard CREATE2_DEPLOYER: ", vm.toString(CREATE2_DEPLOYER), "\n",
            "POOL_MANAGER_ADDRESS=", vm.toString(address(poolManager)), "\n",
            "COW_HOOK_ADDRESS=", vm.toString(address(cowHook)), "\n",
            "COW_SOLVER_ADDRESS=", vm.toString(address(cowSolver)), "\n"
        );

        console.log("\n=== Save these addresses to your .env file ===");
        console.log(addresses);
    }
}