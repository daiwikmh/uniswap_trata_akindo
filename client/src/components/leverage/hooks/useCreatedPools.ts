// Hook to manage and store created pools
import { useState, useEffect, useCallback } from 'react';
import { useAccount } from 'wagmi';

export interface StoredPool {
  poolId: string;
  poolKey: {
    currency0: string;
    currency1: string;
    fee: number;
    tickSpacing: number;
    hooks: string;
  };
  sqrtPriceX96: string;
  transactionHash: string;
  createdAt: number;
  createdBy: string;
  name?: string; // User-defined name for the pool
}

const POOLS_STORAGE_KEY = 'shinrai_created_pools';

export function useCreatedPools() {
  const { address } = useAccount();
  const [pools, setPools] = useState<StoredPool[]>([]);
  const [selectedPool, setSelectedPool] = useState<StoredPool | null>(null);

  // Load pools from localStorage on mount and when updated
  useEffect(() => {
    const loadPools = () => {
      try {
        console.log('🔍 Loading pools from localStorage with key:', POOLS_STORAGE_KEY);
        const stored = localStorage.getItem(POOLS_STORAGE_KEY);
        console.log('📦 Raw localStorage data:', stored);

        if (stored) {
          const parsedPools: StoredPool[] = JSON.parse(stored);
          console.log('✅ Loaded pools from localStorage:', {
            count: parsedPools.length,
            pools: parsedPools.map(p => ({
              name: p.name,
              poolId: p.poolId.slice(0, 10) + '...',
              createdBy: p.createdBy,
              createdAt: new Date(p.createdAt).toLocaleString()
            }))
          });
          setPools(parsedPools);

          // Don't auto-select here to avoid dependency loops
        } else {
          console.log('📭 No pools found in localStorage');
        }
      } catch (error) {
        console.error('❌ Failed to load stored pools:', error);
        setPools([]);
      }
    };

    // Only load on mount
    loadPools();

    // Listen for pool updates from other components
    const handlePoolsUpdated = () => {
      console.log('🔄 Received poolsUpdated event, reloading...');
      loadPools();
    };

    window.addEventListener('poolsUpdated', handlePoolsUpdated);
    return () => window.removeEventListener('poolsUpdated', handlePoolsUpdated);
  }, []); // Remove selectedPool dependency to prevent infinite loop

  // Auto-select the most recent pool when pools load and no pool is selected
  useEffect(() => {
    if (pools.length > 0 && !selectedPool) {
      const mostRecent = [...pools].sort((a, b) => b.createdAt - a.createdAt)[0];
      console.log('🎯 Auto-selecting most recent pool:', mostRecent.poolId);
      setSelectedPool(mostRecent);
    }
  }, [pools.length]); // Only trigger when pool count changes

  // Debug: Also log when address changes
  useEffect(() => {
    console.log('👤 Wallet address changed:', address);
  }, [address]);

  // Save pools to localStorage whenever pools change (with debouncing)
  useEffect(() => {
    // Don't save immediately on mount when pools is empty initially
    if (pools.length === 0) {
      // Only save empty array if we previously had pools (user cleared them)
      const existingData = localStorage.getItem(POOLS_STORAGE_KEY);
      if (!existingData) return; // Don't overwrite if there's no existing data
    }

    try {
      localStorage.setItem(POOLS_STORAGE_KEY, JSON.stringify(pools));
      console.log('💾 Saved', pools.length, 'pools to localStorage');
    } catch (error) {
      console.error('Failed to save pools:', error);
    }
  }, [pools]);

  // Add a new pool
  const addPool = useCallback((poolData: {
    poolId: string;
    poolKey: any;
    sqrtPriceX96: string;
    transactions: { initialize: string; authorize?: string };
  }) => {
    console.log('🔄 addPool called with:', poolData);

    if (!address) {
      console.warn('❌ Cannot add pool: no address connected');
      return null;
    }

    const newPool: StoredPool = {
      poolId: poolData.poolId,
      poolKey: {
        currency0: poolData.poolKey.currency0,
        currency1: poolData.poolKey.currency1,
        fee: poolData.poolKey.fee,
        tickSpacing: poolData.poolKey.tickSpacing,
        hooks: poolData.poolKey.hooks
      },
      sqrtPriceX96: poolData.sqrtPriceX96,
      transactionHash: poolData.transactions.initialize,
      createdAt: Date.now(),
      createdBy: address,
      name: `Pool ${poolData.poolKey.currency0.slice(0, 6)}.../${poolData.poolKey.currency1.slice(0, 6)}...`
    };

    console.log('📝 Creating new pool object:', newPool);

    setPools(prev => {
      // Check if pool already exists
      const exists = prev.some(p => p.poolId === newPool.poolId);
      if (exists) {
        console.log('⚠️  Pool already exists:', newPool.poolId);
        return prev;
      }

      const updated = [newPool, ...prev];
      console.log('✅ Added new pool. Updated pools list:', updated);
      return updated;
    });

    // Auto-select the new pool
    console.log('🎯 Auto-selecting new pool:', newPool.poolId);
    setSelectedPool(newPool);
    return newPool;
  }, [address]);

  // Remove a pool
  const removePool = useCallback((poolId: string) => {
    setPools(pools => pools.filter(p => p.poolId !== poolId));

    // If the removed pool was selected, select another one
    if (selectedPool?.poolId === poolId) {
      setSelectedPool(() => {
        const remaining = pools.filter(p => p.poolId !== poolId);
        return remaining.length > 0 ? remaining[0] : null;
      });
    }
  }, [selectedPool, pools]);

  // Update pool name
  const updatePoolName = useCallback((poolId: string, name: string) => {
    setPools(prev => prev.map(p =>
      p.poolId === poolId ? { ...p, name } : p
    ));

    if (selectedPool?.poolId === poolId) {
      setSelectedPool(prev => prev ? { ...prev, name } : null);
    }
  }, [selectedPool]);

  // Get pools created by current user
  const userPools = pools.filter(p =>
    !address || p.createdBy.toLowerCase() === address.toLowerCase()
  );

  // Get all pools (including those created by others)
  const allPools = pools;

  // Clear all pools
  const clearPools = useCallback(() => {
    setPools([]);
    setSelectedPool(null);
    localStorage.removeItem(POOLS_STORAGE_KEY);
  }, []);

   return {
    pools: allPools,
    userPools,
    selectedPool,
    setSelectedPool,
    addPool,
    removePool,
    updatePoolName,
    clearPools,
    hasSelectedPool: !!selectedPool,
  };
}

// Hook to get token symbols from addresses
export function useTokenSymbols() {
  const getTokenSymbol = useCallback(async (tokenAddress: string): Promise<string> => {
    try {
      // Try to fetch from a simple RPC call
      const response = await fetch('https://eth-sepolia.g.alchemy.com/v2/t7Oxw5b_OpDL6yQVWN70ZjxO6hTCaZeW', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_call',
          params: [
            {
              to: tokenAddress,
              data: '0x95d89b41' // symbol() function selector
            },
            'latest'
          ],
          id: 1
        })
      });

      const result = await response.json();
      if (result.result && result.result !== '0x') {
        // Decode hex to string
        const hex = result.result.slice(2);
        const str = Buffer.from(hex, 'hex').toString('utf8').replace(/\0/g, '');
        return str || tokenAddress.slice(0, 6) + '...';
      }
    } catch (error) {
      console.warn('Failed to fetch token symbol for', tokenAddress, error);
    }

    // Fallback to shortened address
    return tokenAddress.slice(0, 6) + '...';
  }, []);

  return { getTokenSymbol };
}