// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IEigenAssetVerifier} from "./IEigenAssetVerifier.sol";

/**
 * @title ILeverageValidator
 * @notice Extended interface for leverage validation using EigenLayer
 * @dev Extends IEigenAssetVerifier with leverage-specific validation functions
 */
interface ILeverageValidator is IEigenAssetVerifier {

    // ============ Additional Structs ============

    struct LeveragePosition {
        address trader;
        address collateralToken;
        address borrowedToken;
        uint256 collateralAmount;
        uint256 borrowedAmount;
        uint256 leverageRatio;
        bool isLongPosition;
        uint256 openTimestamp;
        bytes32 positionId;
    }

    struct BorrowValidation {
        bool canBorrow;
        uint256 maxBorrowAmount;
        uint256 requiredCollateral;
        uint256 liquidationThreshold;
        string reason;
    }

    struct BorrowAuthorization {
        bool authorized;
        uint256 maxAmount;
        uint256 requiredCollateral;
        uint256 utilizationImpact;
        string reason;
    }

    struct PoolUtilization {
        bytes32 poolId;
        uint256 totalLiquidity;
        uint256 borrowedAmount;
        uint256 utilizationRate; // in basis points
        uint256 fundingRate;
        bool isAtCapacity;
    }

    struct ManipulationCheck {
        bool isManipulated;
        uint256 priceDeviation;
        uint256 volumeAnomaly;
        uint256 liquidityChange;
        address[] suspiciousOperators;
    }

    // ============ Additional Events ============

    event LeveragePositionValidated(
        bytes32 indexed positionId,
        address indexed trader,
        bool approved,
        string reason
    );

    event BorrowRequestProcessed(
        bytes32 indexed marketId,
        address indexed borrower,
        uint256 amount,
        bool approved
    );

    event PoolManipulationDetected(
        bytes32 indexed poolId,
        uint256 priceDeviation,
        address[] operators
    );

    event UtilizationThresholdReached(
        bytes32 indexed poolId,
        uint256 utilizationRate,
        uint256 newFundingRate
    );

    // ============ Leverage Validation Functions ============

    /**
     * @notice Validate leverage position request before opening
     * @param position The leverage position details
     * @param operatorSignatures BLS signatures from validating operators
     * @return isValid Whether the position is valid
     * @return reason Explanation if invalid
     */
    function validateLeveragePosition(
        LeveragePosition calldata position,
        bytes[] calldata operatorSignatures
    ) external view returns (bool isValid, string memory reason);

    /**
     * @notice Validate borrow request against pool caps and operator consensus
     * @param marketId The pool/market identifier
     * @param borrower Address requesting to borrow
     * @param borrowToken Token to borrow
     * @param borrowAmount Amount to borrow
     * @param collateralAmount Collateral provided
     * @return validation Detailed borrow validation result
     */
    function validateBorrowRequest(
        bytes32 marketId,
        address borrower,
        address borrowToken,
        uint256 borrowAmount,
        uint256 collateralAmount
    ) external view returns (BorrowValidation memory validation);

    /**
     * @notice Check for pool manipulation using operator consensus
     * @param marketId The pool identifier
     * @param priceData Recent price data for analysis
     * @param volumeData Recent volume data for analysis
     * @return manipulation Manipulation detection results
     */
    function checkPoolManipulation(
        bytes32 marketId,
        bytes calldata priceData,
        bytes calldata volumeData
    ) external view returns (ManipulationCheck memory manipulation);

    /**
     * @notice Get current pool utilization and funding rates
     * @param marketId The pool identifier
     * @return utilization Current pool utilization data
     */
    function getPoolUtilization(
        bytes32 marketId
    ) external view returns (PoolUtilization memory utilization);

    // ============ Cross-Pool Exposure Functions ============

    /**
     * @notice Check if new position would exceed cross-pool exposure limits
     * @param trader Address of the trader
     * @param newPosition Position being opened
     * @return exceedsLimit Whether exposure limits would be exceeded
     * @return currentExposure Current cross-pool exposure
     * @return maxAllowedExposure Maximum allowed exposure
     */
    function checkCrossPoolExposure(
        address trader,
        LeveragePosition calldata newPosition
    ) external view returns (
        bool exceedsLimit,
        uint256 currentExposure,
        uint256 maxAllowedExposure
    );

    /**
     * @notice Get trader's total exposure across all pools
     * @param trader Address of the trader
     * @return totalCollateral Total collateral across all positions
     * @return totalBorrowed Total borrowed across all positions
     * @return netExposure Net exposure (borrowed - collateral)
     */
    function getTraderExposure(
        address trader
    ) external view returns (
        uint256 totalCollateral,
        uint256 totalBorrowed,
        uint256 netExposure
    );

    // ============ Liquidation Functions ============

    /**
     * @notice Check if position should be liquidated
     * @param positionId The position identifier
     * @return shouldLiquidate Whether position should be liquidated
     * @return liquidationPrice Price at which liquidation should occur
     * @return healthFactor Current health factor of position
     */
    function checkLiquidation(
        bytes32 positionId
    ) external view returns (
        bool shouldLiquidate,
        uint256 liquidationPrice,
        uint256 healthFactor
    );

    // ============ Funding Rate Functions ============

    /**
     * @notice Calculate dynamic funding rate based on utilization
     * @param marketId The pool identifier
     * @param targetUtilization Target utilization rate
     * @return fundingRate New funding rate in basis points
     */
    function calculateFundingRate(
        bytes32 marketId,
        uint256 targetUtilization
    ) external view returns (uint256 fundingRate);

    /**
     * @notice Update funding rate for a pool
     * @param marketId The pool identifier
     * @param newFundingRate New funding rate to set
     * @dev Only callable by authorized operators
     */
    function updateFundingRate(
        bytes32 marketId,
        uint256 newFundingRate
    ) external;

    // ============ Emergency Functions ============

    /**
     * @notice Emergency pause for specific pool
     * @param marketId The pool to pause
     * @param reason Reason for pausing
     * @dev Only callable by authorized operators with consensus
     */
    function emergencyPausePool(
        bytes32 marketId,
        string calldata reason
    ) external;

    /**
     * @notice Emergency liquidation of risky positions
     * @param positionIds Array of positions to liquidate
     * @param reason Reason for emergency liquidation
     * @dev Only callable by authorized operators with consensus
     */
    function emergencyLiquidate(
        bytes32[] calldata positionIds,
        string calldata reason
    ) external;
}