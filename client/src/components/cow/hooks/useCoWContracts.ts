import { useState, useEffect, useCallback } from 'react';
import { useAccount, useWriteContract, useReadContract, useWaitForTransactionReceipt } from 'wagmi';
import { ethers } from 'ethers';

// Contract addresses from deployment
export const COW_CONTRACT_ADDRESSES = {
  COW_HOOK: '0x42f3D2641c9Ed51aEa542298b2F92D779C9700c0' as `0x${string}`,
  COW_SOLVER: '0x03837117417572FB2a66137A11A0A0Fcc020D525' as `0x${string}`,
  POOL_MANAGER: '0xab68573623f90708958c119F7F75236b5F13EF00' as `0x${string}`,
} as const;

// Contract ABIs
export const COW_HOOK_ABI = [
  {
    "inputs": [
      {
        "components": [
          { "name": "buyOrder", "type": "tuple", "components": [
            { "name": "trader", "type": "address" },
            { "name": "tokenIn", "type": "address" },
            { "name": "tokenOut", "type": "address" },
            { "name": "amountIn", "type": "uint256" },
            { "name": "amountOutMin", "type": "uint256" },
            { "name": "deadline", "type": "uint256" },
            { "name": "nonce", "type": "uint256" },
            { "name": "signature", "type": "bytes" }
          ]},
          { "name": "sellOrder", "type": "tuple", "components": [
            { "name": "trader", "type": "address" },
            { "name": "tokenIn", "type": "address" },
            { "name": "tokenOut", "type": "address" },
            { "name": "amountIn", "type": "uint256" },
            { "name": "amountOutMin", "type": "uint256" },
            { "name": "deadline", "type": "uint256" },
            { "name": "nonce", "type": "uint256" },
            { "name": "signature", "type": "bytes" }
          ]},
          { "name": "amount", "type": "uint256" }
        ],
        "name": "cowMatch",
        "type": "tuple"
      }
    ],
    "name": "settleCoWMatch",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "name": "trader", "type": "address" }],
    "name": "nonces",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "DOMAIN_SEPARATOR",
    "outputs": [{ "name": "", "type": "bytes32" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "buyer", "type": "address" },
      { "indexed": true, "name": "seller", "type": "address" },
      { "indexed": false, "name": "tokenIn", "type": "address" },
      { "indexed": false, "name": "tokenOut", "type": "address" },
      { "indexed": false, "name": "amountIn", "type": "uint256" },
      { "indexed": false, "name": "amountOut", "type": "uint256" }
    ],
    "name": "CoWOrderMatched",
    "type": "event"
  }
] as const;

export const COW_SOLVER_ABI = [
  {
    "inputs": [
      {
        "components": [
          { "name": "trader", "type": "address" },
          { "name": "tokenIn", "type": "address" },
          { "name": "tokenOut", "type": "address" },
          { "name": "amountIn", "type": "uint256" },
          { "name": "amountOutMin", "type": "uint256" },
          { "name": "deadline", "type": "uint256" },
          { "name": "nonce", "type": "uint256" },
          { "name": "signature", "type": "bytes" }
        ],
        "name": "order",
        "type": "tuple"
      }
    ],
    "name": "submitOrder",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          { "name": "trader", "type": "address" },
          { "name": "tokenIn", "type": "address" },
          { "name": "tokenOut", "type": "address" },
          { "name": "amountIn", "type": "uint256" },
          { "name": "amountOutMin", "type": "uint256" },
          { "name": "deadline", "type": "uint256" },
          { "name": "nonce", "type": "uint256" },
          { "name": "signature", "type": "bytes" }
        ],
        "name": "buyOrder",
        "type": "tuple"
      },
      {
        "components": [
          { "name": "trader", "type": "address" },
          { "name": "tokenIn", "type": "address" },
          { "name": "tokenOut", "type": "address" },
          { "name": "amountIn", "type": "uint256" },
          { "name": "amountOutMin", "type": "uint256" },
          { "name": "deadline", "type": "uint256" },
          { "name": "nonce", "type": "uint256" },
          { "name": "signature", "type": "bytes" }
        ],
        "name": "sellOrder",
        "type": "tuple"
      },
      { "name": "amount", "type": "uint256" }
    ],
    "name": "matchOrders",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "trader", "type": "address" },
      { "indexed": false, "name": "tokenIn", "type": "address" },
      { "indexed": false, "name": "tokenOut", "type": "address" },
      { "indexed": false, "name": "amountIn", "type": "uint256" },
      { "indexed": false, "name": "amountOutMin", "type": "uint256" },
      { "indexed": false, "name": "deadline", "type": "uint256" },
      { "indexed": false, "name": "nonce", "type": "uint256" }
    ],
    "name": "OrderSubmitted",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "name": "buyer", "type": "address" },
      { "indexed": true, "name": "seller", "type": "address" },
      { "indexed": false, "name": "tokenIn", "type": "address" },
      { "indexed": false, "name": "tokenOut", "type": "address" },
      { "indexed": false, "name": "amount", "type": "uint256" }
    ],
    "name": "OrdersMatched",
    "type": "event"
  }
] as const;

// ERC20 ABI for token interactions
export const ERC20_ABI = [
  {
    "inputs": [{ "name": "spender", "type": "address" }, { "name": "amount", "type": "uint256" }],
    "name": "approve",
    "outputs": [{ "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{ "name": "owner", "type": "address" }, { "name": "spender", "type": "address" }],
    "name": "allowance",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "name": "account", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "symbol",
    "outputs": [{ "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decimals",
    "outputs": [{ "name": "", "type": "uint8" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "name",
    "outputs": [{ "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

// Types
export interface CoWOrder {
  trader: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: bigint;
  amountOutMin: bigint;
  deadline: bigint;
  nonce: bigint;
  signature: `0x${string}`;
}

export interface CoWMatch {
  buyOrder: CoWOrder;
  sellOrder: CoWOrder;
  amount: bigint;
}

export interface TokenInfo {
  address: `0x${string}`;
  name: string;
  symbol: string;
  decimals: number;
  balance: bigint;
  allowance: bigint;
}

export interface OrderEvent {
  trader: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amountIn: bigint;
  amountOutMin: bigint;
  deadline: bigint;
  nonce: bigint;
  transactionHash: string;
  blockNumber: number;
  timestamp: number;
}

export interface MatchEvent {
  buyer: `0x${string}`;
  seller: `0x${string}`;
  tokenIn: `0x${string}`;
  tokenOut: `0x${string}`;
  amount: bigint;
  transactionHash: string;
  blockNumber: number;
  timestamp: number;
}

// Hook for CoW Protocol contract interactions
export function useCoWProtocol() {
  const { address, isConnected } = useAccount();
  const { writeContract, data: writeData, error: writeError, isPending: isWritePending } = useWriteContract();

  // Read user's nonce from CoW Hook
  const { data: userNonce, refetch: refetchNonce } = useReadContract({
    address: COW_CONTRACT_ADDRESSES.COW_HOOK,
    abi: COW_HOOK_ABI,
    functionName: 'nonces',
    args: address ? [address] : undefined,
  });

  // Read domain separator from CoW Hook
  const { data: domainSeparator } = useReadContract({
    address: COW_CONTRACT_ADDRESSES.COW_HOOK,
    abi: COW_HOOK_ABI,
    functionName: 'DOMAIN_SEPARATOR',
  });

  // Wait for transaction receipt
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: writeData,
  });

  // State for managing orders and matches
  const [orders, setOrders] = useState<OrderEvent[]>([]);
  const [matches, setMatches] = useState<MatchEvent[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Create EIP-712 signature for order
  const signOrder = useCallback(async (orderData: Omit<CoWOrder, 'signature'>): Promise<`0x${string}`> => {
    if (!window.ethereum || !address || !domainSeparator) {
      throw new Error('Wallet not connected or domain separator not available');
    }

    const orderTypeHash = ethers.keccak256(
      ethers.toUtf8Bytes('CoWOrder(address trader,address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOutMin,uint256 deadline,uint256 nonce)')
    );

    const structHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'address', 'address', 'address', 'uint256', 'uint256', 'uint256', 'uint256'],
        [
          orderTypeHash,
          orderData.trader,
          orderData.tokenIn,
          orderData.tokenOut,
          orderData.amountIn,
          orderData.amountOutMin,
          orderData.deadline,
          orderData.nonce
        ]
      )
    );

    const digest = ethers.keccak256(
      ethers.solidityPacked(['string', 'bytes32', 'bytes32'], ['\x19\x01', domainSeparator, structHash])
    );

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const signature = await signer.signMessage(ethers.getBytes(digest));

    return signature as `0x${string}`;
  }, [address, domainSeparator]);

  // Submit order to CoW Solver
  const submitOrder = useCallback(async (
    tokenIn: `0x${string}`,
    tokenOut: `0x${string}`,
    amountIn: string,
    amountOutMin: string,
    deadlineHours: number
  ) => {
    if (!address || !userNonce) {
      throw new Error('Wallet not connected or nonce not available');
    }

    const deadline = BigInt(Math.floor(Date.now() / 1000) + (deadlineHours * 3600));
    const amountInBigInt = ethers.parseEther(amountIn);
    const amountOutMinBigInt = ethers.parseEther(amountOutMin);

    const orderData: Omit<CoWOrder, 'signature'> = {
      trader: address,
      tokenIn,
      tokenOut,
      amountIn: amountInBigInt,
      amountOutMin: amountOutMinBigInt,
      deadline,
      nonce: userNonce as bigint
    };

    // Sign the order
    const signature = await signOrder(orderData);

    const completeOrder: CoWOrder = {
      ...orderData,
      signature
    };

    // Submit to solver contract
    return writeContract({
      address: COW_CONTRACT_ADDRESSES.COW_SOLVER,
      abi: COW_SOLVER_ABI,
      functionName: 'submitOrder',
      args: [completeOrder]
    });
  }, [address, userNonce, signOrder, writeContract]);

  // Match orders via CoW Solver
  const matchOrders = useCallback(async (
    buyOrder: CoWOrder,
    sellOrder: CoWOrder,
    matchAmount: string
  ) => {
    const amount = ethers.parseEther(matchAmount);

    return writeContract({
      address: COW_CONTRACT_ADDRESSES.COW_SOLVER,
      abi: COW_SOLVER_ABI,
      functionName: 'matchOrders',
      args: [buyOrder, sellOrder, amount]
    });
  }, [writeContract]);

  // Settle match via CoW Hook (typically called by solver)
  const settleMatch = useCallback(async (cowMatch: CoWMatch) => {
    return writeContract({
      address: COW_CONTRACT_ADDRESSES.COW_HOOK,
      abi: COW_HOOK_ABI,
      functionName: 'settleCoWMatch',
      args: [cowMatch]
    });
  }, [writeContract]);

  // Load order history (in a real app, you'd use event logs or a subgraph)
  const loadOrderHistory = useCallback(async () => {
    if (!address) return;

    setIsLoadingHistory(true);
    try {
      // In production, you would fetch from blockchain events or a subgraph
      // For now, we'll use mock data
      setOrders([]);
      setMatches([]);
    } catch (error) {
      console.error('Failed to load order history:', error);
    } finally {
      setIsLoadingHistory(false);
    }
  }, [address]);

  // Refresh nonce after successful transactions
  useEffect(() => {
    if (isConfirmed) {
      refetchNonce();
    }
  }, [isConfirmed, refetchNonce]);

  // Load order history when wallet connects
  useEffect(() => {
    if (isConnected && address) {
      loadOrderHistory();
    }
  }, [isConnected, address, loadOrderHistory]);

  return {
    // State
    isConnected,
    address,
    userNonce: userNonce as bigint | undefined,
    domainSeparator: domainSeparator as `0x${string}` | undefined,
    orders,
    matches,
    isLoadingHistory,

    // Transaction state
    isWritePending,
    isConfirming,
    isConfirmed,
    writeError,

    // Functions
    signOrder,
    submitOrder,
    matchOrders,
    settleMatch,
    loadOrderHistory,
    refetchNonce,
  };
}

// Hook for token operations
export function useTokenOperations() {
  const { writeContract } = useWriteContract();
  const { address } = useAccount();

  // Get token info
  const getTokenInfo = useCallback(async (tokenAddress: `0x${string}`): Promise<TokenInfo | null> => {
    if (!address) return null;

    try {
      // You would use useReadContract for each of these in a real implementation
      // For now, returning mock data
      return {
        address: tokenAddress,
        name: 'Mock Token',
        symbol: 'MOCK',
        decimals: 18,
        balance: BigInt(0),
        allowance: BigInt(0)
      };
    } catch (error) {
      console.error('Failed to get token info:', error);
      return null;
    }
  }, [address]);

  // Approve token spending
  const approveToken = useCallback(async (
    tokenAddress: `0x${string}`,
    spender: `0x${string}`,
    amount: bigint
  ) => {
    return writeContract({
      address: tokenAddress,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [spender, amount]
    });
  }, [writeContract]);

  return {
    getTokenInfo,
    approveToken
  };
}

// Hook for CoW Protocol statistics
export function useCoWStats() {
  const [stats, setStats] = useState({
    totalOrders: 0,
    totalMatches: 0,
    totalVolume: BigInt(0),
    activeOrders: 0
  });

  const [isLoading, setIsLoading] = useState(false);

  const loadStats = useCallback(async () => {
    setIsLoading(true);
    try {
      // In production, you would fetch from blockchain events or analytics API
      setStats({
        totalOrders: 0,
        totalMatches: 0,
        totalVolume: BigInt(0),
        activeOrders: 0
      });
    } catch (error) {
      console.error('Failed to load CoW stats:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return {
    stats,
    isLoading,
    loadStats
  };
}