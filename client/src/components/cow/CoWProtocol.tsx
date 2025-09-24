import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { useAccount, useWriteContract, useReadContract, useWaitForTransactionReceipt } from 'wagmi';
import {
  Shuffle,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Wallet,
  Copy,
  ExternalLink,
  RefreshCw,
  Waves,
  Plus
} from 'lucide-react';
import {
  DEPLOYED_TOKENS,
  TOKEN_METADATA,
  FEE_TIERS,
  createPoolKey,
  validateTokenPair,
  calculateSqrtPriceX96,
  COMMON_PRICE_RATIOS,
  type TokenInfo
} from '@/constants/tokens';

// Contract ABIs
const COW_HOOK_ABI = [
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
  }
] as const;

const COW_SOLVER_ABI = [
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
  }
] as const;

const ERC20_ABI = [
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
  }
] as const;

// Contract addresses from deployment
const CONTRACT_ADDRESSES = {
  COW_HOOK: '0x42f3D2641c9Ed51aEa542298b2F92D779C9700c0',
  COW_SOLVER: '0x03837117417572FB2a66137A11A0A0Fcc020D525',
  POOL_MANAGER: '0xab68573623f90708958c119F7F75236b5F13EF00',
} as const;

// Pool Manager ABI for pool creation
const POOL_MANAGER_ABI = [
  {
    "inputs": [
      {
        "components": [
          { "name": "currency0", "type": "address" },
          { "name": "currency1", "type": "address" },
          { "name": "fee", "type": "uint24" },
          { "name": "tickSpacing", "type": "int24" },
          { "name": "hooks", "type": "address" }
        ],
        "name": "key",
        "type": "tuple"
      },
      { "name": "sqrtPriceX96", "type": "uint160" }
    ],
    "name": "initialize",
    "outputs": [{ "name": "tick", "type": "int24" }],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;

// Use actual deployed tokens
const MOCK_TOKENS = {
  TEST0: DEPLOYED_TOKENS.TEST0,
  TEST1: DEPLOYED_TOKENS.TEST1,
} as const;

interface CoWOrder {
  trader: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOutMin: string;
  deadline: number;
  nonce: number;
  signature: string;
}

interface TokenInfo {
  address: string;
  symbol: string;
  balance: bigint;
  allowance: bigint;
  decimals: number;
}

const CoWProtocol: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { writeContract } = useWriteContract();

  // State
  const [activeTab, setActiveTab] = useState<'create' | 'match' | 'history' | 'pools'>('create');
  const [orderType, setOrderType] = useState<'buy' | 'sell'>('buy');

  // Order creation state
  const [selectedTokenIn, setSelectedTokenIn] = useState(MOCK_TOKENS.TEST0);
  const [selectedTokenOut, setSelectedTokenOut] = useState(MOCK_TOKENS.TEST1);
  const [amountIn, setAmountIn] = useState('');
  const [amountOutMin, setAmountOutMin] = useState('');
  const [orderDeadline, setOrderDeadline] = useState(24); // hours
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);

  // Pool creation state
  const [poolName, setPoolName] = useState('');
  const [poolToken0, setPoolToken0] = useState(MOCK_TOKENS.TEST0);
  const [poolToken1, setPoolToken1] = useState(MOCK_TOKENS.TEST1);
  const [poolFee, setPoolFee] = useState(FEE_TIERS.MEDIUM);
  const [initialPrice, setInitialPrice] = useState(COMMON_PRICE_RATIOS.EQUAL);
  const [isCreatingPool, setIsCreatingPool] = useState(false);
  const [createdPools, setCreatedPools] = useState<any[]>([]);

  // Order matching state
  const [pendingOrders, setPendingOrders] = useState<CoWOrder[]>([]);
  const [selectedBuyOrder, setSelectedBuyOrder] = useState<CoWOrder | null>(null);
  const [selectedSellOrder, setSelectedSellOrder] = useState<CoWOrder | null>(null);
  const [matchAmount, setMatchAmount] = useState('');
  const [isMatching, setIsMatching] = useState(false);

  // Token information
  const [tokens, setTokens] = useState<Record<string, TokenInfo>>({});
  const [loadingTokens, setLoadingTokens] = useState(false);

  // Get user's nonce
  const { data: userNonce } = useReadContract({
    address: CONTRACT_ADDRESSES.COW_HOOK,
    abi: COW_HOOK_ABI,
    functionName: 'nonces',
    args: address ? [address] : undefined,
  });

  // Get domain separator
  const { data: domainSeparator } = useReadContract({
    address: CONTRACT_ADDRESSES.COW_HOOK,
    abi: COW_HOOK_ABI,
    functionName: 'DOMAIN_SEPARATOR',
  });

  // Load token information
  const loadTokenInfo = useCallback(async () => {
    if (!address) return;

    setLoadingTokens(true);
    const tokenAddresses = Object.keys(TOKEN_METADATA);
    const tokenInfo: Record<string, TokenInfo> = {};

    for (const tokenAddress of tokenAddresses) {
      try {
        const tokenMeta = TOKEN_METADATA[tokenAddress];
        // This would need proper contract calls in a real implementation
        tokenInfo[tokenAddress] = {
          address: tokenAddress,
          symbol: tokenMeta.symbol,
          balance: BigInt(0), // Would fetch from contract
          allowance: BigInt(0), // Would fetch from contract
          decimals: tokenMeta.decimals
        };
      } catch (error) {
        console.error(`Failed to load token info for ${tokenAddress}:`, error);
      }
    }

    setTokens(tokenInfo);
    setLoadingTokens(false);
  }, [address]);

  useEffect(() => {
    if (isConnected && address) {
      loadTokenInfo();
    }
  }, [isConnected, address, loadTokenInfo]);

  // Create EIP-712 signature for order
  const signOrder = async (order: Omit<CoWOrder, 'signature'>): Promise<string> => {
    if (!window.ethereum || !address) {
      throw new Error('Wallet not connected');
    }

    const orderTypeHash = ethers.keccak256(
      ethers.toUtf8Bytes('CoWOrder(address trader,address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOutMin,uint256 deadline,uint256 nonce)')
    );

    const structHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ['bytes32', 'address', 'address', 'address', 'uint256', 'uint256', 'uint256', 'uint256'],
        [
          orderTypeHash,
          order.trader,
          order.tokenIn,
          order.tokenOut,
          order.amountIn,
          order.amountOutMin,
          order.deadline,
          order.nonce
        ]
      )
    );

    const digest = ethers.keccak256(
      ethers.solidityPacked(['string', 'bytes32', 'bytes32'], ['\x19\x01', domainSeparator, structHash])
    );

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const signature = await signer.signMessage(ethers.getBytes(digest));

    return signature;
  };

  // Handle order creation
  const handleCreateOrder = async () => {
    if (!address || !amountIn || !amountOutMin) return;

    try {
      setIsCreatingOrder(true);

      const deadline = Math.floor(Date.now() / 1000) + (orderDeadline * 3600);
      const nonce = Number(userNonce || 0);

      const orderData: Omit<CoWOrder, 'signature'> = {
        trader: address,
        tokenIn: selectedTokenIn,
        tokenOut: selectedTokenOut,
        amountIn: ethers.parseEther(amountIn).toString(),
        amountOutMin: ethers.parseEther(amountOutMin).toString(),
        deadline,
        nonce
      };

      // Sign the order
      const signature = await signOrder(orderData);

      const completeOrder: CoWOrder = {
        ...orderData,
        signature
      };

      // Submit order to solver
      await writeContract({
        address: CONTRACT_ADDRESSES.COW_SOLVER,
        abi: COW_SOLVER_ABI,
        functionName: 'submitOrder',
        args: [completeOrder]
      });

      // Add to pending orders (in production, this would come from events)
      setPendingOrders(prev => [...prev, completeOrder]);

      // Reset form
      setAmountIn('');
      setAmountOutMin('');
      setOrderDeadline(24);

      alert('Order created successfully!');
    } catch (error) {
      console.error('Failed to create order:', error);
      alert(`Failed to create order: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsCreatingOrder(false);
    }
  };

  // Handle order matching
  const handleMatchOrders = async () => {
    if (!selectedBuyOrder || !selectedSellOrder || !matchAmount) return;

    try {
      setIsMatching(true);

      await writeContract({
        address: CONTRACT_ADDRESSES.COW_SOLVER,
        abi: COW_SOLVER_ABI,
        functionName: 'matchOrders',
        args: [selectedBuyOrder, selectedSellOrder, ethers.parseEther(matchAmount)]
      });

      // Remove matched orders from pending
      setPendingOrders(prev => prev.filter(
        order => order !== selectedBuyOrder && order !== selectedSellOrder
      ));

      setSelectedBuyOrder(null);
      setSelectedSellOrder(null);
      setMatchAmount('');

      alert('Orders matched successfully!');
    } catch (error) {
      console.error('Failed to match orders:', error);
      alert(`Failed to match orders: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsMatching(false);
    }
  };

  const formatAddress = (address: string): string => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatAmount = (amount: string): string => {
    return ethers.formatEther(amount);
  };

  // Pool creation function
  const handleCreatePool = async () => {
    if (!poolName || !poolToken0 || !poolToken1) return;

    const token0Info = TOKEN_METADATA[poolToken0];
    const token1Info = TOKEN_METADATA[poolToken1];

    if (!token0Info || !token1Info) {
      alert('Invalid token selection');
      return;
    }

    const errors = validateTokenPair(token0Info, token1Info);
    if (errors.length > 0) {
      alert(`Validation errors: ${errors.join(', ')}`);
      return;
    }

    try {
      setIsCreatingPool(true);

      // Create pool key with CoW Hook
      const poolKey = createPoolKey(
        poolToken0 as `0x${string}`,
        poolToken1 as `0x${string}`,
        poolFee,
        true // Enable CoW Hook
      );

      // Calculate sqrt price
      const sqrtPriceX96 = calculateSqrtPriceX96(initialPrice);

      console.log('🏊 Creating CoW pool with parameters:', {
        poolKey,
        sqrtPriceX96,
        name: poolName
      });

      // Initialize pool on-chain
      await writeContract({
        address: CONTRACT_ADDRESSES.POOL_MANAGER,
        abi: POOL_MANAGER_ABI,
        functionName: 'initialize',
        args: [poolKey, BigInt(sqrtPriceX96)]
      });

      // Add to created pools list (in production, this would come from events)
      const newPool = {
        name: poolName,
        token0: token0Info,
        token1: token1Info,
        fee: poolFee,
        initialPrice,
        poolKey,
        createdAt: Date.now()
      };

      setCreatedPools(prev => [...prev, newPool]);

      // Reset form
      setPoolName('');
      setPoolToken0(MOCK_TOKENS.TEST0);
      setPoolToken1(MOCK_TOKENS.TEST1);
      setPoolFee(FEE_TIERS.MEDIUM);
      setInitialPrice(COMMON_PRICE_RATIOS.EQUAL);

      alert('Pool created successfully! 🎉');
    } catch (error) {
      console.error('Failed to create pool:', error);
      alert(`Failed to create pool: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsCreatingPool(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Could add toast notification here
  };

  if (!isConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Wallet className="w-16 h-16 mx-auto text-muted-foreground" />
          <h2 className="text-2xl font-bold">Connect Wallet</h2>
          <p className="text-muted-foreground">Connect your wallet to use CoW Protocol</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Shuffle className="w-8 h-8" />
              CoW Protocol
            </h1>
            <p className="text-muted-foreground">
              Coincidence of Wants - Gasless Trading Protocol
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-sm">
              <div className="text-muted-foreground">Connected:</div>
              <div className="font-mono">{formatAddress(address!)}</div>
            </div>
          </div>
        </div>

        {/* Contract Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {Object.entries(CONTRACT_ADDRESSES).map(([name, addr]) => (
            <div key={name} className="bg-card p-4 rounded-lg border">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{name.replace('_', ' ')}</div>
                  <div className="font-mono text-sm text-muted-foreground">
                    {formatAddress(addr)}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => copyToClipboard(addr)}
                    className="p-2 hover:bg-secondary rounded transition-colors"
                    title="Copy address"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => window.open(`https://etherscan.io/address/${addr}`, '_blank')}
                    className="p-2 hover:bg-secondary rounded transition-colors"
                    title="View on Etherscan"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 mb-6">
          {[
            { id: 'create', label: 'Create Order', icon: Shuffle },
            { id: 'match', label: 'Match Orders', icon: CheckCircle },
            { id: 'pools', label: 'Create Pool', icon: Waves },
            { id: 'history', label: 'Order History', icon: Clock }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'create' | 'match' | 'history' | 'pools')}
              className={`px-6 py-3 rounded-lg transition-colors flex items-center space-x-2 ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Create Order Tab */}
        {activeTab === 'create' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-card p-6 rounded-lg border">
              <h3 className="text-xl font-semibold mb-4">Create New Order</h3>

              {/* Order Type */}
              <div className="flex space-x-2 mb-4">
                {['buy', 'sell'].map((type) => (
                  <button
                    key={type}
                    onClick={() => setOrderType(type as 'buy' | 'sell')}
                    className={`flex-1 py-3 px-4 rounded-lg transition-colors ${
                      orderType === type
                        ? type === 'buy'
                          ? 'bg-success text-background'
                          : 'bg-destructive text-background'
                        : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                    }`}
                  >
                    {type.toUpperCase()} Order
                  </button>
                ))}
              </div>

              {/* Token Selection */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium mb-2">From Token</label>
                  <select
                    value={selectedTokenIn}
                    onChange={(e) => setSelectedTokenIn(e.target.value)}
                    className="w-full p-3 border rounded-lg bg-background"
                  >
                    {Object.entries(TOKEN_METADATA).map(([address, token]) => (
                      <option key={address} value={address}>
                        {token.symbol} ({token.name})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">To Token</label>
                  <select
                    value={selectedTokenOut}
                    onChange={(e) => setSelectedTokenOut(e.target.value)}
                    className="w-full p-3 border rounded-lg bg-background"
                  >
                    {Object.entries(TOKEN_METADATA).map(([address, token]) => (
                      <option key={address} value={address}>
                        {token.symbol} ({token.name})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Amount Input */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Amount In</label>
                <input
                  type="number"
                  value={amountIn}
                  onChange={(e) => setAmountIn(e.target.value)}
                  placeholder="0.0"
                  className="w-full p-3 border rounded-lg bg-background"
                  step="0.01"
                  min="0"
                />
              </div>

              {/* Min Amount Out */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-2">Minimum Amount Out</label>
                <input
                  type="number"
                  value={amountOutMin}
                  onChange={(e) => setAmountOutMin(e.target.value)}
                  placeholder="0.0"
                  className="w-full p-3 border rounded-lg bg-background"
                  step="0.01"
                  min="0"
                />
              </div>

              {/* Deadline */}
              <div className="mb-6">
                <label className="block text-sm font-medium mb-2">
                  Order Deadline: {orderDeadline} hours
                </label>
                <input
                  type="range"
                  min="1"
                  max="168" // 1 week
                  value={orderDeadline}
                  onChange={(e) => setOrderDeadline(Number(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-muted-foreground mt-1">
                  <span>1h</span>
                  <span>1 week</span>
                </div>
              </div>

              {/* Create Order Button */}
              <button
                onClick={handleCreateOrder}
                disabled={!amountIn || !amountOutMin || isCreatingOrder}
                className="w-full py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreatingOrder ? 'Creating Order...' : `Create ${orderType.toUpperCase()} Order`}
              </button>
            </div>

            {/* Order Preview */}
            <div className="bg-card p-6 rounded-lg border">
              <h3 className="text-xl font-semibold mb-4">Order Preview</h3>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Order Type:</span>
                  <span className="capitalize">{orderType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">From:</span>
                  <span>
                    {amountIn || '0'} {TOKEN_METADATA[selectedTokenIn]?.symbol || 'TOKEN'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">To (Min):</span>
                  <span>
                    {amountOutMin || '0'} {TOKEN_METADATA[selectedTokenOut]?.symbol || 'TOKEN'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Deadline:</span>
                  <span>{orderDeadline}h from now</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nonce:</span>
                  <span>{Number(userNonce || 0)}</span>
                </div>
              </div>

              {amountIn && amountOutMin && (
                <div className="mt-6 p-4 bg-secondary rounded-lg">
                  <div className="text-sm font-medium mb-2">Exchange Rate</div>
                  <div className="text-sm text-muted-foreground">
                    1 {TOKEN_METADATA[selectedTokenIn]?.symbol || 'TOKEN'} = {' '}
                    {(Number(amountOutMin) / Number(amountIn) || 0).toFixed(6)} {' '}
                    {TOKEN_METADATA[selectedTokenOut]?.symbol || 'TOKEN'}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Match Orders Tab */}
        {activeTab === 'match' && (
          <div className="space-y-6">
            <div className="bg-card p-6 rounded-lg border">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-xl font-semibold">Pending Orders ({pendingOrders.length})</h3>
                <button
                  onClick={() => {/* Refresh orders */}}
                  className="p-2 hover:bg-secondary rounded transition-colors"
                  title="Refresh orders"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>

              {pendingOrders.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No pending orders
                </div>
              ) : (
                <div className="space-y-3">
                  {pendingOrders.map((order, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-sm font-medium">
                              Order #{index + 1}
                            </span>
                            <span className="text-xs bg-secondary px-2 py-1 rounded">
                              {formatAddress(order.trader)}
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {formatAmount(order.amountIn)} → {formatAmount(order.amountOutMin)} (min)
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Expires: {new Date(order.deadline * 1000).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => setSelectedBuyOrder(order)}
                            className={`px-3 py-1 rounded text-xs transition-colors ${
                              selectedBuyOrder === order
                                ? 'bg-success text-background'
                                : 'bg-secondary hover:bg-secondary/80'
                            }`}
                          >
                            Buy
                          </button>
                          <button
                            onClick={() => setSelectedSellOrder(order)}
                            className={`px-3 py-1 rounded text-xs transition-colors ${
                              selectedSellOrder === order
                                ? 'bg-destructive text-background'
                                : 'bg-secondary hover:bg-secondary/80'
                            }`}
                          >
                            Sell
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Match Interface */}
            {selectedBuyOrder && selectedSellOrder && (
              <div className="bg-card p-6 rounded-lg border">
                <h3 className="text-xl font-semibold mb-4">Match Selected Orders</h3>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="p-4 bg-success/10 border border-success/20 rounded-lg">
                    <div className="text-sm font-medium text-success mb-2">Buy Order</div>
                    <div className="text-sm">
                      {formatAmount(selectedBuyOrder.amountIn)} → {formatAmount(selectedBuyOrder.amountOutMin)}
                    </div>
                  </div>
                  <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
                    <div className="text-sm font-medium text-destructive mb-2">Sell Order</div>
                    <div className="text-sm">
                      {formatAmount(selectedSellOrder.amountIn)} → {formatAmount(selectedSellOrder.amountOutMin)}
                    </div>
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Match Amount</label>
                  <input
                    type="number"
                    value={matchAmount}
                    onChange={(e) => setMatchAmount(e.target.value)}
                    placeholder="0.0"
                    className="w-full p-3 border rounded-lg bg-background"
                    step="0.01"
                    min="0"
                  />
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={handleMatchOrders}
                    disabled={!matchAmount || isMatching}
                    className="flex-1 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isMatching ? 'Matching...' : 'Match Orders'}
                  </button>
                  <button
                    onClick={() => {
                      setSelectedBuyOrder(null);
                      setSelectedSellOrder(null);
                      setMatchAmount('');
                    }}
                    className="px-6 py-3 border rounded-lg hover:bg-secondary transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Create Pool Tab */}
        {activeTab === 'pools' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Pool Creation Form */}
            <div className="bg-card p-6 rounded-lg border">
              <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <Plus className="w-5 h-5" />
                Create CoW-Enabled Pool
              </h3>

              <div className="space-y-4">
                {/* Pool Name */}
                <div>
                  <label className="block text-sm font-medium mb-2">Pool Name</label>
                  <input
                    type="text"
                    value={poolName}
                    onChange={(e) => setPoolName(e.target.value)}
                    placeholder="e.g. TEST0/TEST1 CoW Pool"
                    className="w-full p-3 border rounded-lg bg-background focus:border-primary focus:ring-1 focus:ring-primary"
                    disabled={isCreatingPool}
                  />
                </div>

                {/* Token Selection */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Token 0</label>
                    <select
                      value={poolToken0}
                      onChange={(e) => setPoolToken0(e.target.value)}
                      className="w-full p-3 border rounded-lg bg-background focus:border-primary focus:ring-1 focus:ring-primary"
                      disabled={isCreatingPool}
                    >
                      {Object.entries(TOKEN_METADATA).map(([address, token]) => (
                        <option key={address} value={address}>
                          {token.symbol} ({token.name})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Token 1</label>
                    <select
                      value={poolToken1}
                      onChange={(e) => setPoolToken1(e.target.value)}
                      className="w-full p-3 border rounded-lg bg-background focus:border-primary focus:ring-1 focus:ring-primary"
                      disabled={isCreatingPool}
                    >
                      {Object.entries(TOKEN_METADATA).map(([address, token]) => (
                        <option key={address} value={address}>
                          {token.symbol} ({token.name})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Fee Tier */}
                <div>
                  <label className="block text-sm font-medium mb-2">Fee Tier</label>
                  <select
                    value={poolFee}
                    onChange={(e) => setPoolFee(Number(e.target.value))}
                    className="w-full p-3 border rounded-lg bg-background focus:border-primary focus:ring-1 focus:ring-primary"
                    disabled={isCreatingPool}
                  >
                    <option value={FEE_TIERS.LOWEST}>0.01% (100)</option>
                    <option value={FEE_TIERS.LOW}>0.05% (500)</option>
                    <option value={FEE_TIERS.MEDIUM}>0.3% (3000)</option>
                    <option value={FEE_TIERS.HIGH}>1% (10000)</option>
                  </select>
                </div>

                {/* Initial Price */}
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Initial Price ({TOKEN_METADATA[poolToken0]?.symbol || 'Token0'} per {TOKEN_METADATA[poolToken1]?.symbol || 'Token1'})
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      value={initialPrice}
                      onChange={(e) => setInitialPrice(Number(e.target.value))}
                      placeholder="1.0"
                      step="0.000001"
                      min="0"
                      className="p-3 border rounded-lg bg-background focus:border-primary focus:ring-1 focus:ring-primary"
                      disabled={isCreatingPool}
                    />
                    <div className="grid grid-cols-3 gap-1">
                      {Object.entries(COMMON_PRICE_RATIOS).slice(0, 3).map(([name, ratio]) => (
                        <button
                          key={name}
                          type="button"
                          onClick={() => setInitialPrice(ratio)}
                          className="px-2 py-1 text-xs border rounded hover:bg-secondary transition-colors"
                          disabled={isCreatingPool}
                        >
                          {ratio === 1 ? '1:1' : ratio > 1 ? `${ratio}:1` : `1:${1/ratio}`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* CoW Features Info */}
                <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Shuffle className="w-4 h-4 text-primary" />
                    <span className="font-medium text-primary">CoW Protocol Integration</span>
                  </div>
                  <ul className="text-xs text-primary space-y-1">
                    <li>✅ Gasless order submission</li>
                    <li>✅ MEV protection via batch auctions</li>
                    <li>✅ Coincidence of Wants matching</li>
                    <li>✅ Better prices through order optimization</li>
                  </ul>
                </div>

                {/* Create Pool Button */}
                <button
                  onClick={handleCreatePool}
                  disabled={!poolName || isCreatingPool}
                  className="w-full py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isCreatingPool ? (
                    <>
                      <div className="w-4 h-4 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
                      Creating Pool...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Create CoW Pool
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Pool Preview & Created Pools */}
            <div className="space-y-6">
              {/* Pool Preview */}
              <div className="bg-card p-6 rounded-lg border">
                <h3 className="text-xl font-semibold mb-4">Pool Preview</h3>

                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name:</span>
                    <span>{poolName || "Unnamed Pool"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Token Pair:</span>
                    <span>{TOKEN_METADATA[poolToken0]?.symbol || "?"} / {TOKEN_METADATA[poolToken1]?.symbol || "?"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fee:</span>
                    <span>{(poolFee / 10000).toFixed(2)}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Initial Price:</span>
                    <span>{initialPrice} {TOKEN_METADATA[poolToken1]?.symbol || "Token1"} per {TOKEN_METADATA[poolToken0]?.symbol || "Token0"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">CoW Hook:</span>
                    <span className="text-success">✅ Enabled</span>
                  </div>
                </div>
              </div>

              {/* Created Pools */}
              <div className="bg-card p-6 rounded-lg border">
                <h3 className="text-xl font-semibold mb-4">Created Pools ({createdPools.length})</h3>

                {createdPools.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Waves className="w-12 h-12 mx-auto mb-4" />
                    <div>No pools created yet</div>
                    <div className="text-sm">Create your first CoW-enabled pool above</div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {createdPools.map((pool, index) => (
                      <div key={index} className="border rounded-lg p-4 bg-secondary/20">
                        <div className="flex justify-between items-start mb-2">
                          <div className="font-medium">{pool.name}</div>
                          <div className="text-xs bg-success text-background px-2 py-1 rounded">
                            Active
                          </div>
                        </div>
                        <div className="text-sm text-muted-foreground mb-2">
                          {pool.token0.symbol} / {pool.token1.symbol} • Fee: {(pool.fee / 10000).toFixed(2)}%
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Created: {new Date(pool.createdAt).toLocaleString()}
                        </div>
                        <div className="text-xs text-muted-foreground font-mono">
                          Hook: {CONTRACT_ADDRESSES.COW_HOOK}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Order History Tab */}
        {activeTab === 'history' && (
          <div className="bg-card p-6 rounded-lg border">
            <h3 className="text-xl font-semibold mb-4">Order History</h3>

            <div className="text-center py-8 text-muted-foreground">
              <Clock className="w-12 h-12 mx-auto mb-4" />
              <div>No order history available</div>
              <div className="text-sm">Order history will appear here once you start trading</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CoWProtocol;