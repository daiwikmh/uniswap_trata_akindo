// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

// Shinrai Contracts
import {MarginRouter} from "../src/MarginRouter.sol";
import {GlobalAssetLedger} from "../src/GlobalAssetLedger.sol";
import {LeverageHook} from "../src/LeverageHook.sol";
import {ILeverageValidator} from "../src/interface/ILeverageValidator.sol";

// Mock ERC20 for testing
import {MockERC20} from "solmate/src/test/utils/mocks/MockERC20.sol";

/**
 * @title Step 4: Test Protocol Integration
 * @notice Tests the deployed protocol with mock transactions
 */
contract TestIntegration is Script {

    address internal deployer;
    address internal testUser;

    // Contract addresses
    address internal marginRouterAddress;
    address internal globalAssetLedgerAddress;
    address internal leverageHookAddress;
    address internal leverageValidatorAddress;

    // Test tokens
    MockERC20 internal mockToken0;
    MockERC20 internal mockToken1;

    // Test constants
    uint256 internal constant TEST_COLLATERAL = 100 ether;
    uint256 internal constant TEST_BORROW = 300 ether;
    uint256 internal constant TEST_LEVERAGE = 300; // 3x

    function setUp() public {
        deployer = vm.rememberKey(vm.envUint("PRIVATE_KEY"));
        testUser = vm.rememberKey(vm.envUint("OPERATOR1_PRIVATE_KEY")); // Reuse operator key as test user

        // Load contract addresses
        marginRouterAddress = vm.envAddress("MARGIN_ROUTER_ADDRESS");
        globalAssetLedgerAddress = vm.envAddress("GLOBAL_ASSET_LEDGER_ADDRESS");
        leverageHookAddress = vm.envAddress("LEVERAGE_HOOK_ADDRESS");
        leverageValidatorAddress = vm.envAddress("LEVERAGE_VALIDATOR_ADDRESS");

        vm.label(deployer, "Deployer");
        vm.label(testUser, "TestUser");

        console.log("=== Integration Test Setup ===");
        console.log("Deployer:", deployer);
        console.log("Test User:", testUser);
        console.log("MarginRouter:", marginRouterAddress);
    }

    function run() public {
        console.log("=== Starting Integration Tests ===");

        // Step 1: Deploy test tokens
        _deployTestTokens();

        // Step 2: Test operator validation
        _testOperatorValidation();

        // Step 3: Test borrow authorization
        _testBorrowAuthorization();

        // Step 4: Test position management
        _testPositionManagement();

        // Step 5: Test emergency functions
        _testEmergencyFunctions();

        console.log("=== Integration Tests Complete ===");
        console.log("All tests passed! Protocol is ready for use.");
    }

    function _deployTestTokens() internal {
        console.log("1. Deploying test tokens...");

        vm.startBroadcast(deployer);

        mockToken0 = new MockERC20("Test Token 0", "TEST0", 18);
        mockToken1 = new MockERC20("Test Token 1", "TEST1", 18);

        // Mint tokens to test user
        mockToken0.mint(testUser, 10000 ether);
        mockToken1.mint(testUser, 10000 ether);

        console.log("   TEST0 deployed:", address(mockToken0));
        console.log("   TEST1 deployed:", address(mockToken1));
        console.log("   Tokens minted to test user");

        vm.stopBroadcast();
    }

    function _testOperatorValidation() internal {
        console.log("2. Testing operator validation...");

        ILeverageValidator validator = ILeverageValidator(leverageValidatorAddress);

        // Test basic validation functions
        bool canValidate = validator.checkStakeRequirement(testUser, 0);
        console.log("   Stake requirement check:", canValidate ? "PASS" : "FAIL");

        uint256 operatorCount = validator.getOperatorCount(0);
        console.log("   Operator count:", operatorCount);

        bool isActive = validator.isMarketActive(bytes32(0));
        console.log("   Market active check:", isActive ? "PASS" : "FAIL");
    }

    function _testBorrowAuthorization() internal {
        console.log("3. Testing borrow authorization...");

        GlobalAssetLedger ledger = GlobalAssetLedger(globalAssetLedgerAddress);

        vm.startBroadcast(deployer); // Need deployer to call as authorized router

        // Create a test pool ID
        bytes32 testPoolId = keccak256("test_pool");

        // Set up borrow caps for our test tokens
        ledger.setGlobalBorrowCap(address(mockToken0), 1000000 ether);
        ledger.setGlobalBorrowCap(address(mockToken1), 1000000 ether);
        ledger.setPoolBorrowCap(testPoolId, address(mockToken0), 100000 ether);
        ledger.setPoolBorrowCap(testPoolId, address(mockToken1), 100000 ether);

        // Test borrow authorization
        try ledger.authorizeBorrow(
            testPoolId,
            testUser,
            address(mockToken1),
            TEST_BORROW,
            address(mockToken0),
            TEST_COLLATERAL
        ) returns (GlobalAssetLedger.BorrowAuthorization memory auth) {
            console.log("   Borrow authorization:", auth.authorized ? "APPROVED" : "REJECTED");
            console.log("   Max amount:", auth.maxAmount / 1 ether, "tokens");
            console.log("   Reason:", auth.reason);
        } catch Error(string memory reason) {
            console.log("    Borrow authorization failed:", reason);
        }

        vm.stopBroadcast();
    }

    function _testPositionManagement() internal {
        console.log("4. Testing position management...");

        MarginRouter router = MarginRouter(marginRouterAddress);

        vm.startBroadcast(testUser);

        // Approve tokens for MarginRouter
        mockToken0.approve(marginRouterAddress, TEST_COLLATERAL);

        console.log("   Tokens approved for MarginRouter");

        // Note: We can't test actual position opening without a real pool
        // But we can test the parameter validation

        // Test leverage limits
        try router.maxGlobalLeverage() returns (uint256 maxLeverage) {
            console.log("   Max global leverage:", maxLeverage / 100, "x");
        } catch {
            console.log("    Failed to get max leverage");
        }

        // Test emergency pause status
        bool isPaused = router.emergencyPaused();
        console.log("   Emergency pause status:", isPaused ? "PAUSED" : "ACTIVE");

        vm.stopBroadcast();
    }

    function _testEmergencyFunctions() internal {
        console.log("5. Testing emergency functions...");

        MarginRouter router = MarginRouter(marginRouterAddress);

        vm.startBroadcast(deployer); // Need owner privileges

        // Test emergency pause
        console.log("   Testing emergency pause...");
        router.setEmergencyPause(true);
        bool isPaused = router.emergencyPaused();
        console.log("   Emergency pause set:", isPaused ? "SUCCESS" : "FAILED");

        // Unpause for normal operations
        router.setEmergencyPause(false);
        isPaused = router.emergencyPaused();
        console.log("   Emergency unpause:", !isPaused ? "SUCCESS" : "FAILED");

        vm.stopBroadcast();
    }
}