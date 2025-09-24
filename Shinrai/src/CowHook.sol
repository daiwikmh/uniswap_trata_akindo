// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BaseHook} from "v4-periphery/src/utils/BaseHook.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/libraries/Hooks.sol";
import {PoolKey} from "v4-core/types/PoolKey.sol";
import {SwapParams} from "lib/v4-periphery/lib/v4-core/src/types/PoolOperation.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary} from "v4-core/types/BeforeSwapDelta.sol";
import {IERC20Minimal} from "v4-core/interfaces/external/IERC20Minimal.sol";
import {SafeCast} from "v4-core/libraries/SafeCast.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract CoWUniswapV4Hook is BaseHook {
    // ============ State Variables ============

    /// @notice EIP-712 domain separator for order signing
    bytes32 public immutable DOMAIN_SEPARATOR;

    /// @notice Dynamic fee flag for Uniswap v4 pools
    uint24 public constant DYNAMIC_FEE_FLAG = 0x800000;

    /// @notice Nonce to prevent order replay
    mapping(address => uint256) public nonces;

    // ============ Structs ============

    struct CoWOrder {
        address trader; // Order submitter
        address tokenIn; // Token to sell
        address tokenOut; // Token to buy
        uint256 amountIn; // Amount to sell
        uint256 amountOutMin; // Minimum amount to receive
        uint256 deadline; // Order expiry
        uint256 nonce; // Unique nonce for replay protection
        bytes signature; // EIP-712 signature
    }

    struct CoWMatch {
        CoWOrder buyOrder; // Buyer's order
        CoWOrder sellOrder; // Seller's order
        uint256 amount; // Matched amount
    }

    // ============ Events ============

    event CoWOrderMatched(
        address indexed buyer,
        address indexed seller,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );

    event FallbackToUniswapV4(
        address indexed trader,
        bytes32 indexed poolId,
        uint256 amountIn,
        uint256 amountOut
    );

    // ============ Constructor ============

    constructor(IPoolManager _poolManager) BaseHook(_poolManager) {
    // Initialize EIP-712 domain separator
    bytes32 domainTypeHash = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 nameHash = keccak256(bytes("CoWUniswapV4Hook"));
    bytes32 versionHash = keccak256(bytes("1"));
    bytes32 structHash = keccak256(abi.encode(domainTypeHash, nameHash, versionHash, block.chainid, address(this)));
    DOMAIN_SEPARATOR = MessageHashUtils.toTypedDataHash(structHash, bytes32(0)); // Note: bytes32(0) may need to be adjusted
}

    // ============ Hook Permissions ============

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return
            Hooks.Permissions({
                beforeInitialize: false,
                afterInitialize: false,
                beforeAddLiquidity: false,
                beforeRemoveLiquidity: false,
                afterAddLiquidity: false,
                afterRemoveLiquidity: false,
                beforeSwap: true, // Check for CoW matches
                afterSwap: true, // Record swap outcomes
                beforeDonate: false,
                afterDonate: false,
                beforeSwapReturnDelta: false,
                afterSwapReturnDelta: false,
                afterAddLiquidityReturnDelta: false,
                afterRemoveLiquidityReturnDelta: false
            });
    }

    // ============ Core Functions ============

    /**
     * @notice Settle matched CoW orders on-chain
     * @param cowMatch CoWMatch struct containing buy and sell orders
     */
    function settleCoWMatch(CoWMatch memory cowMatch) external {
        // Verify signatures
        _verifyOrder(cowMatch.buyOrder);
        _verifyOrder(cowMatch.sellOrder);

        // Validate amounts and compatibility
        require(cowMatch.buyOrder.tokenIn == cowMatch.sellOrder.tokenOut, "Invalid token pair");
        require(cowMatch.sellOrder.tokenIn == cowMatch.buyOrder.tokenOut, "Invalid token pair");
        require(cowMatch.buyOrder.amountIn >= cowMatch.amount, "Insufficient buy amount");
        require(cowMatch.sellOrder.amountIn >= cowMatch.amount, "Insufficient sell amount");
        require(cowMatch.buyOrder.amountOutMin <= cowMatch.amount, "Below min output for buy");
        require(cowMatch.sellOrder.amountOutMin <= cowMatch.amount, "Below min output for sell");
        require(cowMatch.buyOrder.deadline >= block.timestamp, "Buy order expired");
        require(cowMatch.sellOrder.deadline >= block.timestamp, "Sell order expired");

        // Execute transfers
        IERC20Minimal(cowMatch.buyOrder.tokenIn).transferFrom(cowMatch.buyOrder.trader, cowMatch.sellOrder.trader, cowMatch.amount);
        IERC20Minimal(cowMatch.sellOrder.tokenIn).transferFrom(cowMatch.sellOrder.trader, cowMatch.buyOrder.trader, cowMatch.amount);

        // Increment nonces to prevent replay
        nonces[cowMatch.buyOrder.trader]++;
        nonces[cowMatch.sellOrder.trader]++;

        emit CoWOrderMatched(
            cowMatch.buyOrder.trader,
            cowMatch.sellOrder.trader,
            cowMatch.buyOrder.tokenIn,
            cowMatch.sellOrder.tokenIn,
            cowMatch.amount,
            cowMatch.amount
        );
    }

    /**
     * @notice Hook called before a swap to check for CoW matches
     */
    function _beforeSwap(
        address sender,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata hookData
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        // If hookData contains a CoW order, attempt to match it
        if (hookData.length > 0) {
            CoWOrder memory order = abi.decode(hookData, (CoWOrder));
            _verifyOrder(order);

            // Check if order can be matched off-chain (simplified check)
            if (_canMatchOrder(order, key)) {
                // Order matched off-chain; skip Uniswap swap
                return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
            }
        }

        // No CoW match; proceed with Uniswap swap
        uint24 fee = key.fee == DYNAMIC_FEE_FLAG ? _calculateDynamicFee(key) : key.fee;
        return (BaseHook.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, fee);
    }

    /**
     * @notice Hook called after a swap to record outcomes
     */
   

    // ============ Internal Functions ============

    /**
     * @notice Verify an order's EIP-712 signature
     */
    function _verifyOrder(CoWOrder memory order) internal view {
        bytes32 orderHash = keccak256(
            abi.encode(
                keccak256("CoWOrder(address trader,address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOutMin,uint256 deadline,uint256 nonce)"),
                order.trader,
                order.tokenIn,
                order.tokenOut,
                order.amountIn,
                order.amountOutMin,
                order.deadline,
                order.nonce
            )
        );
         bytes32 digest;
    {
        bytes memory prefix = hex"19_01";
        bytes32 domainSeparator = DOMAIN_SEPARATOR;
        digest = keccak256(abi.encodePacked(prefix, domainSeparator, orderHash));
    }
        address signer = ECDSA.recover(digest, order.signature);
        require(signer == order.trader, "Invalid signature");
        require(nonces[order.trader] == order.nonce, "Invalid nonce");
        require(order.deadline >= block.timestamp, "Order expired");
    }

    /**
     * @notice Check if an order can be matched (simplified)
     */
    function _canMatchOrder(CoWOrder memory order, PoolKey calldata key) internal pure returns (bool) {
        // Simplified: assume off-chain solver provides match
        return false; // Fallback to Uniswap v4 for this example
    }

    /**
     * @notice Generate market ID from pool key
     */
    function _getMarketId(PoolKey calldata key) internal pure returns (bytes32) {
        return keccak256(abi.encode(key.currency0, key.currency1, key.fee, key.tickSpacing));
    }

    /**
     * @notice Calculate dynamic fee based on pool state
     */
    function _calculateDynamicFee(PoolKey calldata key) internal view returns (uint24) {
        // Placeholder: query pool utilization from IPoolManager
        uint256 utilizationRate = 5000; // Mock 50%
        uint24 baseFee = 500; // 0.05%
        if (utilizationRate > 8000) return baseFee * 4; // 0.2%
        if (utilizationRate > 6000) return baseFee * 2; // 0.1%
        return baseFee; // 0.05%
    }
}