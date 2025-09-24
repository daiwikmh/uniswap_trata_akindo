// CoW-Enhanced Pool Creation Component
import { apiPost, apiGet } from "@/lib/api";
import React, { useState, useEffect } from "react";
import useSWR from "swr";
import PoolDataDisplay, { type PoolData } from "@/components/pool/poolsTable";
import { FeeAmount } from "@/lib/utils";
import { useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import {
  DEPLOYED_TOKENS,
  COW_PROTOCOL_ADDRESSES,
  TOKEN_METADATA,
  FEE_TIERS,
  createPoolKey,
  validateTokenPair,
  calculateSqrtPriceX96,
  COMMON_PRICE_RATIOS,
  type TokenInfo,
  type CoWPoolParams
} from "@/constants/tokens";
import { Shuffle, AlertTriangle, CheckCircle, ExternalLink } from 'lucide-react';

// Uniswap V4 Pool Manager ABI (minimal)
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

// Extended pool interface with CoW integration
interface CoWPool extends CoWPoolParams {
  poolId?: string;
  isDeployed?: boolean;
  txHash?: string;
}

async function createPoolOnServer(pool: CoWPool) {
  return apiPost("/pools", pool);
}

const CreatePool: React.FC = () => {
  // Wagmi hooks
  const { address, isConnected } = useAccount();
  const { writeContract, data: txHash, error: contractError, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: isConfirmed } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  // Form state
  const [poolName, setPoolName] = useState("");
  const [selectedToken0, setSelectedToken0] = useState<string>(DEPLOYED_TOKENS.TEST0);
  const [selectedToken1, setSelectedToken1] = useState<string>(DEPLOYED_TOKENS.TEST1);
  const [fee, setFee] = useState<number>(FEE_TIERS.MEDIUM);
  const [initialPrice, setInitialPrice] = useState<number>(COMMON_PRICE_RATIOS.EQUAL);
  const [useCoWHook, setUseCoWHook] = useState<boolean>(true);

  // UI state
  const [isCreatingPool, setIsCreatingPool] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [createdPoolId, setCreatedPoolId] = useState<string>('');

  // Get token info
  const token0Info = TOKEN_METADATA[selectedToken0];
  const token1Info = TOKEN_METADATA[selectedToken1];

  const { data, error, isLoading, mutate } = useSWR<PoolData[]>(
    "/pools",
    apiGet
  );

  // Validation effect
  useEffect(() => {
    const errors: string[] = [];

    if (!poolName.trim()) {
      errors.push("Pool name is required");
    }

    if (!token0Info || !token1Info) {
      errors.push("Both tokens must be selected");
    }

    if (token0Info && token1Info) {
      const tokenErrors = validateTokenPair(token0Info, token1Info);
      errors.push(...tokenErrors);
    }

    if (initialPrice <= 0) {
      errors.push("Initial price must be positive");
    }

    if (!isConnected) {
      errors.push("Wallet must be connected");
    }

    setValidationErrors(errors);
  }, [poolName, token0Info, token1Info, initialPrice, isConnected]);

  // Handle successful pool creation
  useEffect(() => {
    if (isConfirmed && txHash) {
      console.log('✅ Pool created successfully:', txHash);

      // Save to server
      const poolData: CoWPool = {
        name: poolName.trim(),
        token0: token0Info,
        token1: token1Info,
        fee,
        tickSpacing: createPoolKey(selectedToken0 as `0x${string}`, selectedToken1 as `0x${string}`, fee, useCoWHook).tickSpacing,
        sqrtPriceX96: calculateSqrtPriceX96(initialPrice),
        useCoWHook,
        isDeployed: true,
        txHash: txHash,
        poolId: createdPoolId
      };

      createPoolOnServer(poolData).then(() => {
        console.log('✅ Pool data saved to server');
        mutate();
        resetForm();
      }).catch(err => {
        console.error('❌ Failed to save pool data:', err);
      });
    }
  }, [isConfirmed, txHash, poolName, token0Info, token1Info, fee, initialPrice, useCoWHook, createdPoolId, mutate]);

  const resetForm = () => {
    setPoolName("");
    setSelectedToken0(DEPLOYED_TOKENS.TEST0);
    setSelectedToken1(DEPLOYED_TOKENS.TEST1);
    setFee(FEE_TIERS.MEDIUM);
    setInitialPrice(COMMON_PRICE_RATIOS.EQUAL);
    setUseCoWHook(true);
    setCreatedPoolId('');
  };

  const createPool = async () => {
    if (!isConnected || !address) {
      alert("Please connect your wallet first");
      return;
    }

    if (validationErrors.length > 0) {
      alert("Please fix validation errors first");
      return;
    }

    try {
      setIsCreatingPool(true);

      // Create pool key
      const poolKey = createPoolKey(
        selectedToken0 as `0x${string}`,
        selectedToken1 as `0x${string}`,
        fee,
        useCoWHook
      );

      // Calculate sqrt price
      const sqrtPriceX96 = calculateSqrtPriceX96(initialPrice);

      console.log('🏊 Creating pool with parameters:', {
        poolKey,
        sqrtPriceX96,
        useCoWHook
      });

      // Initialize pool on-chain
      await writeContract({
        address: COW_PROTOCOL_ADDRESSES.POOL_MANAGER,
        abi: POOL_MANAGER_ABI,
        functionName: 'initialize',
        args: [poolKey, BigInt(sqrtPriceX96)]
      });

    } catch (error) {
      console.error('❌ Failed to create pool:', error);
      alert(`Failed to create pool: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsCreatingPool(false);
    }
  };

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await createPool();
  }

  // Get transaction status
  const getTransactionStatus = () => {
    if (isPending || isCreatingPool) return 'pending';
    if (isConfirming) return 'confirming';
    if (isConfirmed) return 'confirmed';
    if (contractError) return 'error';
    return 'idle';
  };

  const transactionStatus = getTransactionStatus();

  if (!isConnected) {
    return (
      <div className="w-full h-full p-6 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Shuffle className="w-16 h-16 mx-auto text-muted-foreground" />
          <h2 className="text-2xl font-bold">Connect Wallet</h2>
          <p className="text-muted-foreground">Connect your wallet to create CoW-enabled pools</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full p-6 flex flex-col gap-6 font-roboto-mono">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shuffle className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-rebels tracking-widest">CREATE CoW POOL</h1>
            <p className="text-sm text-muted-foreground">
              Create Uniswap V4 pools with CoW Protocol integration
            </p>
          </div>
        </div>
        {txHash && (
          <a
            href={`https://etherscan.io/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            View Transaction <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>

      {/* Contract Info */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-secondary p-4 rounded-lg border">
          <div className="text-sm font-medium mb-1">Pool Manager</div>
          <div className="font-mono text-xs text-muted-foreground">
            {COW_PROTOCOL_ADDRESSES.POOL_MANAGER}
          </div>
        </div>
        <div className="bg-secondary p-4 rounded-lg border">
          <div className="text-sm font-medium mb-1">CoW Hook</div>
          <div className="font-mono text-xs text-muted-foreground">
            {COW_PROTOCOL_ADDRESSES.COW_HOOK}
          </div>
        </div>
        <div className="bg-secondary p-4 rounded-lg border">
          <div className="text-sm font-medium mb-1">CoW Solver</div>
          <div className="font-mono text-xs text-muted-foreground">
            {COW_PROTOCOL_ADDRESSES.COW_SOLVER}
          </div>
        </div>
      </div>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span className="font-medium text-destructive">Validation Errors</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-sm">
            {validationErrors.map((error, index) => (
              <li key={index} className="text-destructive">{error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Form + Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <form
          onSubmit={handleCreate}
          className="col-span-1 lg:col-span-2 bg-card rounded-xl border border-border p-6 shadow-lg space-y-6"
        >
          <h2 className="text-lg font-bold">Pool Configuration</h2>

          {/* Pool Name */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">Pool Name</label>
            <input
              value={poolName}
              onChange={(e) => setPoolName(e.target.value)}
              placeholder="e.g. TEST0/TEST1 CoW Pool"
              className="w-full p-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary"
              disabled={transactionStatus === 'pending' || transactionStatus === 'confirming'}
            />
          </div>

          {/* Token Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium">Token 0</label>
              <select
                value={selectedToken0}
                onChange={(e) => setSelectedToken0(e.target.value)}
                className="w-full p-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary"
                disabled={transactionStatus === 'pending' || transactionStatus === 'confirming'}
              >
                {Object.entries(TOKEN_METADATA).map(([address, token]) => (
                  <option key={address} value={address}>
                    {token.symbol} ({token.name})
                  </option>
                ))}
              </select>
              {token0Info && (
                <div className="text-xs text-muted-foreground font-mono">
                  {token0Info.address}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium">Token 1</label>
              <select
                value={selectedToken1}
                onChange={(e) => setSelectedToken1(e.target.value)}
                className="w-full p-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary"
                disabled={transactionStatus === 'pending' || transactionStatus === 'confirming'}
              >
                {Object.entries(TOKEN_METADATA).map(([address, token]) => (
                  <option key={address} value={address}>
                    {token.symbol} ({token.name})
                  </option>
                ))}
              </select>
              {token1Info && (
                <div className="text-xs text-muted-foreground font-mono">
                  {token1Info.address}
                </div>
              )}
            </div>
          </div>

          {/* Fee Tier */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">Fee Tier</label>
            <select
              value={fee}
              onChange={(e) => setFee(Number(e.target.value))}
              className="w-full p-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary"
              disabled={transactionStatus === 'pending' || transactionStatus === 'confirming'}
            >
              <option value={FEE_TIERS.LOWEST}>0.01% (100)</option>
              <option value={FEE_TIERS.LOW}>0.05% (500)</option>
              <option value={FEE_TIERS.MEDIUM}>0.3% (3000)</option>
              <option value={FEE_TIERS.HIGH}>1% (10000)</option>
            </select>
          </div>

          {/* Initial Price */}
          <div className="space-y-2">
            <label className="block text-sm font-medium">
              Initial Price ({token0Info?.symbol || 'Token0'} per {token1Info?.symbol || 'Token1'})
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="number"
                value={initialPrice}
                onChange={(e) => setInitialPrice(Number(e.target.value))}
                placeholder="1.0"
                step="0.000001"
                min="0"
                className="p-3 rounded-md bg-background border border-border focus:border-primary focus:ring-1 focus:ring-primary"
                disabled={transactionStatus === 'pending' || transactionStatus === 'confirming'}
              />
              <div className="grid grid-cols-3 gap-1">
                {Object.entries(COMMON_PRICE_RATIOS).slice(0, 3).map(([name, ratio]) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setInitialPrice(ratio)}
                    className="px-2 py-1 text-xs border rounded hover:bg-secondary transition-colors"
                    disabled={transactionStatus === 'pending' || transactionStatus === 'confirming'}
                  >
                    {ratio === 1 ? '1:1' : ratio > 1 ? `${ratio}:1` : `1:${1/ratio}`}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* CoW Hook Toggle */}
          <div className="flex items-center justify-between p-4 bg-secondary rounded-lg">
            <div>
              <div className="font-medium">Enable CoW Protocol</div>
              <div className="text-sm text-muted-foreground">
                Integrate CoW Protocol for gasless, MEV-protected trading
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={useCoWHook}
                onChange={(e) => setUseCoWHook(e.target.checked)}
                className="sr-only peer"
                disabled={transactionStatus === 'pending' || transactionStatus === 'confirming'}
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          {/* Transaction Status */}
          {transactionStatus !== 'idle' && (
            <div className="p-4 rounded-lg border">
              <div className="flex items-center gap-2 mb-2">
                {transactionStatus === 'pending' && (
                  <>
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span>Submitting transaction...</span>
                  </>
                )}
                {transactionStatus === 'confirming' && (
                  <>
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    <span>Confirming transaction...</span>
                  </>
                )}
                {transactionStatus === 'confirmed' && (
                  <>
                    <CheckCircle className="w-4 h-4 text-success" />
                    <span className="text-success">Pool created successfully!</span>
                  </>
                )}
                {transactionStatus === 'error' && (
                  <>
                    <AlertTriangle className="w-4 h-4 text-destructive" />
                    <span className="text-destructive">Transaction failed</span>
                  </>
                )}
              </div>
              {contractError && (
                <div className="text-sm text-destructive">
                  {contractError.message}
                </div>
              )}
            </div>
          )}

          {/* Buttons */}
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={
                validationErrors.length > 0 ||
                transactionStatus === 'pending' ||
                transactionStatus === 'confirming'
              }
              className="flex-1 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {transactionStatus === 'pending' || transactionStatus === 'confirming'
                ? 'Creating Pool...'
                : 'Create Pool'
              }
            </button>
            <button
              type="button"
              onClick={resetForm}
              disabled={transactionStatus === 'pending' || transactionStatus === 'confirming'}
              className="px-6 py-3 bg-secondary rounded-lg border border-border hover:bg-secondary/80 transition-colors disabled:opacity-50"
            >
              Reset
            </button>
          </div>
        </form>

        {/* Preview */}
        <div className="bg-card rounded-xl border border-border p-6 shadow-lg">
          <h2 className="text-lg font-bold mb-4">Pool Preview</h2>

          <div className="space-y-4">
            <div>
              <div className="text-sm text-muted-foreground">Name</div>
              <div className="font-semibold">{poolName || "Unnamed Pool"}</div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground">Token Pair</div>
              <div className="font-mono">
                {token0Info?.symbol || "?"} / {token1Info?.symbol || "?"}
              </div>
              <div className="text-xs text-muted-foreground">
                {token0Info?.name || "?"} / {token1Info?.name || "?"}
              </div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground">Fee</div>
              <div className="font-mono">{fee / 100}% ({fee} bps)</div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground">Initial Price</div>
              <div className="font-mono">
                {initialPrice} {token1Info?.symbol || "Token1"} per {token0Info?.symbol || "Token0"}
              </div>
            </div>

            <div>
              <div className="text-sm text-muted-foreground">CoW Integration</div>
              <div className={`inline-flex items-center gap-2 px-2 py-1 rounded text-xs ${
                useCoWHook
                  ? 'bg-success/10 text-success border border-success/20'
                  : 'bg-secondary text-secondary-foreground border'
              }`}>
                {useCoWHook ? <CheckCircle className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                {useCoWHook ? 'Enabled' : 'Disabled'}
              </div>
            </div>

            {useCoWHook && (
              <div className="mt-4 p-3 bg-primary/10 border border-primary/20 rounded-lg">
                <div className="text-xs font-medium text-primary mb-1">CoW Features</div>
                <ul className="text-xs text-primary space-y-1">
                  <li>• Gasless order submission</li>
                  <li>• MEV protection</li>
                  <li>• Coincidence of Wants matching</li>
                  <li>• Batch auction settlement</li>
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Existing Pools */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h2 className="text-lg font-bold mb-4">Your Pools</h2>
        {isLoading && <div className="text-muted-foreground">Loading pools...</div>}
        {error && <div className="text-destructive">Failed to load pools: {error.message}</div>}
        {data && <PoolDataDisplay pools={data} />}
        {data && data.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            No pools created yet. Create your first pool above!
          </div>
        )}
      </div>
    </div>
  );
};

export default CreatePool;