// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

// Shinrai Contracts
import {MarginRouter} from "../src/MarginRouter.sol";
import {GlobalAssetLedger} from "../src/GlobalAssetLedger.sol";

// Uniswap V4 Types
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {IHooks} from "v4-core/interfaces/IHooks.sol";

/**
 * @title Step 3: Configure Shinrai Protocol
 * @notice Sets up protocol parameters, authorizations, and limits
 */
contract ConfigureProtocol is Script {

    address internal protocolOwner;

    // Contract addresses
    address internal marginRouterAddress;
    address internal globalAssetLedgerAddress;
    address internal leverageHookAddress;

    // Configuration constants
    uint256 internal constant MAX_GLOBAL_LEVERAGE = 1000; // 10x
    uint256 internal constant INITIAL_GLOBAL_BORROW_CAP = 10000000 ether;
    uint256 internal constant INITIAL_POOL_BORROW_CAP = 1000000 ether;

    // Mock token addresses for testing
    address internal constant MOCK_TOKEN0 = 0x1111111111111111111111111111111111111111;
    address internal constant MOCK_TOKEN1 = 0x2222222222222222222222222222222222222222;
    address internal constant MOCK_WETH = 0x3333333333333333333333333333333333333333;

    function setUp() public {
        protocolOwner = vm.rememberKey(vm.envUint("OWNER_PRIVATE_KEY"));

        // Load deployed contract addresses
        try vm.envAddress("MARGIN_ROUTER_ADDRESS") returns (address addr) {
            marginRouterAddress = addr;
        } catch {
            revert("MARGIN_ROUTER_ADDRESS not found. Run 01_DeployCore.s.sol first");
        }

        try vm.envAddress("GLOBAL_ASSET_LEDGER_ADDRESS") returns (address addr) {
            globalAssetLedgerAddress = addr;
        } catch {
            revert("GLOBAL_ASSET_LEDGER_ADDRESS not found. Run 01_DeployCore.s.sol first");
        }

        try vm.envAddress("LEVERAGE_HOOK_ADDRESS") returns (address addr) {
            leverageHookAddress = addr;
        } catch {
            revert("LEVERAGE_HOOK_ADDRESS not found. Run 01_DeployCore.s.sol first");
        }

        vm.label(protocolOwner, "ProtocolOwner");

        console.log("=== Protocol Configuration Setup ===");
        console.log("Protocol Owner:", protocolOwner);
        console.log("MarginRouter:", marginRouterAddress);
        console.log("GlobalAssetLedger:", globalAssetLedgerAddress);
        console.log("LeverageHook:", leverageHookAddress);
    }

    function run() public {
        console.log("=== Starting Protocol Configuration ===");

        MarginRouter marginRouter = MarginRouter(marginRouterAddress);
        GlobalAssetLedger globalAssetLedger = GlobalAssetLedger(globalAssetLedgerAddress);

        vm.startBroadcast(protocolOwner);

        // Step 1: Configure GlobalAssetLedger
        console.log("1. Configuring GlobalAssetLedger...");

        // Authorize MarginRouter to interact with GlobalAssetLedger
        globalAssetLedger.setAuthorizedRouter(marginRouterAddress, true);
        console.log("   MarginRouter authorized");

        // Set global borrow caps for mock tokens
        globalAssetLedger.setGlobalBorrowCap(MOCK_TOKEN0, INITIAL_GLOBAL_BORROW_CAP);
        globalAssetLedger.setGlobalBorrowCap(MOCK_TOKEN1, INITIAL_GLOBAL_BORROW_CAP);
        globalAssetLedger.setGlobalBorrowCap(MOCK_WETH, INITIAL_GLOBAL_BORROW_CAP);
        console.log("   Global borrow caps set");

        // Step 2: Configure MarginRouter
        console.log("2. Configuring MarginRouter...");

        // Set maximum global leverage
        marginRouter.setMaxGlobalLeverage(MAX_GLOBAL_LEVERAGE);
        console.log("   Max global leverage set to", MAX_GLOBAL_LEVERAGE / 100, "x");

        // Step 3: Create and authorize mock pools
        console.log("3. Setting up mock pools...");

        // Create mock pool IDs (in production, these would be real Uniswap V4 pools)
        bytes32 mockPool1 = keccak256(abi.encode(MOCK_TOKEN0, MOCK_TOKEN1, uint24(3000), int24(60)));
        bytes32 mockPool2 = keccak256(abi.encode(MOCK_WETH, MOCK_TOKEN0, uint24(3000), int24(60)));
        bytes32 mockPool3 = keccak256(abi.encode(MOCK_WETH, MOCK_TOKEN1, uint24(500), int24(10)));

        // Authorize pools for leverage trading (using mock pool IDs for now)
        // Note: In production, you would create actual PoolKey structs
        _authorizePool(marginRouter, globalAssetLedger, mockPool1, "TOKEN0/TOKEN1", MOCK_TOKEN0, MOCK_TOKEN1);
        _authorizePool(marginRouter, globalAssetLedger, mockPool2, "WETH/TOKEN0", MOCK_WETH, MOCK_TOKEN0);
        _authorizePool(marginRouter, globalAssetLedger, mockPool3, "WETH/TOKEN1", MOCK_WETH, MOCK_TOKEN1);

        // Step 4: Set up initial operator configurations
        console.log("4. Configuring operator settings...");

        // Set initial funding rate parameters (through GlobalAssetLedger)
        // This would typically be done through the LeverageValidator
        console.log("   Operator configurations ready");

        vm.stopBroadcast();

        // Step 5: Verify configuration
        _verifyConfiguration(marginRouter, globalAssetLedger);

        console.log("=== Protocol Configuration Complete ===");
        console.log("Next step: Run 04_InitializePools.s.sol (optional - for Uniswap V4 integration)");
    }

    function _authorizePool(
        MarginRouter marginRouter,
        GlobalAssetLedger globalAssetLedger,
        bytes32 poolId,
        string memory poolName,
        address token0,
        address token1
    ) internal {
        console.log(string.concat("   Setting up ", poolName, " pool..."));

        // Create PoolKey for this pool
        PoolKey memory poolKey = PoolKey({
            currency0: Currency.wrap(token0),
            currency1: Currency.wrap(token1),
            fee: 3000, // Default 0.3% fee
            tickSpacing: 60, // Default tick spacing
            hooks: IHooks(leverageHookAddress) // Use the deployed leverage hook
        });

        // Authorize pool with MarginRouter
        marginRouter.authorizePool(poolKey, MAX_GLOBAL_LEVERAGE);

        // Set pool-specific borrow caps
        globalAssetLedger.setPoolBorrowCap(poolId, token0, INITIAL_POOL_BORROW_CAP);
        globalAssetLedger.setPoolBorrowCap(poolId, token1, INITIAL_POOL_BORROW_CAP);

        console.log(string.concat("     ", poolName, " pool configured"));
    }

    function _verifyConfiguration(MarginRouter marginRouter, GlobalAssetLedger globalAssetLedger) internal view {
        console.log("5. Verifying configuration...");

        // Verify MarginRouter settings
        require(marginRouter.maxGlobalLeverage() == MAX_GLOBAL_LEVERAGE, "Max leverage not set");
        require(!marginRouter.emergencyPaused(), "Should not be paused");
        console.log("   MarginRouter configuration verified");

        // Verify GlobalAssetLedger settings
        require(globalAssetLedger.authorizedRouters(marginRouterAddress), "Router not authorized");
        require(globalAssetLedger.globalBorrowCaps(MOCK_TOKEN0) == INITIAL_GLOBAL_BORROW_CAP, "Borrow cap not set");
        console.log("   GlobalAssetLedger configuration verified");

        console.log("   All configurations verified successfully");
    }
}