// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ILeverageValidator} from "./interface/ILeverageValidator.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GlobalAssetLedger
 * @notice Central accounting system for tracking borrow balances, caps, and cross-pool exposure
 * @dev Authorizes borrow requests and maintains global state across all pools
 */
contract GlobalAssetLedger is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // ============ State Variables ============

    /// @notice EigenLayer leverage validator
    ILeverageValidator public immutable leverageValidator;

    /// @notice Total system-wide borrow caps per token
    mapping(address => uint256) public globalBorrowCaps;

    /// @notice Current total borrowed amount per token
    mapping(address => uint256) public totalBorrowed;

    /// @notice Pool-specific borrow caps
    mapping(bytes32 => mapping(address => uint256)) public poolBorrowCaps;

    /// @notice Current borrowed amount per pool per token
    mapping(bytes32 => mapping(address => uint256)) public poolBorrowed;

    /// @notice User's total borrowed across all pools per token
    mapping(address => mapping(address => uint256)) public userTotalBorrowed;

    /// @notice User's collateral deposited per token
    mapping(address => mapping(address => uint256)) public userCollateral;

    /// @notice Pool utilization rates (in basis points)
    mapping(bytes32 => uint256) public poolUtilizationRates;

    /// @notice Funding rates per pool (in basis points per day)
    mapping(bytes32 => uint256) public poolFundingRates;

    /// @notice Last funding rate update timestamp per pool
    mapping(bytes32 => uint256) public lastFundingUpdate;

    /// @notice Active positions per user
    mapping(address => bytes32[]) public userActivePositions;

    /// @notice Position details
    mapping(bytes32 => PositionData) public positions;

    /// @notice Authorized margin routers
    mapping(address => bool) public authorizedRouters;

    // ============ Structs ============

    struct PositionData {
        address trader;
        bytes32 poolId;
        address collateralToken;
        address borrowedToken;
        uint256 collateralAmount;
        uint256 borrowedAmount;
        uint256 leverageRatio;
        uint256 openTimestamp;
        uint256 lastFundingPayment;
        bool isActive;
    }

    struct BorrowAuthorization {
        bool authorized;
        uint256 maxAmount;
        uint256 requiredCollateral;
        uint256 utilizationImpact;
        string reason;
    }

    struct SystemMetrics {
        uint256 totalSystemCollateral;
        uint256 totalSystemBorrowed;
        uint256 averageUtilization;
        uint256 activePositions;
        uint256 unhealthyPositions;
    }

    // ============ Events ============

    event BorrowAuthorized(
        bytes32 indexed poolId,
        address indexed user,
        address indexed token,
        uint256 amount,
        uint256 collateral
    );

    event BorrowRepaid(
        bytes32 indexed poolId,
        address indexed user,
        address indexed token,
        uint256 amount
    );

    event CollateralDeposited(
        address indexed user,
        address indexed token,
        uint256 amount
    );

    event CollateralWithdrawn(
        address indexed user,
        address indexed token,
        uint256 amount
    );

    event FundingRateUpdated(
        bytes32 indexed poolId,
        uint256 oldRate,
        uint256 newRate,
        uint256 utilization
    );

    event BorrowCapUpdated(
        bytes32 indexed poolId,
        address indexed token,
        uint256 oldCap,
        uint256 newCap
    );

    event PositionRegistered(
        bytes32 indexed positionId,
        address indexed trader,
        bytes32 indexed poolId
    );

    // ============ Modifiers ============

    modifier onlyAuthorizedRouter() {
        require(authorizedRouters[msg.sender], "GAL: Not authorized router");
        _;
    }

    modifier validPool(bytes32 poolId) {
        require(poolId != bytes32(0), "GAL: Invalid pool");
        _;
    }

    // ============ Constructor ============

    constructor(
        address _leverageValidator,
        address _owner
    ) Ownable(_owner) {
        leverageValidator = ILeverageValidator(_leverageValidator);
    }

    // ============ Borrow Authorization Functions ============

    /**
     * @notice Authorize a borrow request with EigenLayer validation
     * @param poolId The pool identifier
     * @param borrower Address requesting to borrow
     * @param borrowToken Token to borrow
     * @param borrowAmount Amount to borrow
     * @param collateralToken Collateral token
     * @param collateralAmount Collateral amount
     * @return authorization Detailed authorization result
     */
    function authorizeBorrow(
        bytes32 poolId,
        address borrower,
        address borrowToken,
        uint256 borrowAmount,
        address collateralToken,
        uint256 collateralAmount
    ) external onlyAuthorizedRouter validPool(poolId) returns (BorrowAuthorization memory authorization) {

        // Check global borrow caps
        if (totalBorrowed[borrowToken] + borrowAmount > globalBorrowCaps[borrowToken]) {
            return BorrowAuthorization({
                authorized: false,
                maxAmount: globalBorrowCaps[borrowToken] - totalBorrowed[borrowToken],
                requiredCollateral: 0,
                utilizationImpact: 0,
                reason: "Exceeds global borrow cap"
            });
        }

        // Check pool-specific caps
        if (poolBorrowed[poolId][borrowToken] + borrowAmount > poolBorrowCaps[poolId][borrowToken]) {
            return BorrowAuthorization({
                authorized: false,
                maxAmount: poolBorrowCaps[poolId][borrowToken] - poolBorrowed[poolId][borrowToken],
                requiredCollateral: 0,
                utilizationImpact: 0,
                reason: "Exceeds pool borrow cap"
            });
        }

        // Validate through EigenLayer
        ILeverageValidator.BorrowValidation memory eigenValidation = leverageValidator.validateBorrowRequest(
            poolId,
            borrower,
            borrowToken,
            borrowAmount,
            collateralAmount
        );

        if (!eigenValidation.canBorrow) {
            return BorrowAuthorization({
                authorized: false,
                maxAmount: eigenValidation.maxBorrowAmount,
                requiredCollateral: eigenValidation.requiredCollateral,
                utilizationImpact: 0,
                reason: eigenValidation.reason
            });
        }

        // Calculate utilization impact
        uint256 newUtilization = _calculateUtilizationImpact(poolId, borrowToken, borrowAmount);

        // Check if utilization would be too high
        if (newUtilization > 9500) { // 95% max utilization
            return BorrowAuthorization({
                authorized: false,
                maxAmount: eigenValidation.maxBorrowAmount,
                requiredCollateral: eigenValidation.requiredCollateral,
                utilizationImpact: newUtilization,
                reason: "Would exceed max utilization"
            });
        }

        // Authorization approved
        _processBorrowAuthorization(poolId, borrower, borrowToken, borrowAmount, collateralToken, collateralAmount);

        emit BorrowAuthorized(poolId, borrower, borrowToken, borrowAmount, collateralAmount);

        return BorrowAuthorization({
            authorized: true,
            maxAmount: borrowAmount,
            requiredCollateral: eigenValidation.requiredCollateral,
            utilizationImpact: newUtilization,
            reason: "Authorized"
        });
    }

    /**
     * @notice Register a new position in the ledger
     * @param positionId Unique position identifier
     * @param trader Position owner
     * @param poolId Associated pool
     * @param collateralToken Collateral token address
     * @param borrowedToken Borrowed token address
     * @param collateralAmount Amount of collateral
     * @param borrowedAmount Amount borrowed
     * @param leverageRatio Leverage ratio used
     */
    function registerPosition(
        bytes32 positionId,
        address trader,
        bytes32 poolId,
        address collateralToken,
        address borrowedToken,
        uint256 collateralAmount,
        uint256 borrowedAmount,
        uint256 leverageRatio
    ) external onlyAuthorizedRouter {

        positions[positionId] = PositionData({
            trader: trader,
            poolId: poolId,
            collateralToken: collateralToken,
            borrowedToken: borrowedToken,
            collateralAmount: collateralAmount,
            borrowedAmount: borrowedAmount,
            leverageRatio: leverageRatio,
            openTimestamp: block.timestamp,
            lastFundingPayment: block.timestamp,
            isActive: true
        });

        userActivePositions[trader].push(positionId);

        emit PositionRegistered(positionId, trader, poolId);
    }

    /**
     * @notice Repay borrowed amount
     * @param poolId Pool identifier
     * @param borrower Borrower address
     * @param borrowToken Token being repaid
     * @param repayAmount Amount to repay
     */
    function repayBorrow(
        bytes32 poolId,
        address borrower,
        address borrowToken,
        uint256 repayAmount
    ) external onlyAuthorizedRouter {
        require(poolBorrowed[poolId][borrowToken] >= repayAmount, "GAL: Insufficient borrowed balance");
        require(userTotalBorrowed[borrower][borrowToken] >= repayAmount, "GAL: User insufficient balance");

        // Update balances
        poolBorrowed[poolId][borrowToken] -= repayAmount;
        totalBorrowed[borrowToken] -= repayAmount;
        userTotalBorrowed[borrower][borrowToken] -= repayAmount;

        // Update utilization rate
        _updateUtilizationRate(poolId, borrowToken);

        emit BorrowRepaid(poolId, borrower, borrowToken, repayAmount);
    }

    // ============ Collateral Management ============

    /**
     * @notice Deposit collateral
     * @param token Collateral token
     * @param amount Amount to deposit
     */
    function depositCollateral(
        address token,
        uint256 amount
    ) external nonReentrant {
        require(amount > 0, "GAL: Invalid amount");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        userCollateral[msg.sender][token] += amount;

        emit CollateralDeposited(msg.sender, token, amount);
    }

    /**
     * @notice Withdraw collateral
     * @param token Collateral token
     * @param amount Amount to withdraw
     */
    function withdrawCollateral(
        address token,
        uint256 amount
    ) external nonReentrant {
        require(userCollateral[msg.sender][token] >= amount, "GAL: Insufficient collateral");

        // Check if withdrawal would make positions unhealthy
        require(_canWithdrawCollateral(msg.sender, token, amount), "GAL: Would make positions unhealthy");

        userCollateral[msg.sender][token] -= amount;
        IERC20(token).safeTransfer(msg.sender, amount);

        emit CollateralWithdrawn(msg.sender, token, amount);
    }

    // ============ Funding Rate Management ============

    /**
     * @notice Update funding rate for a pool based on utilization
     * @param poolId Pool identifier
     */
    function updateFundingRate(bytes32 poolId) external {
        uint256 utilization = poolUtilizationRates[poolId];
        uint256 newFundingRate = leverageValidator.calculateFundingRate(poolId, 8000); // Target 80% utilization

        uint256 oldRate = poolFundingRates[poolId];
        poolFundingRates[poolId] = newFundingRate;
        lastFundingUpdate[poolId] = block.timestamp;

        // Update through EigenLayer
        leverageValidator.updateFundingRate(poolId, newFundingRate);

        emit FundingRateUpdated(poolId, oldRate, newFundingRate, utilization);
    }

    // ============ View Functions ============

    /**
     * @notice Get system-wide metrics
     * @return metrics Overall system health metrics
     */
    function getSystemMetrics() external view returns (SystemMetrics memory metrics) {
        // Implementation would aggregate across all pools and users
        return SystemMetrics({
            totalSystemCollateral: 0, // Calculate actual values
            totalSystemBorrowed: 0,
            averageUtilization: 0,
            activePositions: 0,
            unhealthyPositions: 0
        });
    }

    /**
     * @notice Get user's total exposure
     * @param user User address
     * @return totalCollateral Total collateral across all tokens
     * @return totalBorrowed Total borrowed across all tokens
     */
    function getUserExposure(
        address user
    ) external view returns (uint256 totalCollateral, uint256 totalBorrowed) {
        // Implementation would sum across all tokens
        return (0, 0); // Placeholder
    }

    /**
     * @notice Get pool utilization
     * @param poolId Pool identifier
     * @param token Token address
     * @return utilization Current utilization rate in basis points
     */
    function getPoolUtilization(
        bytes32 poolId,
        address token
    ) external view returns (uint256 utilization) {
        return poolUtilizationRates[poolId];
    }

    // ============ Admin Functions ============

    /**
     * @notice Set global borrow cap for a token
     * @param token Token address
     * @param cap New borrow cap
     */
    function setGlobalBorrowCap(address token, uint256 cap) external onlyOwner {
        globalBorrowCaps[token] = cap;
    }

    /**
     * @notice Set pool-specific borrow cap
     * @param poolId Pool identifier
     * @param token Token address
     * @param cap New borrow cap
     */
    function setPoolBorrowCap(
        bytes32 poolId,
        address token,
        uint256 cap
    ) external onlyOwner {
        uint256 oldCap = poolBorrowCaps[poolId][token];
        poolBorrowCaps[poolId][token] = cap;

        emit BorrowCapUpdated(poolId, token, oldCap, cap);
    }

    /**
     * @notice Authorize a margin router
     * @param router Router address
     * @param authorized Whether to authorize
     */
    function setAuthorizedRouter(address router, bool authorized) external onlyOwner {
        authorizedRouters[router] = authorized;
    }

    // ============ Internal Functions ============

    /**
     * @notice Process borrow authorization and update state
     */
    function _processBorrowAuthorization(
        bytes32 poolId,
        address borrower,
        address borrowToken,
        uint256 borrowAmount,
        address collateralToken,
        uint256 collateralAmount
    ) internal {
        // Update borrow balances
        totalBorrowed[borrowToken] += borrowAmount;
        poolBorrowed[poolId][borrowToken] += borrowAmount;
        userTotalBorrowed[borrower][borrowToken] += borrowAmount;

        // Update collateral if provided
        if (collateralAmount > 0) {
            userCollateral[borrower][collateralToken] += collateralAmount;
        }

        // Update utilization rate
        _updateUtilizationRate(poolId, borrowToken);
    }

    /**
     * @notice Calculate utilization impact of new borrow
     */
    function _calculateUtilizationImpact(
        bytes32 poolId,
        address token,
        uint256 borrowAmount
    ) internal view returns (uint256 newUtilization) {
        ILeverageValidator.PoolUtilization memory poolUtil = leverageValidator.getPoolUtilization(poolId);

        if (poolUtil.totalLiquidity == 0) return 0;

        uint256 newBorrowed = poolUtil.borrowedAmount + borrowAmount;
        return (newBorrowed * 10000) / poolUtil.totalLiquidity;
    }

    /**
     * @notice Update pool utilization rate
     */
    function _updateUtilizationRate(bytes32 poolId, address token) internal {
        ILeverageValidator.PoolUtilization memory poolUtil = leverageValidator.getPoolUtilization(poolId);
        poolUtilizationRates[poolId] = poolUtil.utilizationRate;
    }

    /**
     * @notice Check if user can withdraw collateral safely
     */
    function _canWithdrawCollateral(
        address user,
        address token,
        uint256 amount
    ) internal view returns (bool) {
        // Check all user's positions to ensure they remain healthy
        bytes32[] memory userPositions = userActivePositions[user];

        for (uint256 i = 0; i < userPositions.length; i++) {
            (bool shouldLiquidate,,) = leverageValidator.checkLiquidation(userPositions[i]);
            if (shouldLiquidate) return false;
        }

        return true;
    }
}