// Hook for fetching Uniswap V4 pool data following official documentation
import { useState, useEffect, useCallback } from 'react';
import { useReadContract, useAccount } from 'wagmi';
import { formatEther, parseEther } from 'viem';
import {
  SHINRAI_CONTRACTS,
  POOL_MANAGER_ABI,
  MARGIN_ROUTER_ABI,
  generatePoolId,
  priceToSqrtPriceX96
} from '../contracts';

export interface PoolData {
  poolId: string;
  sqrtPriceX96: bigint;
  tick: number;
  protocolFee: number;
  lpFee: number;
  liquidity: bigint;
  price: number;
  isInitialized: boolean;
  token0: string;
  token1: string;
  hooks: string;
}

export interface LeveragePoolInfo {
  poolData: PoolData | null;
  isAuthorized: boolean;
  maxLeverage: number;
  totalPositions: number;
  isLoading: boolean;
  error: string | null;
}

// Hook to fetch comprehensive pool data
export function usePoolData(poolKey: any) {
  const [poolData, setPoolData] = useState<PoolData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Generate pool ID from pool key
  const poolId = poolKey ? generatePoolId(poolKey.currency0, poolKey.currency1) : null;

  // Fetch pool slot0 data (price, tick, fees)
  const { data: slot0Data } = useReadContract({
    address: SHINRAI_CONTRACTS.POOL_MANAGER as `0x${string}`,
    abi: POOL_MANAGER_ABI,
    functionName: 'getSlot0',
    args: poolId ? [poolId as `0x${string}`] : undefined,
    query: {
      enabled: !!poolId,
      refetchInterval: 10000 // Refresh every 10 seconds
    }
  });

  // Fetch pool liquidity
  const { data: liquidityData } = useReadContract({
    address: SHINRAI_CONTRACTS.POOL_MANAGER as `0x${string}`,
    abi: [
      {
        "type": "function",
        "name": "getLiquidity",
        "inputs": [{"name": "poolId", "type": "bytes32"}],
        "outputs": [{"name": "liquidity", "type": "uint128"}],
        "stateMutability": "view"
      }
    ],
    functionName: 'getLiquidity',
    args: poolId ? [poolId as `0x${string}`] : undefined,
    query: {
      enabled: !!poolId,
      refetchInterval: 10000
    }
  });

  // Process pool data when slot0 changes
  useEffect(() => {
    if (!slot0Data || !poolKey || !poolId) {
      setPoolData(null);
      return;
    }

    try {
      setIsLoading(true);

      const [sqrtPriceX96, tick, protocolFee, lpFee] = slot0Data as [bigint, number, number, number];

      // Calculate human-readable price from sqrtPriceX96
      const price = calculatePriceFromSqrtPriceX96(sqrtPriceX96);

      const poolDataObj: PoolData = {
        poolId,
        sqrtPriceX96,
        tick,
        protocolFee,
        lpFee,
        liquidity: liquidityData as bigint || 0n,
        price,
        isInitialized: sqrtPriceX96 > 0n,
        token0: poolKey.currency0,
        token1: poolKey.currency1,
        hooks: poolKey.hooks
      };

      setPoolData(poolDataObj);
      setError(null);
    } catch (err) {
      console.error('Error processing pool data:', err);
      setError('Failed to process pool data');
    } finally {
      setIsLoading(false);
    }
  }, [slot0Data, liquidityData, poolKey, poolId]);

  return {
    poolData,
    isLoading,
    error,
    refetch: () => {
      // Trigger refetch of contract data
      setIsLoading(true);
    }
  };
}

// Hook for leverage-specific pool information
export function useLeveragePoolInfo(poolKey: any): LeveragePoolInfo {
  const { poolData, isLoading: poolLoading, error } = usePoolData(poolKey);
  const { address } = useAccount();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [maxLeverage, setMaxLeverage] = useState(0);
  const [totalPositions, setTotalPositions] = useState(0);

  // Check if pool is authorized for leverage trading
  useEffect(() => {
    const checkAuthorization = async () => {
      if (!poolData || !address) return;

      try {
        // This would need to be implemented based on MarginRouter's state
        // For now, assume authorized if pool exists
        setIsAuthorized(poolData.isInitialized);
        setMaxLeverage(1000); // Default 10x leverage
      } catch (err) {
        console.error('Failed to check pool authorization:', err);
        setIsAuthorized(false);
      }
    };

    checkAuthorization();
  }, [poolData, address]);

  // Fetch user's positions in this pool
  useEffect(() => {
    const fetchPositions = async () => {
      if (!address || !poolData) return;

      try {
        // This would fetch positions from MarginRouter
        // Implementation depends on contract's position tracking
        setTotalPositions(0); // Placeholder
      } catch (err) {
        console.error('Failed to fetch positions:', err);
        setTotalPositions(0);
      }
    };

    fetchPositions();
  }, [address, poolData]);

  return {
    poolData,
    isAuthorized,
    maxLeverage,
    totalPositions,
    isLoading: poolLoading,
    error
  };
}

// Hook for managing leverage positions
export function useLeveragePositions(poolKey: any) {
  const { address } = useAccount();
  const [positions, setPositions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch user positions from MarginRouter
  const { data: positionIds } = useReadContract({
    address: SHINRAI_CONTRACTS.MARGIN_ROUTER as `0x${string}`,
    abi: MARGIN_ROUTER_ABI,
    functionName: 'getTraderPositions',
    args: address ? [address] : undefined,
    query: {
      enabled: !!address,
      refetchInterval: 15000 // Refresh every 15 seconds
    }
  });

  // Process position data
  useEffect(() => {
    const fetchPositionDetails = async () => {
      if (!positionIds || !Array.isArray(positionIds) || positionIds.length === 0) {
        setPositions([]);
        return;
      }

      setIsLoading(true);
      try {
        // Fetch details for each position
        const positionDetails = [];
        for (const positionId of positionIds) {
          try {
            // This would use getPosition function from MarginRouter
            // Implementation depends on the contract's position structure
            positionDetails.push({
              id: positionId,
              // Add position data here
            });
          } catch (err) {
            console.error('Failed to fetch position:', positionId, err);
          }
        }
        setPositions(positionDetails);
      } catch (err) {
        console.error('Failed to fetch position details:', err);
        setPositions([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPositionDetails();
  }, [positionIds]);

  return {
    positions,
    isLoading,
    totalPositions: positions.length
  };
}

// Utility function to calculate price from sqrtPriceX96
function calculatePriceFromSqrtPriceX96(sqrtPriceX96: bigint): number {
  if (sqrtPriceX96 === 0n) return 0;

  try {
    // Convert sqrtPriceX96 back to price
    // price = (sqrtPriceX96 / 2^96)^2
    const Q96 = 2n ** 96n;
    const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
    return sqrtPrice * sqrtPrice;
  } catch (err) {
    console.error('Error calculating price:', err);
    return 0;
  }
}

// Hook for real-time pool monitoring
export function usePoolMonitoring(poolKey: any) {
  const { poolData, isLoading } = usePoolData(poolKey);
  const [priceHistory, setPriceHistory] = useState<Array<{timestamp: number, price: number}>>([]);
  const [alerts, setAlerts] = useState<string[]>([]);

  // Track price changes
  useEffect(() => {
    if (!poolData || poolData.price === 0) return;

    const now = Date.now();
    setPriceHistory(prev => {
      const newHistory = [...prev, { timestamp: now, price: poolData.price }];
      // Keep only last 100 price points
      return newHistory.slice(-100);
    });

    // Price change alerts (example)
    if (priceHistory.length > 1) {
      const lastPrice = priceHistory[priceHistory.length - 1]?.price || 0;
      const priceChange = Math.abs(poolData.price - lastPrice) / lastPrice;

      if (priceChange > 0.05) { // 5% change
        setAlerts(prev => [...prev, `Significant price movement: ${(priceChange * 100).toFixed(2)}%`]);
      }
    }
  }, [poolData, priceHistory]);

  return {
    poolData,
    priceHistory,
    alerts,
    isLoading,
    currentPrice: poolData?.price || 0,
    priceChange24h: calculatePriceChange24h(priceHistory)
  };
}

function calculatePriceChange24h(priceHistory: Array<{timestamp: number, price: number}>): number {
  if (priceHistory.length < 2) return 0;

  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;

  const oldPrice = priceHistory.find(p => p.timestamp >= dayAgo)?.price;
  const currentPrice = priceHistory[priceHistory.length - 1]?.price;

  if (!oldPrice || !currentPrice) return 0;

  return ((currentPrice - oldPrice) / oldPrice) * 100;
}