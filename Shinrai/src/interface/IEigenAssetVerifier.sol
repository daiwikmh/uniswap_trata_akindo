// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {SwapParams} from "v4-core/types/PoolOperation.sol";
import {IStrategy} from "eigenlayer-contracts/src/contracts/interfaces/IStrategy.sol";
import {IDelegationManager} from "eigenlayer-contracts/src/contracts/interfaces/IDelegationManager.sol";
import {IAVSDirectory} from "eigenlayer-contracts/src/contracts/interfaces/IAVSDirectory.sol";
import {IAllocationManager} from "eigenlayer-contracts/src/contracts/interfaces/IAllocationManager.sol";
import {IRegistryCoordinator} from "@eigenlayer/interfaces/IRegistryCoordinator.sol";
import {IStakeRegistry} from "@eigenlayer/interfaces/IStakeRegistry.sol";
import {IServiceManager} from "@eigenlayer/interfaces/IServiceManager.sol";

/**
 * @title IEigenAssetVerifier
 * @notice Interface for EigenLayer-powered asset verification in polymarket
 * @dev Integrates EigenLayer middleware for operator validation and slashing
 */
interface IEigenAssetVerifier {
    
    // ============ Structs ============
    
    struct OperatorInfo {
        address operator;
        uint256 stakedAmount;
        uint8[] quorums;
        bool isRegistered;
        bool isSlashed;
    }
    
    struct MarketValidation {
        bytes32 marketId;
        address[] validators;
        uint256 requiredStake;
        uint256 validationThreshold;
        bool isActive;
    }
    
    struct SwapValidation {
        bool canSwap;
        string reason;
        uint256 maxSwapAmount;
        address[] requiredValidators;
    }
    
    // ============ Events ============
    
    event OperatorRegistered(address indexed operator, uint8[] quorums, uint256 stake);
    event OperatorSlashed(address indexed operator, bytes32 indexed marketId, uint256 slashedAmount);
    event MarketValidated(bytes32 indexed marketId, address[] validators, bool outcome);
    event SwapValidated(bytes32 indexed marketId, address indexed swapper, uint256 amount);
    
    // ============ Core Functions ============
    
    /**
     * @notice Verify if a swap is allowed based on operator validation
     * @param marketId The unique identifier for the prediction market
     * @param params The swap parameters from Uniswap v4
     * @param hookData Additional data from the hook
     * @return canSwap Whether the swap is allowed
     */
    function verifySwap(
        bytes32 marketId, 
        SwapParams calldata params,
        bytes calldata hookData
    ) external view returns (bool canSwap);
    
    /**
     * @notice Get detailed swap validation information
     * @param marketId The market identifier
     * @param swapper Address attempting to swap
     * @param amount Amount to swap
     * @return validation Detailed validation result
     */
    function getSwapValidation(
        bytes32 marketId,
        address swapper,
        uint256 amount
    ) external view returns (SwapValidation memory validation);
    
    // ============ Operator Management ============
    
    /**
     * @notice Register an operator for market validation
     * @param operator Address of the operator
     * @param quorums Array of quorum numbers to join
     * @param socket Operator's socket information
     */
    function registerOperator(
        address operator,
        uint8[] calldata quorums,
        string calldata socket
    ) external;
    
    /**
     * @notice Deregister an operator from specific quorums
     * @param operator Address of the operator
     * @param quorums Array of quorum numbers to leave
     */
    function deregisterOperator(
        address operator,
        uint8[] calldata quorums
    ) external;
    
    /**
     * @notice Get operator information
     * @param operator Address of the operator
     * @return info Operator details including stake and registration status
     */
    function getOperatorInfo(address operator) external view returns (OperatorInfo memory info);
    
    // ============ Market Management ============
    
    /**
     * @notice Create a new prediction market with validation parameters
     * @param marketId Unique identifier for the market
     * @param requiredStake Minimum stake required for validators
     * @param validationThreshold Minimum number of validators needed
     * @param quorums Quorums that can validate this market
     */
    function createMarket(
        bytes32 marketId,
        uint256 requiredStake,
        uint256 validationThreshold,
        uint8[] calldata quorums
    ) external;
    
    /**
     * @notice Submit market outcome validation
     * @param marketId The market to validate
     * @param outcome The proposed outcome
     * @param signature BLS signature from validator
     */
    function submitMarketValidation(
        bytes32 marketId,
        bool outcome,
        bytes calldata signature
    ) external;
    
    /**
     * @notice Get market validation details
     * @param marketId The market identifier
     * @return validation Market validation information
     */
    function getMarketValidation(bytes32 marketId) external view returns (MarketValidation memory validation);
    
    // ============ Stake Management ============
    
    /**
     * @notice Update operator stake for a specific strategy
     * @param operator Address of the operator
     * @param strategy EigenLayer strategy address
     * @param newStake Updated stake amount
     */
    function updateOperatorStake(
        address operator,
        IStrategy strategy,
        uint256 newStake
    ) external;
    
    /**
     * @notice Check if operator meets minimum stake requirements
     * @param operator Address of the operator
     * @param quorum Quorum number to check
     * @return meetsRequirement Whether operator has sufficient stake
     */
    function checkStakeRequirement(
        address operator,
        uint8 quorum
    ) external view returns (bool meetsRequirement);
    
    // ============ Slashing Functions ============
    
    /**
     * @notice Slash operator for incorrect market validation
     * @param operator Address of the operator to slash
     * @param marketId Market where incorrect validation occurred
     * @param slashAmount Amount to slash
     */
    function slashOperator(
        address operator,
        bytes32 marketId,
        uint256 slashAmount
    ) external;
    
    /**
     * @notice Check if operator is currently slashed
     * @param operator Address of the operator
     * @return isSlashed Whether the operator is slashed
     */
    function isOperatorSlashed(address operator) external view returns (bool isSlashed);
    
    // ============ Registry Integration ============
    
    /**
     * @notice Get the registry coordinator address
     * @return coordinator Address of the RegistryCoordinator
     */
    function getRegistryCoordinator() external view returns (IRegistryCoordinator coordinator);
    
    /**
     * @notice Get the stake registry address
     * @return stakeRegistry Address of the StakeRegistry
     */
    function getStakeRegistry() external view returns (IStakeRegistry stakeRegistry);
    
    /**
     * @notice Get the service manager address
     * @return serviceManager Address of the ServiceManager
     */
    function getServiceManager() external view returns (IServiceManager serviceManager);
    
    // ============ View Functions ============
    
    /**
     * @notice Get total number of registered operators in a quorum
     * @param quorum Quorum number
     * @return count Number of registered operators
     */
    function getOperatorCount(uint8 quorum) external view returns (uint256 count);
    
    /**
     * @notice Get list of active markets
     * @return marketIds Array of active market identifiers
     */
    function getActiveMarkets() external view returns (bytes32[] memory marketIds);
    
    /**
     * @notice Check if a market is currently active
     * @param marketId Market identifier
     * @return isActive Whether the market is active
     */
    function isMarketActive(bytes32 marketId) external view returns (bool isActive);
}