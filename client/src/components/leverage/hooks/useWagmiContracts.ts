// Wagmi-based contract hooks for Shinrai Protocol
import { useState, useEffect } from 'react';
import { useAccount, useConnect, useDisconnect, useWriteContract, useReadContract } from 'wagmi';
import { waitForTransactionReceipt } from '@wagmi/core';
import { parseEther, formatEther, encodeFunctionData } from 'viem';
import { holesky } from 'wagmi/chains';
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
        await connect({ connector: metaMaskConnector, chainId: holesky.id });
      }
    } catch (error) {
      console.error('Connection failed:', error);
      throw error;
    }
  };

  const isOnHolesky = chainId === holesky.id;

  return {
    address,
    isConnected: isConnected && isOnHolesky,
    chainId,
    isOnHolesky,
    connectWallet,
    disconnect
  };
}

// Hook for contract interactions using Wagmi
export function useWagmiContracts() {
  const { address, isConnected } = useWagmiConnection();
  const { writeContractAsync } = useWriteContract();

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
      const poolKey = {
        currency0: token0,
        currency1: token1,
        fee: 3000, // 0.3%
        tickSpacing: 60,
        hooks: SHINRAI_CONTRACTS.LEVERAGE_HOOK as `0x${string}`
      };

      console.log('Creating pool with LeverageHook:', poolKey);

      // Step 2: Initialize Uniswap V4 Pool (following V4 docs)
      const sqrtPriceX96 = priceToSqrtPriceX96(parseFloat(initialPrice));
      console.log('Initializing Uniswap V4 pool with price:', initialPrice, 'sqrtPriceX96:', sqrtPriceX96.toString());

      const initTx = await writeContractAsync({
        address: SHINRAI_CONTRACTS.POOL_MANAGER as `0x${string}`,
        abi: POOL_MANAGER_ABI,
        functionName: 'initialize',
        args: [poolKey, sqrtPriceX96]
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