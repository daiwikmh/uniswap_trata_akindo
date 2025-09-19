// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

// EigenLayer Contracts
import {IDelegationManager} from "eigenlayer-contracts/src/contracts/interfaces/IDelegationManager.sol";
import {IAVSDirectory} from "eigenlayer-contracts/src/contracts/interfaces/IAVSDirectory.sol";

/**
 * @title Step 2: Register Operators with EigenLayer
 * @notice Registers operators with EigenLayer DelegationManager
 */
contract RegisterOperators is Script {

    // EigenLayer addresses (Holesky testnet)
    address internal constant AVS_DIRECTORY = 0xa789c91ECDdae96865913130B786140Ee17aF545;
    address internal constant DELEGATION_MANAGER = 0xD4A7E1Bd8015057293f0D0A557088c286942e84b;

    address internal deployer;
    address internal operator1;
    address internal operator2;

    // Contract addresses (load from previous deployment)
    function setUp() public {
        deployer = vm.rememberKey(vm.envUint("PRIVATE_KEY"));
        operator1 = vm.rememberKey(vm.envUint("OPERATOR1_PRIVATE_KEY"));
        operator2 = vm.rememberKey(vm.envUint("OPERATOR2_PRIVATE_KEY"));

        vm.label(deployer, "Deployer");
        vm.label(operator1, "Operator1");
        vm.label(operator2, "Operator2");

        console.log("=== Operator Registration Setup ===");
        console.log("Deployer:", deployer);
        console.log("Operator1:", operator1);
        console.log("Operator2:", operator2);
        console.log("DelegationManager:", DELEGATION_MANAGER);
        console.log("AVSDirectory:", AVS_DIRECTORY);
    }

    function run() public {
        console.log("=== Starting Operator Registration ===");

        // Register both operators
        _registerOperator(operator1, vm.envUint("OPERATOR1_PRIVATE_KEY"), "Operator1");
        _registerOperator(operator2, vm.envUint("OPERATOR2_PRIVATE_KEY"), "Operator2");

        console.log("=== Operator Registration Complete ===");
        console.log("Next step: Run 03_ConfigureProtocol.s.sol");
    }

    function _registerOperator(address operatorAddr, uint256 operatorPrivateKey, string memory operatorName) internal {
        console.log(string.concat("=== Registering ", operatorName, " ==="));

        IDelegationManager delegationManager = IDelegationManager(DELEGATION_MANAGER);
        IAVSDirectory avsDirectory = IAVSDirectory(AVS_DIRECTORY);

        // Step 1: Register with EigenLayer DelegationManager
        console.log("1. Registering with DelegationManager...");
        vm.startBroadcast(operatorAddr);

        try delegationManager.registerAsOperator(
            address(0), // initDelegationApprover
            0,          // allocationDelay
            ""          // metadataURI
        ) {
            console.log("   Successfully registered with DelegationManager");
        } catch Error(string memory reason) {
            if (keccak256(bytes(reason)) == keccak256(bytes("DelegationManager.registerAsOperator: operator has already registered"))) {
                console.log("   Already registered with DelegationManager");
            } else {
                console.log("    Failed to register with DelegationManager:", reason);
                revert(reason);
            }
        }

        vm.stopBroadcast();

        console.log(string.concat("", operatorName, " registration complete"));
        console.log("");
    }
}