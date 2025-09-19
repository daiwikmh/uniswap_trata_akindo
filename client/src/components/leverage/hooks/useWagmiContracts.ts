// Wagmi-based contract hooks for Shinrai Protocol
import { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useWriteContract, useReadContract, usePublicClient } from 'wagmi';
import { waitForTransactionReceipt } from '@wagmi/core';
import { parseEther, formatEther, encodeFunctionData } from 'viem';
import { sepolia } from 'wagmi/chains';
import {
  SHINRAI_CONTRACTS,
  PROTOCOL_CONFIG,
  POOL_MANAGER_ABI,
  MARGIN_ROUTER_ABI,
  GLOBAL_ASSET_LEDGER_ABI,
  ERC20_ABI,
  createPoolKey,
  priceToSqrtPriceX96,
  generatePoolId,
  type LeveragePosition,
  type BorrowAuthorization
} from '../contracts';

// Hook for Wagmi-based wallet connection
export function useWagmiConnection() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const connectWallet = async () => {
    try {
      const metaMaskConnector = connectors.find(connector => connector.name === 'MetaMask');
      if (metaMaskConnector) {
        await connect({ connector: metaMaskConnector, chainId: sepolia.id });
      }
    } catch (error) {
      console.error('Connection failed:', error);
      throw error;
    }
  };

  const isOnSepolia = chainId === sepolia.id;

  return {
    address,
    isConnected: isConnected && isOnSepolia,
    chainId,
    isOnSepolia,
    connectWallet,
    disconnect
  };
}

// Hook for contract interactions using Wagmi
export function useWagmiContracts() {
  const { address, isConnected } = useWagmiConnection();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  // Create leverage pool with Uniswap V4 pattern
  const createLeveragePool = async (
    token0: `0x${string}`,
    token1: `0x${string}`,
    initialPrice: string,
    maxLeverage: number,
    borrowCap: string
  ) => {
    if (!isConnected || !address) {
      throw new Error('Wallet not connected');
    }

    try {
      // Step 1: Create PoolKey with LeverageHook
      // Ensure proper token ordering - uint160(currency0) < uint160(currency1) as per Uniswap V4 docs
      const token0Uint = BigInt(token0);
      const token1Uint = BigInt(token1);
      const [currency0, currency1] = token0Uint < token1Uint
        ? [token0, token1]
        : [token1, token0];

      const poolKey = {
        currency0: currency0 as `0x${string}`,
        currency1: currency1 as `0x${string}`,
        fee: 3000, // 0.3% fee in pips as per Uniswap V4 docs
        tickSpacing: 60, // Granularity - per Uniswap V4 docs
        hooks: SHINRAI_CONTRACTS.LEVERAGE_HOOK as `0x${string}` // Use LeverageHook for leverage trading
      };

      console.log('Creating pool with LeverageHook:', poolKey);

      // Step 2: Initialize Uniswap V4 Pool (following V4 docs)
      const sqrtPriceX96 = priceToSqrtPriceX96(parseFloat(initialPrice));
      console.log('=== Pool Initialization Debug ===');
      console.log('PoolManager Address:', SHINRAI_CONTRACTS.POOL_MANAGER);
      console.log('Initial Price:', initialPrice);
      console.log('Calculated sqrtPriceX96:', sqrtPriceX96.toString());
      console.log('PoolKey Structure:', {
        currency0: poolKey.currency0,
        currency1: poolKey.currency1,
        fee: poolKey.fee,
        tickSpacing: poolKey.tickSpacing,
        hooks: poolKey.hooks
      });

      // Verify PoolKey structure
      if (!poolKey.currency0 || !poolKey.currency1 || !poolKey.hooks) {
        throw new Error('Invalid PoolKey: missing required fields');
      }

      // Step 2.1: Initialize the pool directly (PoolManager verification happens in transaction)
      console.log('Note: PoolManager at:', SHINRAI_CONTRACTS.POOL_MANAGER);
      console.log('LeverageHook at:', SHINRAI_CONTRACTS.LEVERAGE_HOOK);

      // Step 2.2: Validate all parameters before contract call
      console.log('=== Pre-Contract Call Validation ===');
      console.log('PoolManager Address Valid:', /^0x[a-fA-F0-9]{40}$/.test(SHINRAI_CONTRACTS.POOL_MANAGER));
      console.log('Currency0 Valid:', /^0x[a-fA-F0-9]{40}$/.test(poolKey.currency0));
      console.log('Currency1 Valid:', /^0x[a-fA-F0-9]{40}$/.test(poolKey.currency1));
      console.log('Currency Ordering Valid:', BigInt(poolKey.currency0) < BigInt(poolKey.currency1));
      console.log('Hooks Valid:', /^0x[a-fA-F0-9]{40}$/.test(poolKey.hooks));
      console.log('Fee Type:', typeof poolKey.fee, poolKey.fee);
      console.log('TickSpacing Type:', typeof poolKey.tickSpacing, poolKey.tickSpacing);
      console.log('SqrtPriceX96 Type:', typeof sqrtPriceX96, sqrtPriceX96.toString());

      // Ensure all types are correct
      const validatedPoolKey = {
        currency0: poolKey.currency0,
        currency1: poolKey.currency1,
        fee: Number(poolKey.fee),
        tickSpacing: Number(poolKey.tickSpacing),
        hooks: poolKey.hooks
      };

      console.log('Validated PoolKey:', validatedPoolKey);

      // Step 2.3: Check if pool already exists first
      console.log('Checking if pool already exists...');
      try {
        const poolId = generatePoolId(currency0, currency1, poolKey.fee, poolKey.tickSpacing);
        console.log('Generated Pool ID:', poolId);

        const slot0 = await publicClient?.readContract({
          address: SHINRAI_CONTRACTS.POOL_MANAGER as `0x${string}`,
          abi: POOL_MANAGER_ABI,
          functionName: 'getSlot0',
          args: [poolId as `0x${string}`]
        });

        console.log('Pool slot0 data:', slot0);
        if (slot0 && slot0[0] !== 0n) {
          throw new Error('Pool already exists with this token pair');
        }
      } catch (readError) {
        console.log('Pool check result:', readError);
      }

      // Step 2.4: Initialize pool with official Uniswap V4 PoolManager
      console.log('Calling official PoolManager.initialize...');
      const initTx = await writeContractAsync({
        address: SHINRAI_CONTRACTS.POOL_MANAGER as `0x${string}`,
        abi: POOL_MANAGER_ABI,
        functionName: 'initialize',
        args: [validatedPoolKey, sqrtPriceX96]
      });

      console.log('Pool initialization transaction:', initTx);

      // Step 3: Pool authorization (OWNER ONLY!)
      // Note: Only the protocol owner can authorize pools for leverage trading
      // Regular users cannot call authorizePool due to onlyOwner modifier
      console.log('⚠️  Pool created but not authorized for leverage trading');
      console.log('ℹ️  Pool authorization requires protocol owner privileges');
      console.log('ℹ️  Pool can be used for regular swaps but not leverage positions');

      let authTx = null;
      // Try to authorize if user might be the owner (will fail gracefully if not)
      try {
        console.log('Attempting pool authorization (may fail if not owner)...');
        authTx = await writeContractAsync({
          address: SHINRAI_CONTRACTS.MARGIN_ROUTER as `0x${string}`,
          abi: MARGIN_ROUTER_ABI,
          functionName: 'authorizePool',
          args: [validatedPoolKey, BigInt(maxLeverage)]
        });
        console.log('✅ Pool authorization transaction sent:', authTx);

        // Wait for transaction to be mined
        if (authTx && publicClient) {
          console.log('⏳ Waiting for authorization transaction to be mined...');
          const receipt = await publicClient.waitForTransactionReceipt({
            hash: authTx,
            timeout: 30000 // 30 second timeout
          });
          console.log('✅ Authorization transaction mined:', receipt.status);
        }
      } catch (authError: any) {
        console.warn('❌ Pool authorization failed (expected for non-owner users):', authError.message);
        console.log('📝 Pool created successfully but requires owner authorization for leverage trading');
        // Don't throw error - pool creation succeeded
      }

      // Generate pool ID for tracking (ensure consistency with authorization check)
      const poolId = generatePoolId(currency0, currency1, poolKey.fee, poolKey.tickSpacing);
      console.log('🆔 Final Pool ID for tracking:', poolId);
      console.log('🔧 Pool parameters used:', {
        currency0,
        currency1,
        fee: poolKey.fee,
        tickSpacing: poolKey.tickSpacing
      });

      return {
        poolKey,
        poolId,
        sqrtPriceX96: sqrtPriceX96.toString(),
        transactions: {
          initialize: initTx,
          authorize: authTx
        }
      };

    } catch (error) {
      console.error('Pool creation failed:', error);
      throw error;
    }
  };

  // Open leverage position
  const openLeveragePosition = async (
    poolKey: any,
    collateralToken: `0x${string}`,
    collateralAmount: string,
    borrowAmount: string,
    leverageRatio: number,
    isLongPosition: boolean
  ) => {
    if (!isConnected || !address) {
      throw new Error('Wallet not connected');
    }

    try {
      const collateralBigInt = parseEther(collateralAmount);
      const borrowBigInt = parseEther(borrowAmount);

      const tx = await writeContractAsync({
        address: SHINRAI_CONTRACTS.MARGIN_ROUTER as `0x${string}`,
        abi: MARGIN_ROUTER_ABI,
        functionName: 'openLeveragePosition',
        args: [
          poolKey,
          collateralToken,
          collateralBigInt,
          borrowBigInt,
          BigInt(leverageRatio),
          isLongPosition
        ]
      });

      return tx;
    } catch (error) {
      console.error('Failed to open position:', error);
      throw error;
    }
  };

  // Approve token spending
  const approveToken = async (
    tokenAddress: `0x${string}`,
    spenderAddress: `0x${string}`,
    amount: string
  ) => {
    if (!isConnected) {
      throw new Error('Wallet not connected');
    }

    try {
      const tx = await writeContractAsync({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [spenderAddress, parseEther(amount)]
      });

      return tx;
    } catch (error) {
      console.error('Token approval failed:', error);
      throw error;
    }
  };

  // Check if pool is authorized for leverage trading
  const checkPoolAuthorization = async (poolKey: any): Promise<boolean> => {
    if (!publicClient) return false;

    try {
      // Generate poolId same way as contract does
      const poolId = generatePoolId(poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing);

      console.log('🔍 Checking authorization for pool:', {
        poolId,
        poolKey: {
          currency0: poolKey.currency0,
          currency1: poolKey.currency1,
          fee: poolKey.fee,
          tickSpacing: poolKey.tickSpacing
        }
      });

      const isAuthorized = await publicClient.readContract({
        address: SHINRAI_CONTRACTS.MARGIN_ROUTER as `0x${string}`,
        abi: MARGIN_ROUTER_ABI,
        functionName: 'authorizedPools',
        args: [poolId as `0x${string}`]
      });

      console.log('🔍 Authorization check result:', {
        poolId,
        isAuthorized: isAuthorized as boolean
      });

      return isAuthorized as boolean;
    } catch (error) {
      console.error('Failed to check pool authorization:', error);
      return false;
    }
  };

  // Manual pool authorization (for protocol owner only)
  const authorizePoolManually = async (poolKey: any, leverageCap: number = 1000) => {
    if (!isConnected || !address) {
      throw new Error('Wallet not connected');
    }

    try {
      const poolId = generatePoolId(poolKey.currency0, poolKey.currency1, poolKey.fee, poolKey.tickSpacing);

      console.log('⚠️  Attempting manual pool authorization (owner only)...');
      console.log('🆔 Pool ID:', poolId);
      console.log('🔧 Pool Key:', poolKey);
      console.log('📊 Leverage Cap:', leverageCap);

      const tx = await writeContractAsync({
        address: SHINRAI_CONTRACTS.MARGIN_ROUTER as `0x${string}`,
        abi: MARGIN_ROUTER_ABI,
        functionName: 'authorizePool',
        args: [poolKey, BigInt(leverageCap)]
      });

      console.log('✅ Pool authorization transaction sent:', tx);

      // Wait for transaction to be mined
      if (publicClient) {
        console.log('⏳ Waiting for manual authorization transaction to be mined...');
        const receipt = await publicClient.waitForTransactionReceipt({
          hash: tx,
          timeout: 30000 // 30 second timeout
        });
        console.log('✅ Manual authorization transaction mined:', receipt.status);

        // Small delay to ensure state is updated
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Verify authorization worked
        const isAuthorized = await checkPoolAuthorization(poolKey);
        console.log('🔍 Post-authorization verification:', isAuthorized);
      }

      return tx;
    } catch (error) {
      console.error('❌ Pool authorization failed:', error);
      throw new Error(`Pool authorization failed: ${error.message}`);
    }
  };

  return {
    address,
    isConnected,
    createLeveragePool,
    openLeveragePosition,
    approveToken,
    checkPoolAuthorization,
    authorizePoolManually
  };
}

// Hook for reading token information
export function useTokenInfo(tokenAddress: `0x${string}` | undefined) {
  const { data: symbol } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'symbol',
    query: {
      enabled: !!tokenAddress,
      retry: false,
      refetchOnWindowFocus: false
    }
  });

  const { data: name } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'name',
    query: {
      enabled: !!tokenAddress,
      retry: false,
      refetchOnWindowFocus: false
    }
  });

  const { data: decimals } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'decimals',
    query: {
      enabled: !!tokenAddress,
      retry: false,
      refetchOnWindowFocus: false
    }
  });

  const { address: userAddress } = useAccount();
  const { data: balance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: userAddress ? [userAddress] : undefined,
    query: {
      enabled: !!(tokenAddress && userAddress),
      retry: false,
      refetchOnWindowFocus: false
    }
  });

  const { data: allowance } = useReadContract({
    address: tokenAddress,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: userAddress ? [userAddress, SHINRAI_CONTRACTS.MARGIN_ROUTER as `0x${string}`] : undefined,
    query: {
      enabled: !!(tokenAddress && userAddress),
      retry: false, // Don't retry on failed calls
      refetchOnWindowFocus: false
    }
  });

  return {
    symbol: symbol as string,
    name: name as string,
    decimals: decimals as number,
    balance: balance as bigint,
    allowance: allowance as bigint,
    isLoaded: !!(symbol && name && typeof decimals === 'number')
  };
}

// Note: generatePoolId is now imported from contracts.ts

// Hook for protocol state
export function useProtocolState() {
  const { data: maxLeverage } = useReadContract({
    address: SHINRAI_CONTRACTS.MARGIN_ROUTER as `0x${string}`,
    abi: MARGIN_ROUTER_ABI,
    functionName: 'maxGlobalLeverage'
  });

  const { data: isPaused } = useReadContract({
    address: SHINRAI_CONTRACTS.MARGIN_ROUTER as `0x${string}`,
    abi: MARGIN_ROUTER_ABI,
    functionName: 'emergencyPaused'
  });

  return {
    maxLeverage: maxLeverage ? Number(maxLeverage) : 1000,
    isPaused: isPaused || false
  };
}