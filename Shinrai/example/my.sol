pragma solidity ^0.8.26;

import {ISignatureUtilsMixin} from "@eigenlayer-contracts/src/contracts/interfaces/ISignatureUtilsMixin.sol";
import {IAVSDirectory} from "@eigenlayer-contracts/src/contracts/interfaces/IAVSDirectory.sol";
import {ECDSA} from "solady/utils/ECDSA.sol";
import "forge-std/console.sol";

contract MyServiceManager {
    using ECDSA for bytes32;

    // State
    address public immutable avsDirectory;
    uint32 public latestTaskNum;
    mapping(address => bool) public operatorRegistered;
    mapping(uint32 => bytes32) public allTaskHashes;
    mapping(address => mapping(uint32 => bytes)) public allTaskResponses;

    // Events
    event NewTaskCreated(uint32 indexed taskIndex, Task task);

    event TaskResponded(
        uint32 indexed taskIndex,
        Task task,
        bool isSafe,
        address operator
    );

    // Types
    struct Task {
        string contents;
        uint32 taskCreatedBlock;
    }

    modifier onlyOperator() {
        require(operatorRegistered[msg.sender], "Operator must be the caller");
        _;
    }

    constructor(address _avsDirectory) {
        avsDirectory = _avsDirectory;
    }

    // Register Operator
    function registerOperatorToAVS(
    address operator,
    ISignatureUtilsMixin.SignatureWithSaltAndExpiry memory operatorSignature
) external {
    console.log("==> Called registerOperatorToAVS");
    console.log("  - Operator: %s", operator);
    console.log("  - AVSDirectory: %s", avsDirectory);
    console.log("  - Signature:"); console.logBytes(operatorSignature.signature);
    console.log("  - Salt:"); console.logBytes32(operatorSignature.salt);
    console.log("  - Expiry: %s", operatorSignature.expiry);
    console.log("  - Msg.sender: %s", msg.sender);

    try IAVSDirectory(avsDirectory).registerOperatorToAVS(operator, operatorSignature) {
        console.log("==> AVSDirectory.registerOperatorToAVS succeeded");
        operatorRegistered[operator] = true;
    } catch Error(string memory reason) {
        console.log("!!! Revert reason: %s", reason);
        revert(reason);
    } catch (bytes memory lowLevelData) {
        console.log("!!! Low-level revert. No string reason.");
        revert("Low-level revert in registerOperatorToAVS");
    }
}


    // Deregister Operator
    function deregisterOperatorFromAVS(address operator) external onlyOperator {
        require(msg.sender == operator);
        IAVSDirectory(avsDirectory).deregisterOperatorFromAVS(operator);
        operatorRegistered[operator] = false;
    }

    // Create Task
    function createNewTask(
        string memory contents
    ) external returns (Task memory) {
        // create a new task struct
        Task memory newTask;
        newTask.contents = contents;
        newTask.taskCreatedBlock = uint32(block.number);

        // store hash of task onchain, emit event, and increase taskNum
        allTaskHashes[latestTaskNum] = keccak256(abi.encode(newTask));
        emit NewTaskCreated(latestTaskNum, newTask);
        latestTaskNum = latestTaskNum + 1;

        return newTask;
    }

    // Respond to Task
    function respondToTask(
        Task calldata task,
        uint32 referenceTaskIndex,
        bool isSafe,
        bytes memory signature
    ) external onlyOperator {
        // check that the task is valid, hasn't been responsed yet, and is being responded in time
        require(
            keccak256(abi.encode(task)) == allTaskHashes[referenceTaskIndex],
            "supplied task does not match the one recorded in the contract"
        );
        require(
            allTaskResponses[msg.sender][referenceTaskIndex].length == 0,
            "Operator has already responded to the task"
        );

        // The message that was signed
        bytes32 messageHash = keccak256(
            abi.encodePacked(isSafe, task.contents)
        );
        bytes32 ethSignedMessageHash = messageHash.toEthSignedMessageHash();
        if (ethSignedMessageHash.recover(signature) != msg.sender) {
            revert();
        }

        // updating the storage with task responses
        allTaskResponses[msg.sender][referenceTaskIndex] = signature;

        // emitting event
        emit TaskResponded(referenceTaskIndex, task, isSafe, msg.sender);
    }
}   
