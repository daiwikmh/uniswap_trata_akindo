#!/usr/bin/env node
/**
 * CoW Protocol Transaction Watcher and Batcher
 *
 * This script watches for CoW orders and automatically matches compatible ones.
 * It acts as a simple solver for demonstration purposes.
 */

const { ethers } = require('ethers');
require('dotenv').config();

// Contract addresses from deployment
const CONTRACT_ADDRESSES = {
  COW_HOOK: '0x42f3D2641c9Ed51aEa542298b2F92D779C9700c0',
  COW_SOLVER: '0x03837117417572FB2a66137A11A0A0Fcc020D525',
  POOL_MANAGER: '0xab68573623f90708958c119F7F75236b5F13EF00',
};

// Mock token addresses
const MOCK_TOKENS = {
  TEST0: '0xe480AaD2C18D9c9979069A50be92f2656D2D857C',
  TEST1: '0x77a0215D490678108270b7a0DF18F33C7fD1a03C',
};

// ABIs
const COW_SOLVER_ABI = [
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "trader", "type": "address" },
      { "indexed": false, "name": "tokenIn", "type": "address" },
      { "indexed": false, "name": "tokenOut", "type": "address" },
      { "indexed": false, "name": "amountIn", "type": "uint256" },
      { "indexed": false, "name": "amountOutMin", "type": "uint256" },
      { "indexed": false, "name": "deadline", "type": "uint256" },
      { "indexed": false, "name": "nonce", "type": "uint256" }
    ],
    "name": "OrderSubmitted",
    "type": "event"
  },
  {
    "inputs": [
      {
        "components": [
          { "name": "trader", "type": "address" },
          { "name": "tokenIn", "type": "address" },
          { "name": "tokenOut", "type": "address" },
          { "name": "amountIn", "type": "uint256" },
          { "name": "amountOutMin", "type": "uint256" },
          { "name": "deadline", "type": "uint256" },
          { "name": "nonce", "type": "uint256" },
          { "name": "signature", "type": "bytes" }
        ],
        "name": "buyOrder",
        "type": "tuple"
      },
      {
        "components": [
          { "name": "trader", "type": "address" },
          { "name": "tokenIn", "type": "address" },
          { "name": "tokenOut", "type": "address" },
          { "name": "amountIn", "type": "uint256" },
          { "name": "amountOutMin", "type": "uint256" },
          { "name": "deadline", "type": "uint256" },
          { "name": "nonce", "type": "uint256" },
          { "name": "signature", "type": "bytes" }
        ],
        "name": "sellOrder",
        "type": "tuple"
      },
      { "name": "amount", "type": "uint256" }
    ],
    "name": "matchOrders",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
];

const COW_HOOK_ABI = [
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "buyer", "type": "address" },
      { "indexed": true, "name": "seller", "type": "address" },
      { "indexed": false, "name": "tokenIn", "type": "address" },
      { "indexed": false, "name": "tokenOut", "type": "address" },
      { "indexed": false, "name": "amountIn", "type": "uint256" },
      { "indexed": false, "name": "amountOut", "type": "uint256" }
    ],
    "name": "CoWOrderMatched",
    "type": "event"
  }
];

class CoWWatcher {
  constructor() {
    this.provider = new ethers.JsonRpcProvider(process.env.RPC_URL || 'http://localhost:8545');
    this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY || '', this.provider);

    this.solverContract = new ethers.Contract(
      CONTRACT_ADDRESSES.COW_SOLVER,
      COW_SOLVER_ABI,
      this.wallet
    );

    this.hookContract = new ethers.Contract(
      CONTRACT_ADDRESSES.COW_HOOK,
      COW_HOOK_ABI,
      this.provider
    );

    // Order storage
    this.pendingOrders = new Map(); // orderHash -> order
    this.ordersByToken = new Map(); // tokenPair -> orders[]

    console.log('🔍 CoW Protocol Watcher initialized');
    console.log(`📜 Solver Contract: ${CONTRACT_ADDRESSES.COW_SOLVER}`);
    console.log(`🪝 Hook Contract: ${CONTRACT_ADDRESSES.COW_HOOK}`);
    console.log(`👤 Watcher Address: ${this.wallet.address}`);
  }

  // Generate order hash for tracking
  generateOrderHash(order) {
    return ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address', 'address', 'uint256', 'uint256', 'uint256', 'uint256'],
        [
          order.trader,
          order.tokenIn,
          order.tokenOut,
          order.amountIn,
          order.amountOutMin,
          order.deadline,
          order.nonce
        ]
      )
    );
  }

  // Get token pair key
  getTokenPairKey(tokenIn, tokenOut) {
    const [token0, token1] = [tokenIn.toLowerCase(), tokenOut.toLowerCase()].sort();
    return `${token0}:${token1}`;
  }

  // Add order to tracking
  addOrder(orderData) {
    const order = {
      trader: orderData.trader,
      tokenIn: orderData.tokenIn,
      tokenOut: orderData.tokenOut,
      amountIn: orderData.amountIn,
      amountOutMin: orderData.amountOutMin,
      deadline: orderData.deadline,
      nonce: orderData.nonce,
      timestamp: Math.floor(Date.now() / 1000),
      signature: '0x' // We don't get signature from events
    };

    const orderHash = this.generateOrderHash(order);
    this.pendingOrders.set(orderHash, order);

    // Index by token pair
    const tokenPairKey = this.getTokenPairKey(order.tokenIn, order.tokenOut);
    if (!this.ordersByToken.has(tokenPairKey)) {
      this.ordersByToken.set(tokenPairKey, []);
    }
    this.ordersByToken.get(tokenPairKey).push({ hash: orderHash, order });

    console.log(`📝 New order tracked: ${orderHash.slice(0, 10)}...`);
    console.log(`   Trader: ${order.trader}`);
    console.log(`   Pair: ${order.tokenIn.slice(0, 6)}.../${order.tokenOut.slice(0, 6)}...`);
    console.log(`   Amount: ${ethers.formatEther(order.amountIn)} -> ${ethers.formatEther(order.amountOutMin)} (min)`);

    return orderHash;
  }

  // Remove order from tracking
  removeOrder(orderHash) {
    const order = this.pendingOrders.get(orderHash);
    if (!order) return;

    this.pendingOrders.delete(orderHash);

    // Remove from token pair index
    const tokenPairKey = this.getTokenPairKey(order.tokenIn, order.tokenOut);
    const orders = this.ordersByToken.get(tokenPairKey) || [];
    const filteredOrders = orders.filter(o => o.hash !== orderHash);

    if (filteredOrders.length === 0) {
      this.ordersByToken.delete(tokenPairKey);
    } else {
      this.ordersByToken.set(tokenPairKey, filteredOrders);
    }

    console.log(`🗑️  Order removed: ${orderHash.slice(0, 10)}...`);
  }

  // Find matching orders
  findMatches() {
    const matches = [];

    for (const [tokenPairKey, orderList] of this.ordersByToken.entries()) {
      if (orderList.length < 2) continue;

      const [token0, token1] = tokenPairKey.split(':');

      // Find buy orders (token0 -> token1) and sell orders (token1 -> token0)
      const buyOrders = orderList.filter(o =>
        o.order.tokenIn.toLowerCase() === token0 &&
        o.order.tokenOut.toLowerCase() === token1
      );
      const sellOrders = orderList.filter(o =>
        o.order.tokenIn.toLowerCase() === token1 &&
        o.order.tokenOut.toLowerCase() === token0
      );

      // Try to match buy and sell orders
      for (const buyOrderItem of buyOrders) {
        for (const sellOrderItem of sellOrders) {
          const match = this.checkOrdersMatch(buyOrderItem.order, sellOrderItem.order);
          if (match) {
            matches.push({
              buyOrder: buyOrderItem.order,
              sellOrder: sellOrderItem.order,
              amount: match.amount,
              buyHash: buyOrderItem.hash,
              sellHash: sellOrderItem.hash
            });
          }
        }
      }
    }

    return matches;
  }

  // Check if two orders can be matched
  checkOrdersMatch(buyOrder, sellOrder) {
    // Check if tokens are compatible (buy.tokenOut == sell.tokenIn and vice versa)
    if (buyOrder.tokenIn.toLowerCase() !== sellOrder.tokenOut.toLowerCase() ||
        buyOrder.tokenOut.toLowerCase() !== sellOrder.tokenIn.toLowerCase()) {
      return null;
    }

    // Check if orders haven't expired
    const now = Math.floor(Date.now() / 1000);
    if (buyOrder.deadline < now || sellOrder.deadline < now) {
      return null;
    }

    // Simple matching: take the minimum amount that satisfies both orders
    const buyAmountOut = buyOrder.amountIn; // For simplicity, assume 1:1 rate
    const sellAmountOut = sellOrder.amountIn;

    // Check if orders can satisfy each other's minimum requirements
    if (buyAmountOut >= sellOrder.amountOutMin && sellAmountOut >= buyOrder.amountOutMin) {
      const matchAmount = buyAmountOut < sellAmountOut ? buyAmountOut : sellAmountOut;
      return { amount: matchAmount };
    }

    return null;
  }

  // Execute order matching
  async executeMatch(match) {
    try {
      console.log(`🔄 Executing match...`);
      console.log(`   Buy Order: ${match.buyOrder.trader}`);
      console.log(`   Sell Order: ${match.sellOrder.trader}`);
      console.log(`   Amount: ${ethers.formatEther(match.amount)}`);

      // Note: In a real implementation, you would need to reconstruct the signatures
      // For this demo, we'll show the structure but won't execute
      console.log('⚠️  Demo mode: Would execute matchOrders with:');
      console.log('   buyOrder:', {
        trader: match.buyOrder.trader,
        tokenIn: match.buyOrder.tokenIn,
        tokenOut: match.buyOrder.tokenOut,
        amountIn: match.buyOrder.amountIn.toString(),
        amountOutMin: match.buyOrder.amountOutMin.toString(),
        deadline: match.buyOrder.deadline.toString(),
        nonce: match.buyOrder.nonce.toString(),
        signature: '0x' // Would need actual signature
      });

      // Remove matched orders from tracking
      this.removeOrder(match.buyHash);
      this.removeOrder(match.sellHash);

      return true;
    } catch (error) {
      console.error('❌ Failed to execute match:', error.message);
      return false;
    }
  }

  // Clean up expired orders
  cleanupExpiredOrders() {
    const now = Math.floor(Date.now() / 1000);
    const expiredHashes = [];

    for (const [hash, order] of this.pendingOrders.entries()) {
      if (order.deadline < now) {
        expiredHashes.push(hash);
      }
    }

    for (const hash of expiredHashes) {
      this.removeOrder(hash);
    }

    if (expiredHashes.length > 0) {
      console.log(`🧹 Cleaned up ${expiredHashes.length} expired orders`);
    }
  }

  // Main matching loop
  async runMatchingLoop() {
    console.log('🔄 Starting matching loop...');

    setInterval(async () => {
      try {
        // Clean up expired orders
        this.cleanupExpiredOrders();

        // Find and execute matches
        const matches = this.findMatches();

        if (matches.length > 0) {
          console.log(`🎯 Found ${matches.length} potential matches`);

          for (const match of matches) {
            await this.executeMatch(match);
            // Add delay between matches to avoid nonce issues
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }

        // Log status every minute
        if (Date.now() % 60000 < 5000) {
          console.log(`📊 Status: ${this.pendingOrders.size} pending orders, ${this.ordersByToken.size} token pairs`);
        }
      } catch (error) {
        console.error('❌ Error in matching loop:', error.message);
      }
    }, 5000); // Check every 5 seconds
  }

  // Start watching for events
  async startWatching() {
    console.log('👀 Starting to watch for CoW events...');

    // Listen for OrderSubmitted events
    this.solverContract.on('OrderSubmitted', (trader, tokenIn, tokenOut, amountIn, amountOutMin, deadline, nonce, event) => {
      console.log('📨 OrderSubmitted event received');

      this.addOrder({
        trader,
        tokenIn,
        tokenOut,
        amountIn,
        amountOutMin,
        deadline,
        nonce
      });
    });

    // Listen for CoWOrderMatched events
    this.hookContract.on('CoWOrderMatched', (buyer, seller, tokenIn, tokenOut, amountIn, amountOut, event) => {
      console.log('✅ CoWOrderMatched event received');
      console.log(`   Buyer: ${buyer}`);
      console.log(`   Seller: ${seller}`);
      console.log(`   Token: ${tokenIn} -> ${tokenOut}`);
      console.log(`   Amount: ${ethers.formatEther(amountIn)} -> ${ethers.formatEther(amountOut)}`);
    });

    // Handle provider errors
    this.provider.on('error', (error) => {
      console.error('🔌 Provider error:', error.message);
    });

    // Start the matching loop
    await this.runMatchingLoop();
  }

  // Get current status
  getStatus() {
    return {
      pendingOrders: this.pendingOrders.size,
      tokenPairs: this.ordersByToken.size,
      orders: Array.from(this.pendingOrders.entries()).map(([hash, order]) => ({
        hash: hash.slice(0, 10) + '...',
        trader: order.trader,
        tokenIn: order.tokenIn.slice(0, 6) + '...',
        tokenOut: order.tokenOut.slice(0, 6) + '...',
        amountIn: ethers.formatEther(order.amountIn),
        amountOutMin: ethers.formatEther(order.amountOutMin),
        deadline: new Date(order.deadline * 1000).toISOString()
      }))
    };
  }
}

// Main execution
async function main() {
  console.log('🚀 Starting CoW Protocol Watcher...');

  // Validate environment
  if (!process.env.PRIVATE_KEY) {
    console.error('❌ PRIVATE_KEY environment variable is required');
    process.exit(1);
  }

  try {
    const watcher = new CoWWatcher();

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n👋 Shutting down CoW Watcher...');
      console.log('📊 Final status:', JSON.stringify(watcher.getStatus(), null, 2));
      process.exit(0);
    });

    // Start watching
    await watcher.startWatching();

  } catch (error) {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = { CoWWatcher };