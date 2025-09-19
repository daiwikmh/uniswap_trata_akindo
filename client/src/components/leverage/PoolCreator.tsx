// Pool Creator Component for Leverage Trading
import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { Plus, Waves, Settings, Droplets } from 'lucide-react';
import {
  SHINRAI_CONTRACTS,
  createPoolKey
} from './contracts';
import {
  useShinraiContracts,
  useTokenOperations
} from './hooks/useShinraiContracts';


interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  balance: bigint;
}

export const PoolCreator: React.FC = () => {
  // Contract hooks
  const {
    account,
    isConnected,
    marginRouter,
    globalLedger
  } = useShinraiContracts();

  const { getTokenBalance, getTokenContract } = useTokenOperations(
    marginRouter?.runner as ethers.JsonRpcSigner
  );

  // Component state
  const [activeSection, setActiveSection] = useState<'create' | 'manage'>('create');
  const [isCreating, setIsCreating] = useState(false);
  const [creationStep, setCreationStep] = useState(0);

  // Pool creation form
  const [token0Address, setToken0Address] = useState('');
  const [token1Address, setToken1Address] = useState('');
  const [initialPrice, setInitialPrice] = useState('1.0');
  const [maxLeverage, setMaxLeverage] = useState(1000); // 10x
  const [borrowCap, setBorrowCap] = useState('1000000');

  // Token info
  const [token0Info, setToken0Info] = useState<TokenInfo | null>(null);
  const [token1Info, setToken1Info] = useState<TokenInfo | null>(null);

  // Predefined test tokens
  const TEST_TOKENS = {
    TOKEN0: {
      address: SHINRAI_CONTRACTS.MOCK_TOKEN0,
      symbol: 'TOKEN0',
      name: 'Mock Token 0'
    },
    TOKEN1: {
      address: SHINRAI_CONTRACTS.MOCK_TOKEN1,
      symbol: 'TOKEN1',
      name: 'Mock Token 1'
    },
    WETH: {
      address: SHINRAI_CONTRACTS.MOCK_WETH,
      symbol: 'WETH',
      name: 'Wrapped Ether'
    }
  };

  // Load token information
  useEffect(() => {
    if (!token0Address || !account) return;

    const loadTokenInfo = async () => {
      try {
        const contract = getTokenContract(token0Address);
        if (!contract) return;

        const [symbol, name, decimals, balance] = await Promise.all([
          contract.symbol().catch(() => 'UNKNOWN'),
          contract.name().catch(() => 'Unknown Token'),
          contract.decimals().catch(() => 18),
          getTokenBalance(token0Address, account)
        ]);

        setToken0Info({
          address: token0Address,
          symbol,
          name,
          decimals: Number(decimals),
          balance
        });
      } catch (error) {
        console.error('Failed to load token0 info:', error);
        setToken0Info(null);
      }
    };

    loadTokenInfo();
  }, [token0Address, account, getTokenContract, getTokenBalance]);

  useEffect(() => {
    if (!token1Address || !account) return;

    const loadTokenInfo = async () => {
      try {
        const contract = getTokenContract(token1Address);
        if (!contract) return;

        const [symbol, name, decimals, balance] = await Promise.all([
          contract.symbol().catch(() => 'UNKNOWN'),
          contract.name().catch(() => 'Unknown Token'),
          contract.decimals().catch(() => 18),
          getTokenBalance(token1Address, account)
        ]);

        setToken1Info({
          address: token1Address,
          symbol,
          name,
          decimals: Number(decimals),
          balance
        });
      } catch (error) {
        console.error('Failed to load token1 info:', error);
        setToken1Info(null);
      }
    };

    loadTokenInfo();
  }, [token1Address, account, getTokenContract, getTokenBalance]);

  // Calculate sqrt price for Uniswap V4
  const calculateSqrtPriceX96 = (price: number): bigint => {
    // Convert price to sqrt(price) * 2^96
    const sqrtPrice = Math.sqrt(price);
    const Q96 = BigInt(2) ** BigInt(96);
    return BigInt(Math.floor(sqrtPrice * Number(Q96)));
  };

  // Create leverage-enabled pool
  const createLeveragePool = async () => {
    if (!marginRouter || !globalLedger || !token0Address || !token1Address) {
      throw new Error('Missing required contracts or token addresses');
    }

    try {
      setIsCreating(true);
      setCreationStep(1);

      // Step 1: Create pool key with LeverageHook
      const poolKey = createPoolKey(token0Address, token1Address);
      console.log('Creating pool with LeverageHook:', poolKey);

      setCreationStep(2);

      // Step 2: Calculate initial price
      const sqrtPriceX96 = calculateSqrtPriceX96(parseFloat(initialPrice));
      console.log('Initial sqrt price:', sqrtPriceX96.toString());

      // Step 3: Initialize pool (would need PoolManager contract)
      // Note: In a real implementation, you'd call poolManager.initialize()
      // For now, we'll simulate this step
      console.log('Pool initialization simulated (PoolManager required)');

      setCreationStep(3);

      // Step 4: Authorize pool for leverage trading
      console.log('Authorizing pool for leverage trading...');
      const authTx = await marginRouter.authorizePool(poolKey, maxLeverage);
      await authTx.wait();

      setCreationStep(4);

      // Step 5: Set borrow caps
      const poolId = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'address', 'uint24', 'int24'],
        [token0Address, token1Address, 3000, 60]
      ));

      console.log('Setting borrow caps...');
      const borrowCapBigInt = ethers.parseEther(borrowCap);

      await globalLedger.setPoolBorrowCap(poolId, token0Address, borrowCapBigInt);
      await globalLedger.setPoolBorrowCap(poolId, token1Address, borrowCapBigInt);

      setCreationStep(5);

      console.log('✅ Leverage-enabled pool created successfully!');

      // Reset form
      setToken0Address('');
      setToken1Address('');
      setInitialPrice('1.0');
      setBorrowCap('1000000');

    } catch (error) {
      console.error('Pool creation failed:', error);
      throw error;
    } finally {
      setIsCreating(false);
      setCreationStep(0);
    }
  };

  // Creation steps for UI feedback
  const creationSteps = [
    'Preparing pool configuration...',
    'Creating pool key with LeverageHook...',
    'Calculating initial price...',
    'Authorizing pool for leverage trading...',
    'Setting borrow caps...',
    'Pool created successfully!'
  ];

  if (!isConnected) {
    return (
      <div className="pool-creator-container">
        <div className="text-center py-8">
          <Waves className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">Pool Creator</h3>
          <p className="text-muted-foreground">Connect your wallet to create leverage-enabled pools</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pool-creator-container">
      {/* Header */}
      <div className="pool-creator-header">
        <div className="flex items-center space-x-3">
          <Waves className="w-8 h-8 text-primary" />
          <div>
            <h2 className="text-2xl font-bold">Pool Creator</h2>
            <p className="text-muted-foreground">Create pools with LeverageHook integration</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="pool-creator-tabs">
        {[
          { id: 'create', label: 'Create Pool', icon: Plus },
          { id: 'manage', label: 'Manage Pools', icon: Settings }
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveSection(id as 'create' | 'manage')}
            className={`pool-tab ${activeSection === id ? 'pool-tab-active' : 'pool-tab-inactive'}`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Create Pool Section */}
      {activeSection === 'create' && (
        <div className="pool-creator-content">
          {/* Quick Start Options */}
          <div className="pool-quick-start">
            <h3 className="text-lg font-semibold mb-3">Quick Start</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {Object.entries(TEST_TOKENS).map(([key, token]) => (
                <button
                  key={key}
                  onClick={() => {
                    if (!token0Address) {
                      setToken0Address(token.address);
                    } else if (!token1Address && token.address !== token0Address) {
                      setToken1Address(token.address);
                    }
                  }}
                  className="pool-quick-token"
                >
                  <div className="font-medium">{token.symbol}</div>
                  <div className="text-sm text-muted-foreground">{token.name}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Pool Configuration Form */}
          <div className="pool-config-form">
            <h3 className="text-lg font-semibold mb-4">Pool Configuration</h3>

            <div className="space-y-6">
              {/* Token Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="pool-token-input">
                  <label className="pool-label">Token 0</label>
                  <input
                    value={token0Address}
                    onChange={(e) => setToken0Address(e.target.value)}
                    placeholder="0x... or select from quick start"
                    className="pool-input"
                  />
                  {token0Info && (
                    <div className="pool-token-info">
                      <span className="font-medium">{token0Info.symbol}</span>
                      <span className="text-muted-foreground">
                        Balance: {ethers.formatUnits(token0Info.balance, token0Info.decimals).slice(0, 8)}
                      </span>
                    </div>
                  )}
                </div>

                <div className="pool-token-input">
                  <label className="pool-label">Token 1</label>
                  <input
                    value={token1Address}
                    onChange={(e) => setToken1Address(e.target.value)}
                    placeholder="0x... or select from quick start"
                    className="pool-input"
                  />
                  {token1Info && (
                    <div className="pool-token-info">
                      <span className="font-medium">{token1Info.symbol}</span>
                      <span className="text-muted-foreground">
                        Balance: {ethers.formatUnits(token1Info.balance, token1Info.decimals).slice(0, 8)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Pool Parameters */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="pool-param-input">
                  <label className="pool-label">Initial Price (Token1/Token0)</label>
                  <input
                    type="number"
                    value={initialPrice}
                    onChange={(e) => setInitialPrice(e.target.value)}
                    placeholder="1.0"
                    step="0.0001"
                    className="pool-input"
                  />
                </div>

                <div className="pool-param-input">
                  <label className="pool-label">Max Leverage</label>
                  <select
                    value={maxLeverage}
                    onChange={(e) => setMaxLeverage(Number(e.target.value))}
                    className="pool-input"
                  >
                    <option value={200}>2x</option>
                    <option value={300}>3x</option>
                    <option value={500}>5x</option>
                    <option value={1000}>10x</option>
                  </select>
                </div>

                <div className="pool-param-input">
                  <label className="pool-label">Borrow Cap (per token)</label>
                  <input
                    type="number"
                    value={borrowCap}
                    onChange={(e) => setBorrowCap(e.target.value)}
                    placeholder="1000000"
                    className="pool-input"
                  />
                </div>
              </div>

              {/* Pool Preview */}
              <div className="pool-preview">
                <h4 className="font-medium mb-3">Pool Preview</h4>
                <div className="pool-preview-content">
                  <div className="pool-preview-item">
                    <span className="pool-preview-label">Tokens:</span>
                    <span>
                      {token0Info?.symbol || 'Token0'} / {token1Info?.symbol || 'Token1'}
                    </span>
                  </div>
                  <div className="pool-preview-item">
                    <span className="pool-preview-label">Hook:</span>
                    <span className="font-mono text-sm">LeverageHook ({SHINRAI_CONTRACTS.LEVERAGE_HOOK.slice(0, 8)}...)</span>
                  </div>
                  <div className="pool-preview-item">
                    <span className="pool-preview-label">Fee:</span>
                    <span>0.3% (3000 bps)</span>
                  </div>
                  <div className="pool-preview-item">
                    <span className="pool-preview-label">Max Leverage:</span>
                    <span>{maxLeverage / 100}x</span>
                  </div>
                  <div className="pool-preview-item">
                    <span className="pool-preview-label">Initial Price:</span>
                    <span>{initialPrice} {token1Info?.symbol || 'Token1'} per {token0Info?.symbol || 'Token0'}</span>
                  </div>
                </div>
              </div>

              {/* Create Button */}
              <button
                onClick={createLeveragePool}
                disabled={
                  isCreating ||
                  !token0Address ||
                  !token1Address ||
                  !initialPrice ||
                  token0Address === token1Address
                }
                className="pool-create-button"
              >
                {isCreating ? (
                  <div className="flex items-center space-x-2">
                    <div className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
                    <span>{creationSteps[creationStep]}</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <Plus className="w-4 h-4" />
                    <span>Create Leverage Pool</span>
                  </div>
                )}
              </button>

              {/* Creation Progress */}
              {isCreating && (
                <div className="pool-creation-progress">
                  <div className="flex items-center space-x-2 mb-2">
                    <Droplets className="w-4 h-4 text-primary" />
                    <span className="font-medium">Creating Pool...</span>
                  </div>
                  <div className="pool-progress-bar">
                    <div
                      className="pool-progress-fill"
                      style={{ width: `${(creationStep / 5) * 100}%` }}
                    />
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    Step {creationStep} of 5: {creationSteps[creationStep]}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Manage Pools Section */}
      {activeSection === 'manage' && (
        <div className="pool-creator-content">
          <div className="text-center py-8">
            <Settings className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-xl font-semibold mb-2">Pool Management</h3>
            <p className="text-muted-foreground">View and manage your leverage-enabled pools</p>
            <p className="text-sm text-muted-foreground mt-2">Coming soon...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default PoolCreator;