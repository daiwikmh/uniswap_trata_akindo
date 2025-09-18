// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {HookMiner} from "v4-periphery/src/utils/HookMiner.sol";

import {LeverageHook} from "../src/LeverageHook.sol";

/// @notice Mines the address for LeverageHook deployment following official Uniswap V4 pattern
contract MineHookAddress is Script {

    // Standard Foundry CREATE2 deployer
    address constant CREATE2_DEPLOYER = 0x4e59b44847b379578588920cA78FbF26c0B4956C;

    // Placeholder addresses for mining (will be replaced with actual addresses during deployment)
    address constant POOLMANAGER = 0x1111111111111111111111111111111111111111;
    address constant EIGEN_ASSET_VERIFIER = 0x2222222222222222222222222222222222222222;

    function setUp() public {}

    function run() public {
        console.log("=== Mining LeverageHook Address ===");

        // Hook contracts must have specific flags encoded in the address
        uint160 flags = uint160(
            Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG |
            Hooks.AFTER_REMOVE_LIQUIDITY_FLAG |
            Hooks.BEFORE_SWAP_FLAG |
            Hooks.AFTER_SWAP_FLAG
        );

        console.log("Required hook permission flags:", flags);
        console.log("Using CREATE2_DEPLOYER:", CREATE2_DEPLOYER);

        // Mine a salt that will produce a hook address with the correct flags
        bytes memory constructorArgs = abi.encode(POOLMANAGER, EIGEN_ASSET_VERIFIER);
        (address hookAddress, bytes32 salt) =
            HookMiner.find(CREATE2_DEPLOYER, flags, type(LeverageHook).creationCode, constructorArgs);

        console.log("=== Mining Complete ===");
        console.log("Hook Address:", hookAddress);
        console.log("Salt:", vm.toString(salt));

        // Verify the flags are correct using Uniswap V4 logic
        // Flags are stored in the lowest 14 bits of the address
        uint160 ALL_HOOK_MASK = uint160((1 << 14) - 1); // 0x3FFF
        uint160 addressFlags = uint160(hookAddress) & ALL_HOOK_MASK;
        console.log("Address flags extracted:", addressFlags);
        console.log("Required flags:", flags);
        console.log("Flags match:", addressFlags == flags);

        require(addressFlags == flags, "Hook flags verification failed");
        console.log("Hook flags verified successfully!");

        // Instructions for user
        console.log("");
        console.log("=== Next Steps ===");
        console.log("1. Add this to your .env file:");
        console.log(string.concat("   LEVERAGE_HOOK_SALT=", vm.toString(salt)));
        console.log("");
        console.log("2. Your LeverageHook will be deployed to:", hookAddress);
        console.log("3. Run deployment scripts with this pre-computed salt");

        // Save to file
        string memory saltInfo = string.concat(
            "# Mined salt for LeverageHook deployment\n",
            "LEVERAGE_HOOK_SALT=", vm.toString(salt), "\n",
            "\n",
            "# Deployment info:\n",
            "# Hook Address: ", vm.toString(hookAddress), "\n",
            "# CREATE2_DEPLOYER: ", vm.toString(CREATE2_DEPLOYER), "\n",
            "# Flags: ", vm.toString(flags), "\n"
        );

        console.log("Salt saved to mined_hook_salt.env");
    }

}