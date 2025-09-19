// React hooks for Shinrai Protocol contract interactions
import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import {
  SHINRAI_CONTRACTS,
  NETWORK_CONFIG,
  MARGIN_ROUTER_ABI,
  GLOBAL_ASSET_LEDGER_ABI,
  ERC20_ABI,
  createPoolKey,
  type LeveragePosition,
  type BorrowAuthorization
} from '../contracts';

// Hook for connecting to wallet and contracts
export function useShinraiContracts() {
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null);
  const [account, setAccount] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [marginRouter, setMarginRouter] = useState<ethers.Contract | null>(null);
  const [globalLedger, setGlobalLedger] = useState<ethers.Contract | null>(null);

  // Connect wallet
  const connectWallet = useCallback(async () => {
    try {
      if (!window.ethereum) {
        throw new Error('MetaMask not found');
      }

      const browserProvider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await browserProvider.send("eth_requestAccounts", []);

      if (accounts.length === 0) {
        throw new Error('No accounts found');
      }

      const signer = await browserProvider.getSigner();
      const account = await signer.getAddress();

      // Switch to Holesky testnet if needed
      try {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${NETWORK_CONFIG.CHAIN_ID.toString(16)}` }],
        });
      } catch (switchError: any) {
        // Add network if not exists
        if (switchError.code === 4902) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${NETWORK_CONFIG.CHAIN_ID.toString(16)}`,
              chainName: 'Holesky Testnet',
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
              rpcUrls: [NETWORK_CONFIG.RPC_URL],
              blockExplorerUrls: [NETWORK_CONFIG.EXPLORER_URL],
            }],
          });
        }
      }

      setProvider(browserProvider);
      setSigner(signer);
      setAccount(account);
      setIsConnected(true);

      // Initialize contracts
      const marginRouterContract = new ethers.Contract(
        SHINRAI_CONTRACTS.MARGIN_ROUTER,
        MARGIN_ROUTER_ABI,
        signer
      );

      const globalLedgerContract = new ethers.Contract(
        SHINRAI_CONTRACTS.GLOBAL_ASSET_LEDGER,
        GLOBAL_ASSET_LEDGER_ABI,
        signer
      );

      setMarginRouter(marginRouterContract);
      setGlobalLedger(globalLedgerContract);

    } catch (error) {
      console.error('Wallet connection failed:', error);
      throw error;
    }
  }, []);

  // Disconnect wallet
  const disconnect = useCallback(() => {
    setProvider(null);
    setSigner(null);
    setAccount('');
    setIsConnected(false);
    setMarginRouter(null);
    setGlobalLedger(null);
  }, []);

  return {
    provider,
    signer,
    account,
    isConnected,
    marginRouter,
    globalLedger,
    connectWallet,
    disconnect
  };
}

// Hook for leverage position management
export function useLeveragePositions(marginRouter: ethers.Contract | null, account: string) {
  const [positions, setPositions] = useState<LeveragePosition[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch user positions
  const fetchPositions = useCallback(async () => {
    if (!marginRouter || !account) return;

    try {
      setLoading(true);
      const positionIds = await marginRouter.getTraderPositions(account);

      const positionPromises = positionIds.map(async (id: string) => {
        const position = await marginRouter.getPosition(id);
        return {
          trader: position.trader,
          collateralToken: position.collateralToken,
          borrowedToken: position.borrowedToken,
          collateralAmount: position.collateralAmount,
          borrowedAmount: position.borrowedAmount,
          leverageRatio: Number(position.leverageRatio),
          isLongPosition: position.isLongPosition,
          openTimestamp: Number(position.openTimestamp),
          positionId: position.positionId
        } as LeveragePosition;
      });

      const userPositions = await Promise.all(positionPromises);
      setPositions(userPositions);
    } catch (error) {
      console.error('Failed to fetch positions:', error);
    } finally {
      setLoading(false);
    }
  }, [marginRouter, account]);

  // Open leverage position
  const openPosition = useCallback(async (
    collateralToken: string,
    borrowToken: string,
    collateralAmount: bigint,
    borrowAmount: bigint,
    leverageRatio: number,
    isLongPosition: boolean
  ) => {
    if (!marginRouter) throw new Error('Contract not initialized');

    const poolKey = createPoolKey(collateralToken, borrowToken);

    const tx = await marginRouter.openLeveragePosition(
      poolKey,
      collateralToken,
      collateralAmount,
      borrowAmount,
      leverageRatio,
      isLongPosition
    );

    const receipt = await tx.wait();
    await fetchPositions(); // Refresh positions
    return receipt;
  }, [marginRouter, fetchPositions]);

  // Close leverage position
  const closePosition = useCallback(async (positionId: string, collateralToken: string, borrowToken: string) => {
    if (!marginRouter) throw new Error('Contract not initialized');

    const poolKey = createPoolKey(collateralToken, borrowToken);

    const tx = await marginRouter.closeLeveragePosition(positionId, poolKey);
    const receipt = await tx.wait();
    await fetchPositions(); // Refresh positions
    return receipt;
  }, [marginRouter, fetchPositions]);

  // Check position health
  const checkPositionHealth = useCallback(async (positionId: string) => {
    if (!marginRouter) return { isHealthy: false, healthFactor: 0 };

    try {
      const [isHealthy, healthFactor] = await marginRouter.checkPositionHealth(positionId);
      return { isHealthy, healthFactor: Number(healthFactor) };
    } catch (error) {
      console.error('Failed to check position health:', error);
      return { isHealthy: false, healthFactor: 0 };
    }
  }, [marginRouter]);

  useEffect(() => {
    fetchPositions();
  }, [fetchPositions]);

  return {
    positions,
    loading,
    fetchPositions,
    openPosition,
    closePosition,
    checkPositionHealth
  };
}

// Hook for token interactions
export function useTokenOperations(signer: ethers.JsonRpcSigner | null) {
  // Get token contract
  const getTokenContract = useCallback((tokenAddress: string) => {
    if (!signer) return null;
    return new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  }, [signer]);

  // Get token balance (with silent error handling for non-existent tokens)
  const getTokenBalance = useCallback(async (tokenAddress: string, userAddress: string) => {
    const contract = getTokenContract(tokenAddress);
    if (!contract) return BigInt(0);

    try {
      return await contract.balanceOf(userAddress);
    } catch (error: any) {
      // Silent handling for non-existent tokens (0x result)
      if (error?.code === 'BAD_DATA' && error?.value === '0x') {
        return BigInt(0);
      }
      // Log other types of errors but still return 0
      console.warn('Token balance check failed (token may not exist):', tokenAddress.slice(0, 10) + '...');
      return BigInt(0);
    }
  }, [getTokenContract]);

  // Approve token spending
  const approveToken = useCallback(async (tokenAddress: string, spenderAddress: string, amount: bigint) => {
    const contract = getTokenContract(tokenAddress);
    if (!contract) throw new Error('Token contract not available');

    const tx = await contract.approve(spenderAddress, amount);
    return await tx.wait();
  }, [getTokenContract]);

  // Check allowance (with silent error handling for non-existent tokens)
  const checkAllowance = useCallback(async (tokenAddress: string, ownerAddress: string, spenderAddress: string) => {
    const contract = getTokenContract(tokenAddress);
    if (!contract) return BigInt(0);

    try {
      return await contract.allowance(ownerAddress, spenderAddress);
    } catch (error: any) {
      // Silent handling for non-existent tokens (0x result)
      if (error?.code === 'BAD_DATA' && error?.value === '0x') {
        return BigInt(0);
      }
      // Log other types of errors but still return 0
      console.warn('Token allowance check failed (token may not exist):', tokenAddress.slice(0, 10) + '...');
      return BigInt(0);
    }
  }, [getTokenContract]);

  return {
    getTokenContract,
    getTokenBalance,
    approveToken,
    checkAllowance
  };
}

// Hook for protocol state
export function useProtocolState(globalLedger: ethers.Contract | null, marginRouter: ethers.Contract | null) {
  const [maxLeverage, setMaxLeverage] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchProtocolState = useCallback(async () => {
    if (!marginRouter) return;

    try {
      setLoading(true);
      const [maxLev, paused] = await Promise.all([
        marginRouter.maxGlobalLeverage(),
        marginRouter.emergencyPaused()
      ]);

      setMaxLeverage(Number(maxLev));
      setIsPaused(paused);
    } catch (error) {
      console.error('Failed to fetch protocol state:', error);
    } finally {
      setLoading(false);
    }
  }, [marginRouter]);

  useEffect(() => {
    fetchProtocolState();
  }, [fetchProtocolState]);

  return {
    maxLeverage,
    isPaused,
    loading,
    fetchProtocolState
  };
}