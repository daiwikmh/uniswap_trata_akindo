// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {Script} from "forge-std/Script.sol";
import {MyServiceManager} from "./my.sol";
import {IDelegationManager, IDelegationManagerTypes} from "eigenlayer-contracts/src/contracts/interfaces/IDelegationManager.sol";
import {ISignatureUtilsMixinTypes} from "@eigenlayer-contracts/src/contracts/interfaces/ISignatureUtilsMixin.sol";
import {IAVSDirectory} from "eigenlayer-contracts/src/contracts/interfaces/IAVSDirectory.sol";
import "forge-std/console.sol";

contract DeployMyServiceManager is Script {
    // EigenLayer Core Contracts
 address internal constant AVS_DIRECTORY =
        0x055733000064333CaDDbC92763c58BF0192fFeBf;
    address internal constant DELEGATION_MANAGER =
        0xA44151489861Fe9e3055d95adC98FbD462B948e7;

    address internal deployer;
    address internal operator;
    MyServiceManager serviceManager;

    function setUp() public virtual {
        deployer = vm.rememberKey(vm.envUint("PRIVATE_KEY"));
        operator = vm.rememberKey(vm.envUint("OPERATOR_PRIVATE_KEY"));
        vm.label(deployer, "Deployer");
        vm.label(operator, "Operator");
        console.log("Deployer address:", deployer);
        console.log("Operator address:", operator);
    }

    function run() public {
        // Deploy ServiceManager
        vm.startBroadcast(deployer);
        serviceManager = new MyServiceManager(AVS_DIRECTORY);
        vm.stopBroadcast();

        IDelegationManager delegationManager = IDelegationManager(
            DELEGATION_MANAGER
        );

         vm.startBroadcast(operator);
        delegationManager.registerAsOperator(
            address(0), // initDelegationApprover (set to 0 for no approval required)
            0,          // allocationDelay (set to 0)
            ""          // metadataURI (empty string)
        );
        // delegationManager.registerAsOperator(operatorDetails, "");
        vm.stopBroadcast();



        // Create operator registration signature
        IAVSDirectory avsDirectory = IAVSDirectory(AVS_DIRECTORY);
        bytes32 salt = keccak256(abi.encodePacked(block.timestamp, operator));
        uint256 expiry = block.timestamp + 1 hours;

        bytes32 digestHash = avsDirectory.calculateOperatorAVSRegistrationDigestHash(
            operator,
            address(serviceManager),
            salt,
            expiry
        );

        (uint8 v, bytes32 r, bytes32 s) = vm.sign(vm.envUint("OPERATOR_PRIVATE_KEY"), digestHash);
        bytes memory signature = abi.encodePacked(r, s, v);

        ISignatureUtilsMixinTypes.SignatureWithSaltAndExpiry memory operatorSignature =
            ISignatureUtilsMixinTypes.SignatureWithSaltAndExpiry({
                signature: signature,
                salt: salt,
                expiry: expiry
            });

        // Register operator to AVS
        vm.startBroadcast(deployer);
        serviceManager.registerOperatorToAVS(operator, operatorSignature);
        vm.stopBroadcast();
    }
}
