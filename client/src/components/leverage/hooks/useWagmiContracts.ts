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
        hooks: "0x0000000000000000000000000000000000000000" as `0x${string}` // No hook - using official PoolManager
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
        const poolId = generatePoolId(currency0, currency1);
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

      // Step 3: Authorize pool for leverage trading (optional)
      let authTx;
      try {
        console.log('Authorizing pool for leverage trading...');
        authTx = await writeContractAsync({
          address: SHINRAI_CONTRACTS.MARGIN_ROUTER as `0x${string}`,
          abi: MARGIN_ROUTER_ABI,
          functionName: 'authorizePool',
          args: [poolKey, BigInt(maxLeverage)]
        });
        console.log('Pool authorization transaction:', authTx);
      } catch (authError) {
        console.warn('Pool authorization failed (may not be implemented):', authError);
        // Continue anyway - pool creation succeeded
      }

      // Generate pool ID for tracking
      const poolId = generatePoolId(token0, token1);

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

  return {
    address,
    isConnected,
    createLeveragePool,
    openLeveragePosition,
    approveToken
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