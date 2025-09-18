import { Token } from "@uniswap/sdk-core";
import { FeeAmount } from "@uniswap/v3-sdk";
import { ENV } from "../../env.js";
// Environment configuration
export const Environment = {
  MAINNET: "mainnet",
  LOCAL: "local",
};

// Common tokens (extendable)
export const TOKENS = {
  WETH: new Token(
    1, // Mainnet chain ID
    "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    18,
    "WETH",
    "Wrapped Ether"
  ),
  USDC: new Token(
    1,
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    6,
    "USDC",
    "USD//C"
  ),
  DAI: new Token(
    1,
    "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    18,
    "DAI",
    "Dai Stablecoin"
  ),
};

// RPC configuration
export const RPC_CONFIG = {
  local: "http://localhost:8545",
  mainnet: ENV.ALCHEMY_MAINNET_URL, // load from .env
};

// Pool configurations (array)
export const POOLS = [
  {
    name: "USDC-WETH",
    token0: TOKENS.USDC,
    token1: TOKENS.WETH,
    fee: FeeAmount.MEDIUM, // 0.3%
  },
  {
    name: "DAI-WETH",
    token0: TOKENS.DAI,
    token1: TOKENS.WETH,
    fee: FeeAmount.LOW, // 0.05%
  },
  // Add more pools as needed
];

// Export current environment
export const CurrentConfig = {
  env: Environment.MAINNET,
  rpc: RPC_CONFIG,
  pools: POOLS,
};
