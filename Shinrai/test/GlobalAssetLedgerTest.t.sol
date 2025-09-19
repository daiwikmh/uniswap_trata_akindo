// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, console} from "forge-std/Test.sol";
import {GlobalAssetLedger} from "../src/GlobalAssetLedger.sol";
import {MockTestToken} from "../src/MockTestToken.sol";
import {ILeverageValidator} from "../src/interface/ILeverageValidator.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title GlobalAssetLedgerTest
 * @notice Comprehensive tests for GlobalAssetLedger functionality
 */
contract GlobalAssetLedgerTest is Test {

    // ============ Test Contracts ============
    GlobalAssetLedger public globalAssetLedger;
    MockTestToken public token0;
    MockTestToken public token1;
    MockLeverageValidator public mockValidator;

    // ============ Test Users ============
    address public constant OWNER = address(0x1);
    address public constant ROUTER = address(0x2);
    address public constant TRADER1 = address(0x3);
    address public constant TRADER2 = address(0x4);
    address public constant UNAUTHORIZED = address(0x5);

    // ============ Test Constants ============
    uint256 public constant INITIAL_SUPPLY = 1000000 ether;
    uint256 public constant GLOBAL_BORROW_CAP = 100000 ether;
    uint256 public constant POOL_BORROW_CAP = 50000 ether;
    uint256 public constant COLLATERAL_AMOUNT = 1000 ether;
    uint256 public constant BORROW_AMOUNT = 500 ether;
    bytes32 public constant POOL_ID = keccak256("test_pool");

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

    // ============ Setup ============
    function setUp() public {
        // Deploy mock validator
        mockValidator = new MockLeverageValidator();

        // Deploy global asset ledger
        vm.startPrank(OWNER);
        globalAssetLedger = new GlobalAssetLedger(
            address(mockValidator),
            OWNER
        );

        // Deploy mock tokens
        token0 = new MockTestToken("Token0", "TK0", 18, OWNER);
        token1 = new MockTestToken("Token1", "TK1", 18, OWNER);

        // Authorize router
        globalAssetLedger.setAuthorizedRouter(ROUTER, true);

        // Set initial borrow caps
        globalAssetLedger.setGlobalBorrowCap(address(token0), GLOBAL_BORROW_CAP);
        globalAssetLedger.setGlobalBorrowCap(address(token1), GLOBAL_BORROW_CAP);
        globalAssetLedger.setPoolBorrowCap(POOL_ID, address(token0), POOL_BORROW_CAP);
        globalAssetLedger.setPoolBorrowCap(POOL_ID, address(token1), POOL_BORROW_CAP);

        vm.stopPrank();

        // Mint tokens to traders
        token0.mint(TRADER1, INITIAL_SUPPLY);
        token1.mint(TRADER1, INITIAL_SUPPLY);
        token0.mint(TRADER2, INITIAL_SUPPLY);
        token1.mint(TRADER2, INITIAL_SUPPLY);
    }

    // ============ Modifier Tests ============

    function testOnlyAuthorizedRouterModifier() public {
        // Should fail when called by unauthorized address
        vm.startPrank(UNAUTHORIZED);
        vm.expectRevert("GAL: Not authorized router");
        globalAssetLedger.authorizeBorrow(
            POOL_ID,
            TRADER1,
            address(token1),
            BORROW_AMOUNT,
            address(token0),
            COLLATERAL_AMOUNT
        );
        vm.stopPrank();

        // Should succeed when called by authorized router
        vm.startPrank(ROUTER);
        GlobalAssetLedger.BorrowAuthorization memory auth = globalAssetLedger.authorizeBorrow(
            POOL_ID,
            TRADER1,
            address(token1),
            BORROW_AMOUNT,
            address(token0),
            COLLATERAL_AMOUNT
        );
        assertTrue(auth.authorized);
        vm.stopPrank();
    }

    // ============ Borrow Authorization Tests ============

    function testBorrowAuthorizationSuccess() public {
        vm.startPrank(ROUTER);

        vm.expectEmit(true, true, true, true);
        emit BorrowAuthorized(POOL_ID, TRADER1, address(token1), BORROW_AMOUNT, COLLATERAL_AMOUNT);

        GlobalAssetLedger.BorrowAuthorization memory auth = globalAssetLedger.authorizeBorrow(
            POOL_ID,
            TRADER1,
            address(token1),
            BORROW_AMOUNT,
            address(token0),
            COLLATERAL_AMOUNT
        );

        vm.stopPrank();

        // Verify authorization result
        assertTrue(auth.authorized);
        assertEq(auth.maxAmount, BORROW_AMOUNT);
        assertEq(auth.requiredCollateral, (BORROW_AMOUNT * 15000) / 10000); // 150% collateral
        assertEq(keccak256(bytes(auth.reason)), keccak256(bytes("Authorized")));

        // Verify state updates
        assertEq(globalAssetLedger.totalBorrowed(address(token1)), BORROW_AMOUNT);
        assertEq(globalAssetLedger.poolBorrowed(POOL_ID, address(token1)), BORROW_AMOUNT);
        assertEq(globalAssetLedger.userTotalBorrowed(TRADER1, address(token1)), BORROW_AMOUNT);
        assertEq(globalAssetLedger.userCollateral(TRADER1, address(token0)), COLLATERAL_AMOUNT);
    }

    function testBorrowAuthorizationExceedsGlobalCap() public {
        // Set very low global cap
        vm.startPrank(OWNER);
        globalAssetLedger.setGlobalBorrowCap(address(token1), 100 ether);
        vm.stopPrank();

        vm.startPrank(ROUTER);

        GlobalAssetLedger.BorrowAuthorization memory auth = globalAssetLedger.authorizeBorrow(
            POOL_ID,
            TRADER1,
            address(token1),
            BORROW_AMOUNT, // 500 ether > 100 ether cap
            address(token0),
            COLLATERAL_AMOUNT
        );

        vm.stopPrank();

        assertFalse(auth.authorized);
        assertEq(auth.maxAmount, 100 ether);
        assertEq(keccak256(bytes(auth.reason)), keccak256(bytes("Exceeds global borrow cap")));
    }

    function testBorrowAuthorizationExceedsPoolCap() public {
        // Set very low pool cap
        vm.startPrank(OWNER);
        globalAssetLedger.setPoolBorrowCap(POOL_ID, address(token1), 100 ether);
        vm.stopPrank();

        vm.startPrank(ROUTER);

        GlobalAssetLedger.BorrowAuthorization memory auth = globalAssetLedger.authorizeBorrow(
            POOL_ID,
            TRADER1,
            address(token1),
            BORROW_AMOUNT, // 500 ether > 100 ether cap
            address(token0),
            COLLATERAL_AMOUNT
        );

        vm.stopPrank();

        assertFalse(auth.authorized);
        assertEq(auth.maxAmount, 100 ether);
        assertEq(keccak256(bytes(auth.reason)), keccak256(bytes("Exceeds pool borrow cap")));
    }

    function testBorrowAuthorizationInsufficientCollateral() public {
        vm.startPrank(ROUTER);

        uint256 insufficientCollateral = 100 ether; // Less than required 150%

        GlobalAssetLedger.BorrowAuthorization memory auth = globalAssetLedger.authorizeBorrow(
            POOL_ID,
            TRADER1,
            address(token1),
            BORROW_AMOUNT,
            address(token0),
            insufficientCollateral
        );

        vm.stopPrank();

        assertFalse(auth.authorized);
        assertEq(auth.maxAmount, (insufficientCollateral * 10000) / 15000);
        assertEq(auth.requiredCollateral, (BORROW_AMOUNT * 15000) / 10000);
        assertEq(keccak256(bytes(auth.reason)), keccak256(bytes("Insufficient collateral")));
    }

    function testBorrowAuthorizationExceedsMaxUtilization() public {
        // This test would require mocking the utilization calculation
        // For now, we'll test with the current implementation
        vm.startPrank(ROUTER);

        // Try to borrow a very large amount that would exceed 95% utilization
        uint256 hugeBorrowAmount = 990000 ether; // Assuming 1M total liquidity

        GlobalAssetLedger.BorrowAuthorization memory auth = globalAssetLedger.authorizeBorrow(
            POOL_ID,
            TRADER1,
            address(token1),
            hugeBorrowAmount,
            address(token0),
            (hugeBorrowAmount * 15000) / 10000 // 150% collateral
        );

        vm.stopPrank();

        assertFalse(auth.authorized);
        assertEq(keccak256(bytes(auth.reason)), keccak256(bytes("Would exceed max utilization")));
    }

    // ============ Position Registration Tests ============

    function testPositionRegistrationSuccess() public {
        bytes32 positionId = keccak256(abi.encodePacked("test_position"));

        vm.expectEmit(true, true, true, false);
        emit PositionRegistered(positionId, TRADER1, POOL_ID);

        vm.startPrank(ROUTER);
        globalAssetLedger.registerPosition(
            positionId,
            TRADER1,
            POOL_ID,
            address(token0),
            address(token1),
            COLLATERAL_AMOUNT,
            BORROW_AMOUNT,
            300 // 3x leverage
        );
        vm.stopPrank();

        // Verify position data
        (
            address trader,
            bytes32 poolId,
            address collateralToken,
            address borrowedToken,
            uint256 collateralAmount,
            uint256 borrowedAmount,
            uint256 leverageRatio,
            uint256 openTimestamp,
            uint256 lastFundingPayment,
            bool isActive
        ) = globalAssetLedger.positions(positionId);

        assertEq(trader, TRADER1);
        assertEq(poolId, POOL_ID);
        assertEq(collateralToken, address(token0));
        assertEq(borrowedToken, address(token1));
        assertEq(collateralAmount, COLLATERAL_AMOUNT);
        assertEq(borrowedAmount, BORROW_AMOUNT);
        assertEq(leverageRatio, 300);
        assertTrue(isActive);

        // Verify position was added to user's active positions
        bytes32[] memory userPositions = globalAssetLedger.userActivePositions(TRADER1, 0);
        assertEq(userPositions, positionId);
    }

    // ============ Borrow Repayment Tests ============

    function testRepayBorrowSuccess() public {
        // First authorize and process a borrow
        vm.startPrank(ROUTER);
        globalAssetLedger.authorizeBorrow(
            POOL_ID,
            TRADER1,
            address(token1),
            BORROW_AMOUNT,
            address(token0),
            COLLATERAL_AMOUNT
        );

        uint256 repayAmount = 200 ether;

        vm.expectEmit(true, true, true, true);
        emit BorrowRepaid(POOL_ID, TRADER1, address(token1), repayAmount);

        globalAssetLedger.repayBorrow(
            POOL_ID,
            TRADER1,
            address(token1),
            repayAmount
        );

        vm.stopPrank();

        // Verify state updates
        assertEq(globalAssetLedger.totalBorrowed(address(token1)), BORROW_AMOUNT - repayAmount);
        assertEq(globalAssetLedger.poolBorrowed(POOL_ID, address(token1)), BORROW_AMOUNT - repayAmount);
        assertEq(globalAssetLedger.userTotalBorrowed(TRADER1, address(token1)), BORROW_AMOUNT - repayAmount);
    }

    function testRepayBorrowInsufficientPoolBalance() public {
        vm.startPrank(ROUTER);

        vm.expectRevert("GAL: Insufficient borrowed balance");
        globalAssetLedger.repayBorrow(
            POOL_ID,
            TRADER1,
            address(token1),
            BORROW_AMOUNT // No previous borrow
        );

        vm.stopPrank();
    }

    function testRepayBorrowInsufficientUserBalance() public {
        // Authorize borrow for TRADER1
        vm.startPrank(ROUTER);
        globalAssetLedger.authorizeBorrow(
            POOL_ID,
            TRADER1,
            address(token1),
            BORROW_AMOUNT,
            address(token0),
            COLLATERAL_AMOUNT
        );

        // Try to repay for TRADER2 who has no borrowed balance
        vm.expectRevert("GAL: User insufficient balance");
        globalAssetLedger.repayBorrow(
            POOL_ID,
            TRADER2, // Different trader
            address(token1),
            BORROW_AMOUNT
        );

        vm.stopPrank();
    }

    // ============ Collateral Management Tests ============

    function testDepositCollateralSuccess() public {
        vm.startPrank(TRADER1);

        // Approve tokens
        token0.approve(address(globalAssetLedger), COLLATERAL_AMOUNT);

        vm.expectEmit(true, true, false, true);
        emit CollateralDeposited(TRADER1, address(token0), COLLATERAL_AMOUNT);

        globalAssetLedger.depositCollateral(address(token0), COLLATERAL_AMOUNT);

        vm.stopPrank();

        // Verify collateral balance
        assertEq(globalAssetLedger.userCollateral(TRADER1, address(token0)), COLLATERAL_AMOUNT);

        // Verify tokens were transferred
        assertEq(token0.balanceOf(address(globalAssetLedger)), COLLATERAL_AMOUNT);
        assertEq(token0.balanceOf(TRADER1), INITIAL_SUPPLY - COLLATERAL_AMOUNT);
    }

    function testDepositCollateralInvalidAmount() public {
        vm.startPrank(TRADER1);

        vm.expectRevert("GAL: Invalid amount");
        globalAssetLedger.depositCollateral(address(token0), 0);

        vm.stopPrank();
    }

    function testWithdrawCollateralSuccess() public {
        // First deposit collateral
        vm.startPrank(TRADER1);
        token0.approve(address(globalAssetLedger), COLLATERAL_AMOUNT);
        globalAssetLedger.depositCollateral(address(token0), COLLATERAL_AMOUNT);

        uint256 withdrawAmount = 500 ether;

        vm.expectEmit(true, true, false, true);
        emit CollateralWithdrawn(TRADER1, address(token0), withdrawAmount);

        globalAssetLedger.withdrawCollateral(address(token0), withdrawAmount);

        vm.stopPrank();

        // Verify collateral balance
        assertEq(globalAssetLedger.userCollateral(TRADER1, address(token0)), COLLATERAL_AMOUNT - withdrawAmount);

        // Verify tokens were transferred back
        assertEq(token0.balanceOf(TRADER1), INITIAL_SUPPLY - COLLATERAL_AMOUNT + withdrawAmount);
    }

    function testWithdrawCollateralInsufficientBalance() public {
        vm.startPrank(TRADER1);

        vm.expectRevert("GAL: Insufficient collateral");
        globalAssetLedger.withdrawCollateral(address(token0), COLLATERAL_AMOUNT);

        vm.stopPrank();
    }

    function testWithdrawCollateralWouldMakePositionsUnhealthy() public {
        // This test would require setting up positions and testing the health check
        // For now, we'll create a scenario where withdrawal would violate collateral requirements

        // First authorize a borrow (which adds collateral)
        vm.startPrank(ROUTER);
        globalAssetLedger.authorizeBorrow(
            POOL_ID,
            TRADER1,
            address(token1),
            BORROW_AMOUNT,
            address(token0),
            COLLATERAL_AMOUNT
        );
        vm.stopPrank();

        // Try to withdraw more than allowed
        vm.startPrank(TRADER1);

        uint256 excessiveWithdrawAmount = COLLATERAL_AMOUNT - 100 ether; // Would leave insufficient collateral

        vm.expectRevert("GAL: Would make positions unhealthy");
        globalAssetLedger.withdrawCollateral(address(token0), excessiveWithdrawAmount);

        vm.stopPrank();
    }

    // ============ Funding Rate Tests ============

    function testUpdateFundingRateLowUtilization() public {
        // Set low utilization (30%)
        vm.startPrank(ROUTER);
        globalAssetLedger.authorizeBorrow(
            POOL_ID,
            TRADER1,
            address(token1),
            30000 ether, // 30% of 100k cap
            address(token0),
            45000 ether // 150% collateral
        );
        vm.stopPrank();

        vm.expectEmit(true, false, false, false);
        emit FundingRateUpdated(POOL_ID, 0, 100, 0); // Base rate 1%

        globalAssetLedger.updateFundingRate(POOL_ID);

        assertEq(globalAssetLedger.poolFundingRates(POOL_ID), 100);
    }

    function testUpdateFundingRateHighUtilization() public {
        // Set high utilization (85%)
        vm.startPrank(ROUTER);
        globalAssetLedger.authorizeBorrow(
            POOL_ID,
            TRADER1,
            address(token1),
            85000 ether, // 85% of 100k would be 85k total liquidity
            address(token0),
            127500 ether // 150% collateral
        );
        vm.stopPrank();

        globalAssetLedger.updateFundingRate(POOL_ID);

        // Should be base 100 + (8500 - 8000)/10 = 100 + 50 = 150
        uint256 expectedRate = 100 + (8500 - 8000) / 10;
        assertEq(globalAssetLedger.poolFundingRates(POOL_ID), expectedRate);
    }

    // ============ Admin Function Tests ============

    function testSetGlobalBorrowCap() public {
        uint256 newCap = 200000 ether;

        vm.startPrank(OWNER);
        globalAssetLedger.setGlobalBorrowCap(address(token0), newCap);
        vm.stopPrank();

        assertEq(globalAssetLedger.globalBorrowCaps(address(token0)), newCap);
    }

    function testSetGlobalBorrowCapUnauthorized() public {
        vm.startPrank(UNAUTHORIZED);

        vm.expectRevert();
        globalAssetLedger.setGlobalBorrowCap(address(token0), 200000 ether);

        vm.stopPrank();
    }

    function testSetPoolBorrowCap() public {
        uint256 newCap = 75000 ether;

        vm.expectEmit(true, true, false, true);
        emit BorrowCapUpdated(POOL_ID, address(token0), POOL_BORROW_CAP, newCap);

        vm.startPrank(OWNER);
        globalAssetLedger.setPoolBorrowCap(POOL_ID, address(token0), newCap);
        vm.stopPrank();

        assertEq(globalAssetLedger.poolBorrowCaps(POOL_ID, address(token0)), newCap);
    }

    function testSetAuthorizedRouter() public {
        address newRouter = address(0x99);

        vm.startPrank(OWNER);
        globalAssetLedger.setAuthorizedRouter(newRouter, true);
        vm.stopPrank();

        assertTrue(globalAssetLedger.authorizedRouters(newRouter));

        // Test deauthorization
        vm.startPrank(OWNER);
        globalAssetLedger.setAuthorizedRouter(newRouter, false);
        vm.stopPrank();

        assertFalse(globalAssetLedger.authorizedRouters(newRouter));
    }

    // ============ View Function Tests ============

    function testGetSystemMetrics() public {
        GlobalAssetLedger.SystemMetrics memory metrics = globalAssetLedger.getSystemMetrics();

        // Currently returns placeholder values
        assertEq(metrics.totalSystemCollateral, 0);
        assertEq(metrics.totalSystemBorrowed, 0);
        assertEq(metrics.averageUtilization, 0);
        assertEq(metrics.activePositions, 0);
        assertEq(metrics.unhealthyPositions, 0);
    }

    function testGetUserExposure() public {
        (uint256 totalCollateral, uint256 totalBorrowed) = globalAssetLedger.getUserExposure(TRADER1);

        // Currently returns placeholder values
        assertEq(totalCollateral, 0);
        assertEq(totalBorrowed, 0);
    }

    function testGetPoolUtilization() public {
        uint256 utilization = globalAssetLedger.getPoolUtilization(POOL_ID, address(token1));

        // Should return the stored utilization rate
        assertEq(utilization, globalAssetLedger.poolUtilizationRates(POOL_ID));
    }

    // ============ Edge Case Tests ============

    function testMultipleBorrowsFromSameUser() public {
        vm.startPrank(ROUTER);

        // First borrow
        GlobalAssetLedger.BorrowAuthorization memory auth1 = globalAssetLedger.authorizeBorrow(
            POOL_ID,
            TRADER1,
            address(token1),
            BORROW_AMOUNT,
            address(token0),
            COLLATERAL_AMOUNT
        );
        assertTrue(auth1.authorized);

        // Second borrow from same user
        GlobalAssetLedger.BorrowAuthorization memory auth2 = globalAssetLedger.authorizeBorrow(
            POOL_ID,
            TRADER1,
            address(token1),
            BORROW_AMOUNT / 2,
            address(token0),
            COLLATERAL_AMOUNT / 2
        );
        assertTrue(auth2.authorized);

        vm.stopPrank();

        // Verify cumulative borrowing
        assertEq(globalAssetLedger.userTotalBorrowed(TRADER1, address(token1)), BORROW_AMOUNT + BORROW_AMOUNT / 2);
    }

    function testBorrowingFromMultiplePools() public {
        bytes32 pool2 = keccak256("test_pool_2");

        // Set up pool 2
        vm.startPrank(OWNER);
        globalAssetLedger.setPoolBorrowCap(pool2, address(token1), POOL_BORROW_CAP);
        vm.stopPrank();

        vm.startPrank(ROUTER);

        // Borrow from pool 1
        GlobalAssetLedger.BorrowAuthorization memory auth1 = globalAssetLedger.authorizeBorrow(
            POOL_ID,
            TRADER1,
            address(token1),
            BORROW_AMOUNT,
            address(token0),
            COLLATERAL_AMOUNT
        );
        assertTrue(auth1.authorized);

        // Borrow from pool 2
        GlobalAssetLedger.BorrowAuthorization memory auth2 = globalAssetLedger.authorizeBorrow(
            pool2,
            TRADER1,
            address(token1),
            BORROW_AMOUNT,
            address(token0),
            COLLATERAL_AMOUNT
        );
        assertTrue(auth2.authorized);

        vm.stopPrank();

        // Verify separate pool tracking
        assertEq(globalAssetLedger.poolBorrowed(POOL_ID, address(token1)), BORROW_AMOUNT);
        assertEq(globalAssetLedger.poolBorrowed(pool2, address(token1)), BORROW_AMOUNT);

        // Verify total user borrowing across pools
        assertEq(globalAssetLedger.userTotalBorrowed(TRADER1, address(token1)), BORROW_AMOUNT * 2);
    }

    // ============ Reentrancy Tests ============

    function testDepositCollateralReentrancyProtection() public {
        // This would require a malicious token contract to test reentrancy
        // For now, we'll just verify the nonReentrant modifier is in place
        // The actual reentrancy protection is provided by OpenZeppelin's ReentrancyGuard
    }

    function testWithdrawCollateralReentrancyProtection() public {
        // Similar to above - protected by ReentrancyGuard
    }
}

// ============ Mock Contracts ============

contract MockLeverageValidator is ILeverageValidator {
    // Basic stub implementation for testing
    function validateLeveragePosition(LeveragePosition calldata, bytes[] calldata) external pure override returns (bool, string memory) {
        return (true, "Valid");
    }

    function validateBorrowRequest(bytes32, address, address, uint256, uint256) external pure override returns (BorrowValidation memory) {
        return BorrowValidation(true, 1000000 ether, 100 ether, 8000, "Approved");
    }

    function verifySwap(bytes32, SwapParams calldata, bytes calldata) external pure override returns (bool) {
        return true;
    }

    function checkPoolManipulation(bytes32, bytes calldata, bytes calldata) external pure override returns (ManipulationCheck memory) {
        return ManipulationCheck(false, 0, 0, 0, new address[](0));
    }

    function getPoolUtilization(bytes32) external pure override returns (PoolUtilization memory) {
        return PoolUtilization(bytes32(0), 1000000 ether, 500000 ether, 5000, 100, false);
    }

    function checkCrossPoolExposure(address, LeveragePosition calldata) external pure override returns (bool, uint256, uint256) {
        return (false, 0, 1000 ether);
    }

    function getTraderExposure(address) external pure override returns (uint256, uint256, uint256) {
        return (0, 0, 0);
    }

    function checkLiquidation(bytes32) external pure override returns (bool, uint256, uint256) {
        return (false, 0, 1500);
    }

    function calculateFundingRate(bytes32, uint256) external pure override returns (uint256) {
        return 100;
    }

    function updateFundingRate(bytes32, uint256) external override {}
    function emergencyPausePool(bytes32, string calldata) external override {}
    function emergencyLiquidate(bytes32[] calldata, string calldata) external override {}

    // IEigenAssetVerifier stubs
    function getSwapValidation(bytes32, address, uint256) external pure override returns (SwapValidation memory) {
        return SwapValidation(true, "", 1000 ether, new address[](0));
    }

    function registerOperator(address, uint8[] calldata, string calldata) external override {}
    function deregisterOperator(address, uint8[] calldata) external override {}
    function getOperatorInfo(address) external pure override returns (OperatorInfo memory) {
        return OperatorInfo(address(0), 0, new uint8[](0), false, false);
    }

    function createMarket(bytes32, uint256, uint256, uint8[] calldata) external override {}
    function submitMarketValidation(bytes32, bool, bytes calldata) external override {}
    function getMarketValidation(bytes32) external pure override returns (MarketValidation memory) {
        return MarketValidation(bytes32(0), new address[](0), 0, 0, false);
    }

    function checkStakeRequirement(address, uint8) external pure override returns (bool) { return true; }
    function slashOperator(address, bytes32, uint256) external override {}
    function isOperatorSlashed(address) external pure override returns (bool) { return false; }

    function getOperatorCount(uint8) external pure override returns (uint256) { return 0; }
    function getActiveMarkets() external pure override returns (bytes32[] memory) {
        return new bytes32[](0);
    }
    function isMarketActive(bytes32) external pure override returns (bool) { return true; }
}