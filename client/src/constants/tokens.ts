/**
 * Token constants and interfaces for CoW Protocol integration
 */

// Deployed mock token addresses
export const DEPLOYED_TOKENS = {
  TEST0: '0xe480AaD2C18D9c9979069A50be92f2656D2D857C' as `0x${string}`,
  TEST1: '0x77a0215D490678108270b7a0DF18F33C7fD1a03C' as `0x${string}`,
} as const;

// Contract addresses from CoW Protocol deployment
export const COW_PROTOCOL_ADDRESSES = {
  COW_HOOK: '0x42f3D2641c9Ed51aEa542298b2F92D779C9700c0' as `0x${string}`,
  COW_SOLVER: '0x03837117417572FB2a66137A11A0A0Fcc020D525' as `0x${string}`,
  POOL_MANAGER: '0xab68573623f90708958c119F7F75236b5F13EF00' as `0x${string}`,
} as const;

// Token metadata interface
export interface TokenInfo {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  chainId: number;
  logoURI?: string;
}

// Mock token metadata
export const TOKEN_METADATA: Record<string, TokenInfo> = {
  [DEPLOYED_TOKENS.TEST0]: {
    address: DEPLOYED_TOKENS.TEST0,
    symbol: 'TEST0',
    name: 'Test Token 0',
    decimals: 18,
    chainId: 1,
    logoURI: undefined
  },
  [DEPLOYED_TOKENS.TEST1]: {
    address: DEPLOYED_TOKENS.TEST1,
    symbol: 'TEST1',
    name: 'Test Token 1',
    decimals: 18,
    chainId: 1,
    logoURI: undefined
  }
} as const;

// Common token pairs for pool creation
export const COMMON_TOKEN_PAIRS = [
  {
    token0: TOKEN_METADATA[DEPLOYED_TOKENS.TEST0],
    token1: TOKEN_METADATA[DEPLOYED_TOKENS.TEST1],
    name: 'TEST0/TEST1',
    fee: 3000 // 0.3%
  }
] as const;

// Fee tiers (in basis points)
export const FEE_TIERS = {
  LOWEST: 100,   // 0.01%
  LOW: 500,      // 0.05%
  MEDIUM: 3000,  // 0.3%
  HIGH: 10000,   // 1%
} as const;

// Pool creation interface
export interface PoolCreationParams {
  name: string;
  token0: TokenInfo;
  token1: TokenInfo;
  fee: number;
  tickSpacing: number;
  sqrtPriceX96?: string;
  useCoWHook?: boolean;
}

// CoW-specific pool interface
export interface CoWPoolParams extends PoolCreationParams {
  useCoWHook: true;
  hookData?: `0x${string}`;
}

// Default pool creation parameters
export const DEFAULT_POOL_PARAMS: Partial<PoolCreationParams> = {
  fee: FEE_TIERS.MEDIUM,
  tickSpacing: 60,
  sqrtPriceX96: '79228162514264337593543950336', // 1:1 price
  useCoWHook: true
};

// Tick spacing for different fee tiers
export const TICK_SPACINGS: Record<number, number> = {
  [FEE_TIERS.LOWEST]: 1,
  [FEE_TIERS.LOW]: 10,
  [FEE_TIERS.MEDIUM]: 60,
  [FEE_TIERS.HIGH]: 200,
};

// Helper functions
export function getTokenInfo(address: string): TokenInfo | undefined {
  return TOKEN_METADATA[address.toLowerCase() as keyof typeof TOKEN_METADATA];
}

export function getTokenSymbol(address: string): string {
  const token = getTokenInfo(address);
  return token?.symbol || 'UNKNOWN';
}

export function getTokenName(address: string): string {
  const token = getTokenInfo(address);
  return token?.name || 'Unknown Token';
}

export function formatTokenPair(token0Address: string, token1Address: string): string {
  const token0 = getTokenSymbol(token0Address);
  const token1 = getTokenSymbol(token1Address);
  return `${token0}/${token1}`;
}

export function getTickSpacingForFee(fee: number): number {
  return TICK_SPACINGS[fee] || TICK_SPACINGS[FEE_TIERS.MEDIUM];
}

export function validateTokenPair(token0: TokenInfo, token1: TokenInfo): string[] {
  const errors: string[] = [];

  if (token0.address.toLowerCase() === token1.address.toLowerCase()) {
    errors.push('Token addresses must be different');
  }

  if (!token0.symbol || !token1.symbol) {
    errors.push('Both tokens must have symbols');
  }

  if (!token0.name || !token1.name) {
    errors.push('Both tokens must have names');
  }

  if (token0.decimals < 6 || token0.decimals > 18 || token1.decimals < 6 || token1.decimals > 18) {
    errors.push('Token decimals must be between 6 and 18');
  }

  return errors;
}

// Export all available tokens as array
export const ALL_TOKENS = Object.values(TOKEN_METADATA);

// Export specific token instances for convenience
export const TEST0_TOKEN = TOKEN_METADATA[DEPLOYED_TOKENS.TEST0];
export const TEST1_TOKEN = TOKEN_METADATA[DEPLOYED_TOKENS.TEST1];

// Token selection options for dropdowns
export const TOKEN_OPTIONS = ALL_TOKENS.map(token => ({
  value: token.address,
  label: `${token.symbol} (${token.name})`,
  token
}));

// Pool key structure for Uniswap V4
export interface PoolKey {
  currency0: `0x${string}`;
  currency1: `0x${string}`;
  fee: number;
  tickSpacing: number;
  hooks: `0x${string}`;
}

// Create pool key helper
export function createPoolKey(
  token0: `0x${string}`,
  token1: `0x${string}`,
  fee: number,
  useCoWHook: boolean = true
): PoolKey {
  // Ensure token0 < token1 for canonical ordering
  const [currency0, currency1] = token0.toLowerCase() < token1.toLowerCase()
    ? [token0, token1]
    : [token1, token0];

  return {
    currency0,
    currency1,
    fee,
    tickSpacing: getTickSpacingForFee(fee),
    hooks: useCoWHook ? COW_PROTOCOL_ADDRESSES.COW_HOOK : '0x0000000000000000000000000000000000000000'
  };
}

// Price calculation helpers
export function calculateSqrtPriceX96(price: number): string {
  // Convert price to sqrt price in X96 format
  // sqrtPriceX96 = sqrt(price) * 2^96
  const sqrtPrice = Math.sqrt(price);
  const sqrtPriceX96 = BigInt(Math.floor(sqrtPrice * (2 ** 96)));
  return sqrtPriceX96.toString();
}

export function parseSqrtPriceX96(sqrtPriceX96: string): number {
  // Convert sqrt price X96 back to regular price
  const sqrtPriceX96Big = BigInt(sqrtPriceX96);
  const sqrtPrice = Number(sqrtPriceX96Big) / (2 ** 96);
  return sqrtPrice * sqrtPrice;
}

// Common price ratios
export const COMMON_PRICE_RATIOS = {
  EQUAL: 1,        // 1:1
  DOUBLE: 2,       // 2:1
  HALF: 0.5,       // 1:2
  TEN_X: 10,       // 10:1
  TENTH: 0.1,      // 1:10
};

// Calculate price impact for large trades
export function estimatePriceImpact(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint
): number {
  // Simple constant product formula for estimation
  // This is a rough approximation, actual Uniswap V4 uses concentrated liquidity
  if (reserveIn === 0n || reserveOut === 0n) return 0;

  const amountOut = (amountIn * reserveOut) / (reserveIn + amountIn);
  const priceAfter = Number(reserveIn + amountIn) / Number(reserveOut - amountOut);
  const priceBefore = Number(reserveIn) / Number(reserveOut);

  return Math.abs(priceAfter - priceBefore) / priceBefore * 100;
}