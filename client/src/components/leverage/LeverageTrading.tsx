// Main Leverage Trading Component
import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { AlertCircle, TrendingUp, TrendingDown, Wallet, Settings, Waves } from 'lucide-react';
import {
  useShinraiContracts,
  useLeveragePositions,
  useTokenOperations,
  useProtocolState
} from './hooks/useShinraiContracts';
import {
  SHINRAI_CONTRACTS,
  PROTOCOL_CONFIG,
  createPoolKey
} from './contracts';
import { useWagmiConnection, useWagmiContracts } from './hooks/useWagmiContracts';
import UniswapV4PoolCreator from './UniswapV4PoolCreator';
import { useCreatedPools } from './hooks/useCreatedPools';

// Types
interface TokenInfo {
  address: string;
  symbol: string;
  balance: bigint;
  allowance: bigint;
}

const LeverageTrading: React.FC = () => {
  // Wagmi connection for modern integration
  const {
    address,
    isConnected: wagmiConnected,
    connectWallet: connectWagmiWallet,
    disconnect: disconnectWagmi
  } = useWagmiConnection();

  // Contract hooks (fallback for existing functionality)
  const {
    account,
    isConnected: contractConnected,
    marginRouter,
    globalLedger,
    connectWallet,
    disconnect
  } = useShinraiContracts();

  // Use Wagmi connection if available, otherwise fallback
  const finalAccount = address || account;
  const finalIsConnected = wagmiConnected || contractConnected;
  const finalConnect = wagmiConnected ? connectWagmiWallet : connectWallet;
  const finalDisconnect = wagmiConnected ? disconnectWagmi : disconnect;

  const {
    positions,
    loading: positionsLoading,
    openPosition,
    closePosition,
    checkPositionHealth
  } = useLeveragePositions(marginRouter, account);

  const {
    getTokenBalance,
    approveToken,
    checkAllowance,
    getTokenContract
  } = useTokenOperations(marginRouter?.runner as ethers.JsonRpcSigner);

  // Wagmi contracts for pool-based trading
  const {
    openLeveragePosition: openLeveragePositionWagmi,
    approveToken: approveTokenWagmi
  } = useWagmiContracts();

  // Helper function to get token symbol
  const getTokenSymbol = useCallback(async (tokenAddress: string): Promise<string> => {
    const contract = getTokenContract(tokenAddress);
    if (!contract) throw new Error('Token contract not available');
    try {
      return await contract.symbol();
    } catch (error) {
      throw error;
    }
  }, [getTokenContract]);

  const {
    maxLeverage,
    isPaused
  } = useProtocolState(globalLedger, marginRouter);

  // Pool management
  const { pools, selectedPool, hasSelectedPool } = useCreatedPools();

  // Debug: Log pools data when it changes
  useEffect(() => {
    if (pools.length > 0) {
      console.log('🏊 Available pools in LeverageTrading:', pools.map(p => ({
        name: p.name,
        poolId: p.poolId.slice(0, 10) + '...',
        currency0: p.poolKey.currency0,
        currency1: p.poolKey.currency1,
        fee: p.poolKey.fee,
        createdAt: new Date(p.createdAt).toLocaleString()
      })));
    }
  }, [pools]);

  // Component state
  const [activeTab, setActiveTab] = useState<'trade' | 'positions' | 'pools'>('trade');
  const [tradeType, setTradeType] = useState<'long' | 'short'>('long');
  const [selectedToken0, setSelectedToken0] = useState(SHINRAI_CONTRACTS.MOCK_TOKEN0);
  const [selectedToken1, setSelectedToken1] = useState(SHINRAI_CONTRACTS.MOCK_TOKEN1);
  const [collateralAmount, setCollateralAmount] = useState('');
  const [leverageRatio, setLeverageRatio] = useState(200); // 2x default
  const [isTrading, setIsTrading] = useState(false);
  const [tokens, setTokens] = useState<Record<string, TokenInfo>>({});
  const [selectedPoolForTrading, setSelectedPoolForTrading] = useState<string | null>(null);

  // Update token selection when pool changes
  useEffect(() => {
    const currentPool = selectedPoolForTrading
      ? pools.find(p => p.poolId === selectedPoolForTrading)
      : selectedPool;

    if (currentPool) {
      // Auto-select the pool tokens
      setSelectedToken0(currentPool.poolKey.currency0);
      setSelectedToken1(currentPool.poolKey.currency1);
    }
  }, [selectedPoolForTrading, selectedPool, pools]);

  // Load token information
  useEffect(() => {
    if (!finalIsConnected || !finalAccount) return;

    const loadTokenInfo = async () => {
      // Get token addresses from created pools + default tokens
      const poolTokens = new Set<string>();
      pools.forEach(pool => {
        poolTokens.add(pool.poolKey.currency0);
        poolTokens.add(pool.poolKey.currency1);
      });

      const tokenAddresses = [
        SHINRAI_CONTRACTS.MOCK_TOKEN0,
        SHINRAI_CONTRACTS.MOCK_TOKEN1,
        SHINRAI_CONTRACTS.MOCK_WETH,
        ...Array.from(poolTokens) // Add tokens from created pools
      ].filter((addr, index, arr) => arr.indexOf(addr) === index); // Remove duplicates

      const tokenInfo: Record<string, TokenInfo> = {};

      for (const address of tokenAddresses) {
        try {
          const balance = await getTokenBalance(address, finalAccount);
          const allowance = await checkAllowance(address, finalAccount, SHINRAI_CONTRACTS.MARGIN_ROUTER);

          // Try to get symbol from contract, fall back to hardcoded values
          let symbol = 'UNKNOWN';
          try {
            symbol = await getTokenSymbol(address);
          } catch {
            // Fallback to hardcoded symbols for known tokens
            if (address === SHINRAI_CONTRACTS.MOCK_TOKEN0) symbol = 'USDC';
            else if (address === SHINRAI_CONTRACTS.MOCK_TOKEN1) symbol = 'DAI';
            else if (address === SHINRAI_CONTRACTS.MOCK_WETH) symbol = 'WETH';
            // Handle dynamically deployed test tokens
            else if (address.toLowerCase().includes('test')) symbol = 'TEST';
            else symbol = `TOKEN_${address.slice(0, 6)}`;
          }

          tokenInfo[address] = {
            address,
            symbol,
            balance,
            allowance
          };
        } catch (error) {
          console.error(`Failed to load token info for ${address}:`, error);
        }
      }

      setTokens(tokenInfo);
    };

    loadTokenInfo();
  }, [finalIsConnected, finalAccount, getTokenBalance, checkAllowance, getTokenSymbol, pools]);

  // Calculate borrow amount based on leverage
  const calculateBorrowAmount = (collateral: string, leverage: number): bigint => {
    if (!collateral || leverage <= 100) return BigInt(0);

    const collateralBigInt = ethers.parseEther(collateral);
    const multiplier = BigInt(leverage - 100); // Subtract 1x for collateral
    return (collateralBigInt * multiplier) / BigInt(100);
  };

  // Handle opening a position
  const handleOpenPosition = async () => {
    if (!collateralAmount) return;

    // Check if we have a selected pool for trading
    const poolForTrading = selectedPoolForTrading
      ? pools.find(p => p.poolId === selectedPoolForTrading)
      : selectedPool; // fallback to the auto-selected pool

    if (!poolForTrading) {
      alert('Please select a pool for trading. Create a pool first in the "Create Pools" tab.');
      return;
    }

    try {
      setIsTrading(true);

      const collateralBigInt = ethers.parseEther(collateralAmount);
      const borrowAmount = calculateBorrowAmount(collateralAmount, leverageRatio);

      const collateralToken = tradeType === 'long' ? selectedToken0 : selectedToken1;
      const borrowToken = tradeType === 'long' ? selectedToken1 : selectedToken0;

      console.log('=== Opening Leverage Position ===');
      console.log('Selected Pool:', poolForTrading.name);
      console.log('Pool Key:', poolForTrading.poolKey);
      console.log('Collateral Token:', collateralToken);
      console.log('Borrow Token:', borrowToken);
      console.log('Collateral Amount:', collateralAmount);
      console.log('Leverage Ratio:', leverageRatio);
      console.log('Trade Type:', tradeType);

      // Ensure selected tokens are compatible with the pool
      const poolTokens = [poolForTrading.poolKey.currency0, poolForTrading.poolKey.currency1];
      if (!poolTokens.includes(collateralToken) || !poolTokens.includes(borrowToken)) {
        alert(`Selected tokens must be from the selected pool. Pool tokens: ${poolTokens.join(', ')}`);
        return;
      }

      // Check and approve tokens if needed (use Wagmi for consistency)
      const currentAllowance = tokens[collateralToken]?.allowance || BigInt(0);
      if (currentAllowance < collateralBigInt) {
        console.log('Approving token with Wagmi...');
        await approveTokenWagmi(
          collateralToken as `0x${string}`,
          SHINRAI_CONTRACTS.MARGIN_ROUTER as `0x${string}`,
          collateralAmount
        );
      }

      // Open position using the selected pool's poolKey
      console.log('Opening position with pool data...');
      const tx = await openLeveragePositionWagmi(
        poolForTrading.poolKey,
        collateralToken as `0x${string}`,
        collateralAmount,
        ethers.formatEther(borrowAmount),
        leverageRatio,
        tradeType === 'long'
      );

      console.log('Position opened successfully:', tx);

      // Reset form
      setCollateralAmount('');
      setLeverageRatio(200);

    } catch (error) {
      console.error('Failed to open position:', error);
      alert(`Failed to open position: ${error.message}`);
    } finally {
      setIsTrading(false);
    }
  };

  // Handle closing a position
  const handleClosePosition = async (positionId: string, collateralToken: string, borrowToken: string) => {
    try {
      console.log('Closing position...');
      const receipt = await closePosition(positionId, collateralToken, borrowToken);
      console.log('Position closed successfully:', receipt.hash);
    } catch (error) {
      console.error('Failed to close position:', error);
    }
  };

  // Format token amount for display
  const formatTokenAmount = (amount: bigint, decimals = 18): string => {
    return ethers.formatUnits(amount, decimals);
  };

  if (!finalIsConnected) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Wallet className="w-16 h-16 mx-auto text-muted-foreground" />
          <h2 className="text-2xl font-bold">Connect Wallet</h2>
          <p className="text-muted-foreground">Connect your wallet to start leverage trading</p>
          <button
            onClick={finalConnect}
            className="px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  if (isPaused) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <AlertCircle className="w-16 h-16 mx-auto text-destructive" />
          <h2 className="text-2xl font-bold">Protocol Paused</h2>
          <p className="text-muted-foreground">Leverage trading is temporarily paused</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4">
      {/* Header */}
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Shinrai Leverage Trading</h1>
            <p className="text-muted-foreground">
              Connected: {finalAccount.slice(0, 6)}...{finalAccount.slice(-4)} |
              Max Leverage: {maxLeverage / 100}x
            </p>
          </div>
          <button
            onClick={finalDisconnect}
            className="px-4 py-2 border rounded-lg hover:bg-secondary transition-colors"
          >
            Disconnect
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 mb-6">
          {[
            { id: 'trade', label: 'Trade', icon: TrendingUp },
            { id: 'positions', label: 'Positions', icon: Settings },
            { id: 'pools', label: 'Create Pools', icon: Waves }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'trade' | 'positions' | 'pools')}
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

        {/* Trade Tab */}
        {activeTab === 'trade' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Trading Form */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-card p-6 rounded-lg border">
                <h3 className="text-xl font-semibold mb-4">Open Leverage Position</h3>

                {/* Trade Type */}
                <div className="flex space-x-2 mb-4">
                  {['long', 'short'].map((type) => (
                    <button
                      key={type}
                      onClick={() => setTradeType(type as 'long' | 'short')}
                      className={`flex-1 py-3 px-4 rounded-lg transition-colors flex items-center justify-center space-x-2 ${
                        tradeType === type
                          ? type === 'long'
                            ? 'bg-success text-background'
                            : 'bg-destructive text-background'
                          : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                      }`}
                    >
                      {type === 'long' ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      <span className="capitalize">{type}</span>
                    </button>
                  ))}
                </div>

                {/* Pool Selection */}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Trading Pool</label>
                  {pools.length === 0 ? (
                    <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-destructive text-sm">
                      No pools available. Create a pool first in the "Create Pools" tab.
                    </div>
                  ) : (
                    <select
                      value={selectedPoolForTrading || selectedPool?.poolId || ''}
                      onChange={(e) => setSelectedPoolForTrading(e.target.value || null)}
                      className="w-full p-3 border rounded-lg bg-background"
                    >
                      {pools.map((pool) => (
                        <option key={pool.poolId} value={pool.poolId}>
                          {pool.name} (Fee: {pool.poolKey.fee / 10000}%)
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Token Selection */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">From Token</label>
                    <select
                      value={selectedToken0}
                      onChange={(e) => setSelectedToken0(e.target.value)}
                      className="w-full p-3 border rounded-lg bg-background"
                      disabled={pools.length === 0}
                    >
                      {(() => {
                        const currentPool = selectedPoolForTrading
                          ? pools.find(p => p.poolId === selectedPoolForTrading)
                          : selectedPool;

                        if (!currentPool) {
                          return Object.values(tokens).map((token) => (
                            <option key={token.address} value={token.address}>
                              {token.symbol} (Balance: {formatTokenAmount(token.balance).slice(0, 8)})
                            </option>
                          ));
                        }

                        const poolTokens = [currentPool.poolKey.currency0, currentPool.poolKey.currency1];
                        return Object.values(tokens)
                          .filter(token => poolTokens.includes(token.address))
                          .map((token) => (
                            <option key={token.address} value={token.address}>
                              {token.symbol} (Balance: {formatTokenAmount(token.balance).slice(0, 8)})
                            </option>
                          ));
                      })()}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">To Token</label>
                    <select
                      value={selectedToken1}
                      onChange={(e) => setSelectedToken1(e.target.value)}
                      className="w-full p-3 border rounded-lg bg-background"
                      disabled={pools.length === 0}
                    >
                      {(() => {
                        const currentPool = selectedPoolForTrading
                          ? pools.find(p => p.poolId === selectedPoolForTrading)
                          : selectedPool;

                        if (!currentPool) {
                          return Object.values(tokens).map((token) => (
                            <option key={token.address} value={token.address}>
                              {token.symbol} (Balance: {formatTokenAmount(token.balance).slice(0, 8)})
                            </option>
                          ));
                        }

                        const poolTokens = [currentPool.poolKey.currency0, currentPool.poolKey.currency1];
                        return Object.values(tokens)
                          .filter(token => poolTokens.includes(token.address))
                          .map((token) => (
                            <option key={token.address} value={token.address}>
                              {token.symbol} (Balance: {formatTokenAmount(token.balance).slice(0, 8)})
                            </option>
                          ));
                      })()}
                    </select>
                  </div>
                </div>

                {/* Collateral Amount */}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">Collateral Amount</label>
                  <input
                    type="number"
                    value={collateralAmount}
                    onChange={(e) => setCollateralAmount(e.target.value)}
                    placeholder="0.0"
                    className="w-full p-3 border rounded-lg bg-background"
                    step="0.01"
                    min="0"
                  />
                </div>

                {/* Leverage Slider */}
                <div className="mb-6">
                  <label className="block text-sm font-medium mb-2">
                    Leverage: {leverageRatio / 100}x
                  </label>
                  <input
                    type="range"
                    min="100"
                    max={maxLeverage}
                    step="50"
                    value={leverageRatio}
                    onChange={(e) => setLeverageRatio(Number(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-sm text-muted-foreground mt-1">
                    <span>1x</span>
                    <span>{maxLeverage / 100}x</span>
                  </div>
                </div>

                {/* Position Summary */}
                <div className="bg-secondary p-4 rounded-lg mb-4">
                  <h4 className="font-medium mb-2">Position Summary</h4>
                  <div className="space-y-1 text-sm">
                    {(() => {
                      const currentPool = selectedPoolForTrading
                        ? pools.find(p => p.poolId === selectedPoolForTrading)
                        : selectedPool;

                      return currentPool ? (
                        <div className="flex justify-between mb-2 pb-2 border-b border-border">
                          <span>Pool:</span>
                          <span className="font-mono text-xs">{currentPool.name}</span>
                        </div>
                      ) : null;
                    })()}
                    <div className="flex justify-between">
                      <span>Collateral:</span>
                      <span>{collateralAmount || '0'} {tokens[selectedToken0]?.symbol}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Borrow Amount:</span>
                      <span>
                        {formatTokenAmount(calculateBorrowAmount(collateralAmount, leverageRatio)).slice(0, 8)} {tokens[selectedToken1]?.symbol}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Leverage:</span>
                      <span>{leverageRatio / 100}x</span>
                    </div>
                  </div>
                </div>

                {/* Open Position Button */}
                <button
                  onClick={handleOpenPosition}
                  disabled={
                    !collateralAmount ||
                    isTrading ||
                    Number(collateralAmount) <= 0 ||
                    pools.length === 0 ||
                    (!selectedPoolForTrading && !selectedPool)
                  }
                  className="w-full py-3 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isTrading
                    ? 'Opening Position...'
                    : pools.length === 0
                    ? 'Create a Pool First'
                    : `Open ${tradeType.toUpperCase()} Position`
                  }
                </button>
              </div>
            </div>

            {/* Protocol Stats */}
            <div className="space-y-6">
              <div className="bg-card p-6 rounded-lg border">
                <h3 className="text-xl font-semibold mb-4">Protocol Stats</h3>
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Max Leverage:</span>
                    <span>{maxLeverage / 100}x</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Active Positions:</span>
                    <span>{positions.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Protocol Status:</span>
                    <span className="text-success">Active</span>
                  </div>
                </div>
              </div>

              <div className="bg-card p-6 rounded-lg border">
                <h3 className="text-xl font-semibold mb-4">Your Balances</h3>
                <div className="space-y-3">
                  {Object.values(tokens).map((token) => (
                    <div key={token.address} className="flex justify-between">
                      <span className="text-muted-foreground">{token.symbol}:</span>
                      <span>{formatTokenAmount(token.balance).slice(0, 8)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Show pool information if available */}
              {pools.length > 0 && (
                <div className="bg-card p-6 rounded-lg border">
                  <h3 className="text-xl font-semibold mb-4">Available Pools ({pools.length})</h3>
                  <div className="space-y-3">
                    {pools.slice(0, 3).map((pool) => (
                      <div key={pool.poolId} className="p-3 bg-secondary rounded-lg">
                        <div className="font-medium text-sm mb-1">{pool.name || 'Unnamed Pool'}</div>
                        <div className="text-xs text-muted-foreground mb-2">
                          <div>Token 0: {pool.poolKey.currency0.slice(0, 6)}...{pool.poolKey.currency0.slice(-4)}</div>
                          <div>Token 1: {pool.poolKey.currency1.slice(0, 6)}...{pool.poolKey.currency1.slice(-4)}</div>
                          <div>Fee: {pool.poolKey.fee / 10000}% | Created: {new Date(pool.createdAt).toLocaleDateString()}</div>
                        </div>
                        <div className="text-xs font-mono text-muted-foreground">
                          Pool ID: {pool.poolId.slice(0, 10)}...
                        </div>
                      </div>
                    ))}
                    {pools.length > 3 && (
                      <div className="text-xs text-muted-foreground text-center">
                        +{pools.length - 3} more pools
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Positions Tab */}
        {activeTab === 'positions' && (
          <div className="bg-card rounded-lg border">
            <div className="p-6 border-b">
              <h3 className="text-xl font-semibold">Your Positions</h3>
            </div>
            <div className="p-6">
              {positionsLoading ? (
                <div className="text-center py-8">Loading positions...</div>
              ) : positions.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No active positions
                </div>
              ) : (
                <div className="space-y-4">
                  {positions.map((position) => (
                    <div key={position.positionId} className="border rounded-lg p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-1 rounded text-xs ${
                              position.isLongPosition ? 'bg-success text-background' : 'bg-destructive text-background'
                            }`}>
                              {position.isLongPosition ? 'LONG' : 'SHORT'}
                            </span>
                            <span className="font-medium">
                              {position.leverageRatio / 100}x Leverage
                            </span>
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            Opened: {new Date(position.openTimestamp * 1000).toLocaleDateString()}
                          </div>
                        </div>
                        <button
                          onClick={() => handleClosePosition(
                            position.positionId,
                            position.collateralToken,
                            position.borrowedToken
                          )}
                          className="px-3 py-1 bg-destructive text-destructive-foreground rounded hover:bg-destructive/90 transition-colors"
                        >
                          Close Position
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Collateral:</span>
                          <div>{formatTokenAmount(position.collateralAmount).slice(0, 8)}</div>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Borrowed:</span>
                          <div>{formatTokenAmount(position.borrowedAmount).slice(0, 8)}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}


        {/* Pools Tab */}
        {activeTab === 'pools' && (
          <UniswapV4PoolCreator />
        )}

      </div>
    </div>
  );
};

export default LeverageTrading;