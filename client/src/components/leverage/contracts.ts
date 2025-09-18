// Shinrai Protocol Contract Configuration
import { ethers } from 'ethers';

// Contract addresses from Shinrai deployment
export const SHINRAI_CONTRACTS = {
  POOL_MANAGER: "0x49217E4F5eaEFbdA69Bc325b56Cc65974B27699D",
  LEVERAGE_HOOK: "0xedd7a4642F404a06b3051Eb794e5d001c6aD83c0",
  MARGIN_ROUTER: "0x3dd63AdB03d46fEA41c14D6a557bd3E329DFecC1",
  GLOBAL_ASSET_LEDGER: "0x8498fa4591201deF1380328103c7d7050d1F5dd7",

  // EigenLayer addresses (Holesky testnet)
  DELEGATION_MANAGER: "0xA44151489861Fe9e3055d95adC98FbD462B948e7",
  AVS_DIRECTORY: "0x055733000064333CaDDbC92763c58BF0192fFeBf",

  // Mock tokens for testing
  MOCK_TOKEN0: "0x1111111111111111111111111111111111111111",
  MOCK_TOKEN1: "0x2222222222222222222222222222222222222222",
  MOCK_WETH: "0x3333333333333333333333333333333333333333"
} as const;

// Network configuration
export const NETWORK_CONFIG = {
  RPC_URL: "https://holesky.drpc.org",
  CHAIN_ID: 17000, // Holesky testnet
  EXPLORER_URL: "https://holesky.etherscan.io"
};

// Protocol configuration
export const PROTOCOL_CONFIG = {
  MAX_GLOBAL_LEVERAGE: 1000, // 10x
  LEVERAGE_MULTIPLIER: 100,  // 100 = 1x, 1000 = 10x
  INITIAL_GLOBAL_BORROW_CAP: ethers.parseEther("10000000"), // 10M tokens
  INITIAL_POOL_BORROW_CAP: ethers.parseEther("1000000"),    // 1M tokens
  MIN_COLLATERAL_RATIO: 15000, // 150% (in basis points)
  LIQUIDATION_THRESHOLD: 1200  // 120%
};

// Contract ABIs - Essential functions only

// Uniswap V4 PoolManager ABI
export const POOL_MANAGER_ABI = [
  "function initialize(tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) key, uint160 sqrtPriceX96) external returns (int24 tick)",
  "function getSlot0(bytes32 poolId) external view returns (uint160 sqrtPriceX96, int24 tick, uint8 protocolFee, uint24 lpFee)",
  "function isValidHook(address hooks) external view returns (bool)"
];

export const MARGIN_ROUTER_ABI = [
  "function openLeveragePosition(tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, address collateralToken, uint256 collateralAmount, uint256 borrowAmount, uint256 leverageRatio, bool isLongPosition) external returns (bytes32 positionId)",
  "function closeLeveragePosition(bytes32 positionId, tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey) external returns (int256 pnl)",
  "function getTraderPositions(address trader) external view returns (bytes32[] memory positionIds)",
  "function getPosition(bytes32 positionId) external view returns (tuple(address trader, address collateralToken, address borrowedToken, uint256 collateralAmount, uint256 borrowedAmount, uint256 leverageRatio, bool isLongPosition, uint256 openTimestamp, bytes32 positionId) position)",
  "function checkPositionHealth(bytes32 positionId) external view returns (bool isHealthy, uint256 healthFactor)",
  "function authorizePool(tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks) poolKey, uint256 leverageCap) external",
  "function maxGlobalLeverage() external view returns (uint256)",
  "function emergencyPaused() external view returns (bool)"
];

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

export const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

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

export function generatePoolId(token0: string, token1: string): string {
  // Simple pool ID generation (in production, use keccak256)
  return `0x${token0.slice(2)}${token1.slice(2)}`.slice(0, 66);
}