// Shinrai Protocol Contract Configuration
import { ethers } from 'ethers';

// Contract addresses - Official Uniswap V4 + Shinrai protocol on Sepolia
export const SHINRAI_CONTRACTS = {
  // Uniswap V4 Core (Official Sepolia deployment from docs.uniswap.org)
  POOL_MANAGER: "0xab68573623f90708958c119F7F75236b5F13EF00",

  // Shinrai Protocol Contracts (Your deployment - need to register hook with official PoolManager)
  LEVERAGE_HOOK: "0x220c3B7316280D991fB501060EfB58D1819743c0",
  MARGIN_ROUTER: "0x90204d0F2A1C0e9BD2fb56849bD9262e694D8701",
  GLOBAL_ASSET_LEDGER: "0x3570161C03e5dD3CaC20C1e140C7B4889152B69D",

  // EigenLayer addresses (Sepolia testnet)
  DELEGATION_MANAGER: "0xD4A7E1Bd8015057293f0D0A557088c286942e84b",
  AVS_DIRECTORY: "0xa789c91ECDdae96865913130B786140Ee17aF545",

  // Uniswap V4 Helper Contracts (Official Sepolia deployment)
  UNIVERSAL_ROUTER: "0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b",
  POSITION_MANAGER: "0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4",
  STATE_VIEW: "0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c",
  QUOTER: "0x61b3f2011a92d183c7dbadbda940a7555ccf9227",
  POOL_SWAP_TEST: "0x9b6b46e2c869aa39918db7f52f5557fe577b6eee",
  POOL_MODIFY_LIQUIDITY_TEST: "0x0c478023803a644c94c4ce1e7b9a087e411b0a",
  PERMIT2: "0x000000000022D473030F116dDEE9F6B43aC78BA3",

  // Testnet tokens on Sepolia (using real deployed tokens)
  MOCK_TOKEN0: "0x6f14C02FC1F78322cFd7d707aB90f18baD3B54f5", // USDC on Sepolia
  MOCK_TOKEN1: "0x3e622317f8C93f7328350cF0B56d9eD4C620C5d6", // DAI on Sepolia
  MOCK_WETH: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14"  // WETH on Sepolia
} as const;

// Network configuration - Sepolia Testnet
export const NETWORK_CONFIG = {
  RPC_URL: "https://eth-sepolia.g.alchemy.com/v2/t7Oxw5b_OpDL6yQVWN70ZjxO6hTCaZeW",
  CHAIN_ID: 11155111, // Sepolia testnet
  EXPLORER_URL: "https://sepolia.etherscan.io",
  NETWORK_NAME: "Sepolia Testnet"
};

// Protocol configuration
export const PROTOCOL_CONFIG = {
  MAX_GLOBAL_LEVERAGE: 1000, // 10x
  LEVERAGE_MULTIPLIER: 100,  // 100 = 1x, 1000 = 10x
  INITIAL_GLOBAL_BORROW_CAP: ethers.parseEther("10000000"), // 10M tokens (from env)
  INITIAL_POOL_BORROW_CAP: ethers.parseEther("1000000"),    // 1M tokens (from env)
  MIN_COLLATERAL_RATIO: 15000, // 150% (in basis points)
  LIQUIDATION_THRESHOLD: 1200  // 120%
};

// Contract ABIs - Essential functions only

// Uniswap V4 PoolManager ABI (Object format for wagmi v2)
export const POOL_MANAGER_ABI = [
  {
    type: "function",
    name: "initialize",
    inputs: [
      {
        name: "key",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" }
        ]
      },
      { name: "sqrtPriceX96", type: "uint160" }
    ],
    outputs: [{ name: "tick", type: "int24" }],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "getSlot0",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "protocolFee", type: "uint8" },
      { name: "lpFee", type: "uint24" }
    ],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "isUnlocked",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view"
  }
] as const;

export const MARGIN_ROUTER_ABI = [
  {
    type: "function",
    name: "openLeveragePosition",
    inputs: [
      {
        name: "poolKey",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" }
        ]
      },
      { name: "collateralToken", type: "address" },
      { name: "collateralAmount", type: "uint256" },
      { name: "borrowAmount", type: "uint256" },
      { name: "leverageRatio", type: "uint256" },
      { name: "isLongPosition", type: "bool" }
    ],
    outputs: [{ name: "positionId", type: "bytes32" }],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "closeLeveragePosition",
    inputs: [
      { name: "positionId", type: "bytes32" },
      {
        name: "poolKey",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" }
        ]
      }
    ],
    outputs: [{ name: "pnl", type: "int256" }],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "maxGlobalLeverage",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "emergencyPaused",
    inputs: [],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "authorizedPools",
    inputs: [{ name: "poolId", type: "bytes32" }],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "authorizePool",
    inputs: [
      {
        name: "poolKey",
        type: "tuple",
        components: [
          { name: "currency0", type: "address" },
          { name: "currency1", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "tickSpacing", type: "int24" },
          { name: "hooks", type: "address" }
        ]
      },
      { name: "leverageCap", type: "uint256" }
    ],
    outputs: [],
    stateMutability: "nonpayable"
  }
] as const;

export const GLOBAL_ASSET_LEDGER_ABI = [
  "function authorizeBorrow(bytes32 poolId, address borrower, address borrowToken, uint256 borrowAmount, address collateralToken, uint256 collateralAmount) external returns (tuple(bool authorized, uint256 maxAmount, uint256 requiredCollateral, uint256 utilizationImpact, string reason) authorization)",
  "function depositCollateral(address token, uint256 amount) external",
  "function withdrawCollateral(address token, uint256 amount) external",
  "function getUserExposure(address user) external view returns (uint256 totalCollateral, uint256 totalBorrowed)",
  "function getPoolUtilization(bytes32 poolId, address token) external view returns (uint256 utilization)",
  "function globalBorrowCaps(address token) external view returns (uint256)",
  "function totalBorrowed(address token) external view returns (uint256)",
  "function userCollateral(address user, address token) external view returns (uint256)"
];

// String format ABIs for ethers.js compatibility (legacy hooks)
export const MARGIN_ROUTER_ABI_STRING = [
  "function openLeveragePosition(tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, address collateralToken, uint256 collateralAmount, uint256 borrowAmount, uint256 leverageRatio, bool isLongPosition) external returns (bytes32 positionId)",
  "function closeLeveragePosition(bytes32 positionId, tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey) external returns (int256 pnl)",
  "function getTraderPositions(address trader) external view returns (bytes32[] memory positionIds)",
  "function getPosition(bytes32 positionId) external view returns (tuple(address trader, address collateralToken, address borrowedToken, uint256 collateralAmount, uint256 borrowedAmount, uint256 leverageRatio, bool isLongPosition, uint256 openTimestamp, bytes32 positionId) position)",
  "function checkPositionHealth(bytes32 positionId) external view returns (bool isHealthy, uint256 healthFactor)",
  "function authorizePool(tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, uint256 leverageCap) external",
  "function maxGlobalLeverage() external view returns (uint256)",
  "function emergencyPaused() external view returns (bool)"
];

export const ERC20_ABI_STRING = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

export const ERC20_ABI = [
  {
    type: "function",
    name: "balanceOf",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "allowance",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" }
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "approve",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable"
  },
  {
    type: "function",
    name: "symbol",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view"
  },
  {
    type: "function",
    name: "decimals",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
    stateMutability: "view"
  }
] as const;

// Pool creation helper
export function createPoolKey(token0: string, token1: string, fee = 3000, tickSpacing = 60) {
  return {
    currency0: token0,
    currency1: token1,
    fee,
    tickSpacing,
    hooks: SHINRAI_CONTRACTS.LEVERAGE_HOOK
  };
}

// Position types
export interface LeveragePosition {
  trader: string;
  collateralToken: string;
  borrowedToken: string;
  collateralAmount: bigint;
  borrowedAmount: bigint;
  leverageRatio: number;
  isLongPosition: boolean;
  openTimestamp: number;
  positionId: string;
}

export interface BorrowAuthorization {
  authorized: boolean;
  maxAmount: bigint;
  requiredCollateral: bigint;
  utilizationImpact: number;
  reason: string;
}

export interface PoolState {
  utilizationRate: number;
  availableLiquidity: bigint;
  totalBorrowed: bigint;
  fundingRate: number;
}

// Utility functions for Uniswap V4 pool creation
export function priceToSqrtPriceX96(price: number): bigint {
  // Convert price to sqrtPriceX96 format used by Uniswap V4
  // sqrtPriceX96 = sqrt(price) * 2^96
  const sqrtPrice = Math.sqrt(price);
  const Q96 = 2n ** 96n;
  return BigInt(Math.floor(sqrtPrice * Number(Q96)));
}

export function generatePoolId(token0: string, token1: string, fee: number = 3000, tickSpacing: number = 60): string {
  // Generate pool ID to match contract's _getPoolId function:
  // keccak256(abi.encode(key.currency0, key.currency1, key.fee, key.tickSpacing))

  // For client-side, we'll create a deterministic hash based on the pool parameters
  // This should match the contract's calculation
  const data = `${token0}${token1}${fee}${tickSpacing}`;

  // Simple hash for now - in production would use proper keccak256
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Pad to 32 bytes (64 hex chars)
  return `0x${Math.abs(hash).toString(16).padStart(64, '0')}`;
}