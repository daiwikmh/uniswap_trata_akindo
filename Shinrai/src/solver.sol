// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20Minimal} from "v4-core/interfaces/external/IERC20Minimal.sol";

// Interface for the CoWUniswapV4Hook contract
interface ICoWUniswapV4Hook {
    struct CoWOrder {
        address trader; // Order submitter
        address tokenIn; // Token to sell
        address tokenOut; // Token to buy
        uint256 amountIn; // Amount to sell
        uint256 amountOutMin; // Minimum amount to receive
        uint256 deadline; // Order expiry
    }

    struct CoWMatch {
        CoWOrder buyOrder; // Buyer's order
        CoWOrder sellOrder; // Seller's order
        uint256 amount; // Matched amount
    }

    function settleCoWMatch(CoWMatch memory cowMatch) external;
}

contract CoWSolver {
    // ============ State Variables ============

    /// @notice Reference to the CoWUniswapV4Hook contract
    ICoWUniswapV4Hook public immutable hook;

    // ============ Events ============

    event OrderSubmitted(
        address indexed trader,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOutMin,
        uint256 deadline
    );

    event OrdersMatched(
        address indexed buyer,
        address indexed seller,
        address tokenIn,
        address tokenOut,
        uint256 amount
    );

    // ============ Constructor ============

    constructor(address _hook) {
        hook = ICoWUniswapV4Hook(_hook);
    }

    // ============ Structs ============

    struct CoWOrder {
        address trader; // Order submitter
        address tokenIn; // Token to sell
        address tokenOut; // Token to buy
        uint256 amountIn; // Amount to sell
        uint256 amountOutMin; // Minimum amount to receive
        uint256 deadline; // Order expiry
    }

    // ============ Core Functions ============

    /**
     * @notice Submit a CoW order for matching
     * @param order The CoW order to submit
     */
    function submitOrder(CoWOrder memory order) external {
        // Basic validation (no signature verification needed)
        require(order.trader == msg.sender, "Only trader can submit their order");
        require(order.deadline > block.timestamp, "Order expired");
        require(order.amountIn > 0, "Invalid amount in");
        require(order.amountOutMin > 0, "Invalid amount out min");

        // Emit event for off-chain processing
        emit OrderSubmitted(
            order.trader,
            order.tokenIn,
            order.tokenOut,
            order.amountIn,
            order.amountOutMin,
            order.deadline
        );
    }

    /**
     * @notice Match and settle compatible buy and sell orders
     * @param buyOrder The buyer's CoW order
     * @param sellOrder The seller's CoW order
     * @param amount The matched amount
     */
  function matchOrders(
    CoWOrder memory buyOrder,
    CoWOrder memory sellOrder,
    uint256 amount
) external {
    // Validate orders (no signature verification needed)
    require(buyOrder.tokenIn == sellOrder.tokenOut, "Invalid token pair");
    require(sellOrder.tokenIn == buyOrder.tokenOut, "Invalid token pair");
    require(buyOrder.amountIn >= amount, "Insufficient buy amount");
    require(sellOrder.amountIn >= amount, "Insufficient sell amount");
    require(buyOrder.amountOutMin <= amount, "Below min output for buy");
    require(sellOrder.amountOutMin <= amount, "Below min output for sell");
    require(buyOrder.deadline >= block.timestamp, "Buy order expired");
    require(sellOrder.deadline >= block.timestamp, "Sell order expired");

    // Convert CoWSolver.CoWOrder to ICoWUniswapV4Hook.CoWOrder
    ICoWUniswapV4Hook.CoWOrder memory hookBuyOrder = ICoWUniswapV4Hook.CoWOrder({
        trader: buyOrder.trader,
        tokenIn: buyOrder.tokenIn,
        tokenOut: buyOrder.tokenOut,
        amountIn: buyOrder.amountIn,
        amountOutMin: buyOrder.amountOutMin,
        deadline: buyOrder.deadline
    });

    ICoWUniswapV4Hook.CoWOrder memory hookSellOrder = ICoWUniswapV4Hook.CoWOrder({
        trader: sellOrder.trader,
        tokenIn: sellOrder.tokenIn,
        tokenOut: sellOrder.tokenOut,
        amountIn: sellOrder.amountIn,
        amountOutMin: sellOrder.amountOutMin,
        deadline: sellOrder.deadline
    });

    // Create CoWMatch struct
    ICoWUniswapV4Hook.CoWMatch memory cowMatch = ICoWUniswapV4Hook.CoWMatch({
        buyOrder: hookBuyOrder,
        sellOrder: hookSellOrder,
        amount: amount
    });

    // Approve tokens if necessary
    _approveTokens(buyOrder.trader, buyOrder.tokenIn, amount);
    _approveTokens(sellOrder.trader, sellOrder.tokenIn, amount);

    // Settle the match via the hook contract
    hook.settleCoWMatch(cowMatch);

    emit OrdersMatched(
        buyOrder.trader,
        sellOrder.trader,
        buyOrder.tokenIn,
        sellOrder.tokenIn,
        amount
    );
}

    // ============ Internal Functions ============

    /**
     * @notice Basic order validation (no signature verification)
     * @param order The CoW order to validate
     */
    function _validateOrder(CoWOrder memory order) internal pure {
        require(order.trader != address(0), "Invalid trader");
        require(order.tokenIn != address(0), "Invalid token in");
        require(order.tokenOut != address(0), "Invalid token out");
        require(order.amountIn > 0, "Invalid amount in");
        require(order.amountOutMin > 0, "Invalid amount out min");
        require(order.deadline > 0, "Invalid deadline");
    }

    /**
     * @notice Approve tokens for transfer by the hook contract
     * @param trader The trader's address
     * @param token The token to approve
     * @param amount The amount to approve
     */
    function _approveTokens(address trader, address token, uint256 amount) internal {
        // Check if allowance is sufficient
        uint256 currentAllowance = IERC20Minimal(token).allowance(trader, address(hook));
        if (currentAllowance < amount) {
            // Approve the hook contract to spend tokens
            // Note: In practice, this would typically be done by the trader beforehand
            require(IERC20Minimal(token).approve(address(hook), amount), "Approval failed");
        }
    }
}