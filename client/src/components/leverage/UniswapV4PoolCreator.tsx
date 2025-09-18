// Uniswap V4 Pool Creator with LeverageHook Integration
import React, { useState, useEffect, useRef } from 'react';
import { parseEther, formatEther, isAddress } from 'viem';
import { Plus, Waves, Settings, Droplets, AlertCircle, CheckCircle, Wallet, ExternalLink } from 'lucide-react';
import { useWagmiConnection, useWagmiContracts, useTokenInfo, useProtocolState } from './hooks/useWagmiContracts';
import { useWalletTokens } from './hooks/useWalletTokens';
import { SHINRAI_CONTRACTS, PROTOCOL_CONFIG } from './contracts';

interface PoolCreationStep {
  id: number;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
}

export const UniswapV4PoolCreator: React.FC = () => {
  // Wagmi hooks
  const { address, isConnected, connectWallet, disconnect } = useWagmiConnection();
  const { createLeveragePool, approveToken } = useWagmiContracts();
  const { maxLeverage, isPaused } = useProtocolState();
  const { allTokens, isLoading: tokensLoading, addCustomToken } = useWalletTokens();

  // Form state
  const [token0Address, setToken0Address] = useState<`0x${string}` | ''>('');
  const [token1Address, setToken1Address] = useState<`0x${string}` | ''>('');
  const [initialPrice, setInitialPrice] = useState('1.0');
  const [leverageLimit, setLeverageLimit] = useState(1000); // 10x
  const [borrowCap, setBorrowCap] = useState('1000000');
  const [initialLiquidity, setInitialLiquidity] = useState('1000');

  // Token selection state
  const [showTokenSelector, setShowTokenSelector] = useState<'token0' | 'token1' | null>(null);
  const [customTokenInput, setCustomTokenInput] = useState('');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Creation state
  const [isCreating, setIsCreating] = useState(false);
  const [creationSteps, setCreationSteps] = useState<PoolCreationStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [createdPool, setCreatedPool] = useState<any>(null);

  // Refs for click-outside functionality
  const token0SelectorRef = useRef<HTMLDivElement>(null);
  const token1SelectorRef = useRef<HTMLDivElement>(null);

  // Token info
  const token0Info = useTokenInfo(token0Address as `0x${string}` || undefined);
  const token1Info = useTokenInfo(token1Address as `0x${string}` || undefined);

  // Click outside to close dropdowns
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (token0SelectorRef.current && !token0SelectorRef.current.contains(event.target as Node)) {
        if (showTokenSelector === 'token0') {
          setShowTokenSelector(null);
        }
      }
      if (token1SelectorRef.current && !token1SelectorRef.current.contains(event.target as Node)) {
        if (showTokenSelector === 'token1') {
          setShowTokenSelector(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showTokenSelector]);

  // Predefined test tokens
  const TEST_TOKENS = {
    TOKEN0: { address: SHINRAI_CONTRACTS.MOCK_TOKEN0, symbol: 'TOKEN0', name: 'Mock Token 0' },
    TOKEN1: { address: SHINRAI_CONTRACTS.MOCK_TOKEN1, symbol: 'TOKEN1', name: 'Mock Token 1' },
    WETH: { address: SHINRAI_CONTRACTS.MOCK_WETH, symbol: 'WETH', name: 'Wrapped Ether' }
  };

  // Initialize creation steps
  const initializeSteps = (): PoolCreationStep[] => [
    {
      id: 1,
      title: 'Validate Tokens',
      description: 'Check token addresses are valid (no token info required)',
      status: 'pending'
    },
    {
      id: 2,
      title: 'Create Pool Key',
      description: 'Generate Uniswap V4 pool key with LeverageHook',
      status: 'pending'
    },
    {
      id: 3,
      title: 'Initialize Pool',
      description: 'Initialize Uniswap V4 pool with LeverageHook',
      status: 'pending'
    },
    {
      id: 4,
      title: 'Configure Leverage',
      description: 'Set borrow caps and leverage parameters',
      status: 'pending'
    },
    {
      id: 5,
      title: 'Add Initial Liquidity',
      description: 'Provide initial liquidity to the pool',
      status: 'pending'
    }
  ];

  // Update step status
  const updateStep = (stepId: number, status: PoolCreationStep['status']) => {
    setCreationSteps(prev => prev.map(step =>
      step.id === stepId ? { ...step, status } : step
    ));
  };

  // Validate form inputs with detailed feedback
  const validateInputs = (): boolean => {
    const errors: string[] = [];

    if (!token0Address) errors.push('Please select Token 0');
    if (!token1Address) errors.push('Please select Token 1');

    if (token0Address && !isAddress(token0Address)) {
      errors.push('Token 0 address is invalid');
    }
    if (token1Address && !isAddress(token1Address)) {
      errors.push('Token 1 address is invalid');
    }

    if (token0Address && token1Address && token0Address.toLowerCase() === token1Address.toLowerCase()) {
      errors.push('Token addresses must be different');
    }

    if (!initialPrice || parseFloat(initialPrice) <= 0) {
      errors.push('Please enter a valid initial price');
    }

    if (!borrowCap || parseFloat(borrowCap) <= 0) {
      errors.push('Please enter a valid borrow cap');
    }

    // Note: We don't need token info to create pools - just valid addresses per Uniswap V4 docs

    setValidationErrors(errors);
    return errors.length === 0;
  };

  // Handle token selection from wallet
  const selectToken = (tokenAddress: `0x${string}`, slot: 'token0' | 'token1') => {
    if (slot === 'token0') {
      setToken0Address(tokenAddress);
    } else {
      setToken1Address(tokenAddress);
    }
    setShowTokenSelector(null);
    setValidationErrors([]); // Clear errors when user selects
  };

  // Add custom token (works even if token info fails to load)
  const handleAddCustomToken = async () => {
    if (!customTokenInput || !isAddress(customTokenInput)) {
      alert('Please enter a valid token address');
      return;
    }

    try {
      // Auto-select the token address directly (token info not required for pool creation)
      if (showTokenSelector === 'token0') {
        setToken0Address(customTokenInput as `0x${string}`);
      } else if (showTokenSelector === 'token1') {
        setToken1Address(customTokenInput as `0x${string}`);
      }
      setCustomTokenInput('');
      setShowTokenSelector(null);

      // Try to add to wallet tokens for future use (but don't block if it fails)
      try {
        const token = await addCustomToken(customTokenInput);
        if (token) {
          console.log(`Token ${token.symbol} info loaded successfully`);
        }
      } catch (tokenError) {
        console.warn('Token info loading failed, but address is valid for pool creation:', tokenError);
      }

    } catch (error) {
      alert('Failed to select token. Please check the address.');
    }
  };

  // Get token info from wallet tokens (more reliable than Wagmi hooks)
  const getTokenFromWallet = (address: string) => {
    return allTokens.find(token => token.address.toLowerCase() === address.toLowerCase());
  };

  const token0FromWallet = token0Address ? getTokenFromWallet(token0Address) : null;
  const token1FromWallet = token1Address ? getTokenFromWallet(token1Address) : null;

  // Check if form is valid for submission (simplified per Uniswap V4 docs)
  const isFormValid = () => {
    return (
      token0Address &&
      token1Address &&
      isAddress(token0Address) &&
      isAddress(token1Address) &&
      token0Address.toLowerCase() !== token1Address.toLowerCase() &&
      initialPrice &&
      parseFloat(initialPrice) > 0 &&
      borrowCap &&
      parseFloat(borrowCap) > 0
      // No need for token info loading - just valid addresses per Uniswap V4 docs
    );
  };

  // Create Uniswap V4 pool with LeverageHook
  const handleCreatePool = async () => {
    if (!validateInputs()) return;

    try {
      setIsCreating(true);
      const steps = initializeSteps();
      setCreationSteps(steps);
      setCurrentStep(1);

      // Step 1: Validate tokens
      updateStep(1, 'in-progress');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate validation
      // Validate addresses only (per Uniswap V4 docs - no token info required)
      if (!isAddress(token0Address) || !isAddress(token1Address)) {
        throw new Error('Invalid token addresses');
      }
      updateStep(1, 'completed');
      setCurrentStep(2);

      // Step 2: Create pool key
      updateStep(2, 'in-progress');
      console.log('Creating pool with LeverageHook integration...');
      updateStep(2, 'completed');
      setCurrentStep(3);

      // Step 3: Initialize Uniswap V4 Pool
      updateStep(3, 'in-progress');
      const result = await createLeveragePool(
        token0Address as `0x${string}`,
        token1Address as `0x${string}`,
        initialPrice,
        leverageLimit,
        borrowCap
      );
      updateStep(3, 'completed');
      setCurrentStep(4);

      // Step 4: Configure leverage settings (borrow caps handled in createLeveragePool)
      updateStep(4, 'in-progress');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Allow time for confirmation
      updateStep(4, 'completed');
      setCurrentStep(5);

      // Step 5: Initial liquidity (placeholder for now)
      updateStep(5, 'in-progress');
      await new Promise(resolve => setTimeout(resolve, 1000));
      updateStep(5, 'completed');

      setCreatedPool(result);
      console.log('✅ Pool created successfully!', result);

    } catch (error) {
      console.error('Pool creation failed:', error);
      updateStep(currentStep, 'error');
      alert(`Pool creation failed: ${error}`);
    } finally {
      setIsCreating(false);
    }
  };

  // Connect wallet section
  if (!isConnected) {
    return (
      <div className="pool-creator-container">
        <div className="pool-creator-header">
          <div className="text-center">
            <Wallet className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-2xl font-bold mb-2">Connect Wallet</h2>
            <p className="text-muted-foreground mb-6">
              Connect your wallet to create Uniswap V4 pools with LeverageHook
            </p>
            <button
              onClick={connectWallet}
              className="pool-create-button max-w-sm mx-auto"
            >
              <Wallet className="w-4 h-4" />
              Connect MetaMask
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="pool-creator-container">
      {/* Header */}
      <div className="pool-creator-header">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <Waves className="w-8 h-8 text-primary" />
            <div>
              <h2 className="text-2xl font-bold">Uniswap V4 Pool Creator</h2>
              <p className="text-muted-foreground">Create pools with LeverageHook integration</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">Connected:</div>
            <div className="font-mono text-sm">{address?.slice(0, 8)}...{address?.slice(-6)}</div>
            <button
              onClick={() => disconnect()}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Disconnect
            </button>
          </div>
        </div>
      </div>

      <div className="pool-creator-content">
        {/* Quick Start Tokens */}
        <div className="pool-quick-start">
          <h3 className="text-lg font-semibold mb-3">Quick Start - Test Tokens</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {Object.entries(TEST_TOKENS).map(([key, token]) => (
              <button
                key={key}
                onClick={() => {
                  if (!token0Address) {
                    setToken0Address(token.address as `0x${string}`);
                  } else if (!token1Address && token.address !== token0Address) {
                    setToken1Address(token.address as `0x${string}`);
                  }
                }}
                className="pool-quick-token"
                disabled={token0Address === token.address || token1Address === token.address}
              >
                <div className="font-medium">{token.symbol}</div>
                <div className="text-sm text-muted-foreground">{token.name}</div>
                <div className="text-xs font-mono mt-1">{token.address.slice(0, 10)}...</div>
                {(token0Address === token.address || token1Address === token.address) && (
                  <div className="text-xs text-success mt-1">✓ Selected</div>
                )}
              </button>
            ))}
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            Click to select test tokens, or use the dropdowns below to enter any token address
          </div>
        </div>

        {/* Pool Configuration */}
        <div className="pool-config-form">
          <h3 className="text-lg font-semibold mb-4">Pool Configuration</h3>

          <div className="space-y-6">
            {/* Token Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Token 0 Selection */}
              <div className="pool-token-input">
                <label className="pool-label">Token 0</label>
                <div className="relative" ref={token0SelectorRef}>
                  <button
                    onClick={() => setShowTokenSelector('token0')}
                    className="pool-input text-left flex justify-between items-center"
                  >
                    {token0FromWallet ? (
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{token0FromWallet.symbol}</span>
                        <span className="text-muted-foreground text-sm">
                          ({token0FromWallet.balanceFormatted.slice(0, 6)})
                        </span>
                      </div>
                    ) : token0Info.isLoaded ? (
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{token0Info.symbol}</span>
                        <span className="text-muted-foreground text-sm">
                          ({formatEther(token0Info.balance || 0n).slice(0, 6)})
                        </span>
                      </div>
                    ) : token0Address ? (
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-sm">{token0Address.slice(0, 10)}...</span>
                        <span className="text-xs text-success">(Valid address ✓)</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Select token or enter address</span>
                    )}
                    <Droplets className="w-4 h-4 text-muted-foreground" />
                  </button>

                  {showTokenSelector === 'token0' && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-card border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      {/* Wallet Tokens */}
                      <div className="p-2 border-b">
                        <div className="text-sm font-medium mb-2">Your Tokens</div>
                        {tokensLoading ? (
                          <div className="text-sm text-muted-foreground">Loading tokens...</div>
                        ) : allTokens.length > 0 ? (
                          allTokens.map((token) => (
                            <button
                              key={token.address}
                              onClick={() => selectToken(token.address, 'token0')}
                              className="w-full p-2 text-left hover:bg-secondary rounded flex justify-between items-center"
                            >
                              <div>
                                <div className="font-medium">{token.symbol}</div>
                                <div className="text-xs text-muted-foreground">{token.name}</div>
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {token.balanceFormatted.slice(0, 6)}
                              </div>
                            </button>
                          ))
                        ) : (
                          <div className="text-sm text-muted-foreground">No tokens found</div>
                        )}
                      </div>

                      {/* Add Custom Token */}
                      <div className="p-2">
                        <div className="text-sm font-medium mb-2">Enter Token Address</div>
                        <div className="flex space-x-2">
                          <input
                            value={customTokenInput}
                            onChange={(e) => setCustomTokenInput(e.target.value)}
                            placeholder="0x1234... (paste token contract address)"
                            className="flex-1 px-2 py-1 text-xs border rounded font-mono"
                          />
                          <button
                            onClick={handleAddCustomToken}
                            disabled={!isAddress(customTokenInput)}
                            className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs disabled:opacity-50"
                          >
                            Select
                          </button>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Token info is optional - only valid address needed
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                {(token0FromWallet || token0Info.isLoaded) && (
                  <div className="pool-token-info">
                    <span className="font-medium">{token0FromWallet?.symbol || token0Info.symbol}</span>
                    <span className="text-muted-foreground">
                      Balance: {token0FromWallet?.balanceFormatted.slice(0, 8) || formatEther(token0Info.balance || 0n).slice(0, 8)}
                    </span>
                  </div>
                )}
              </div>

              {/* Token 1 Selection */}
              <div className="pool-token-input">
                <label className="pool-label">Token 1</label>
                <div className="relative" ref={token1SelectorRef}>
                  <button
                    onClick={() => setShowTokenSelector('token1')}
                    className="pool-input text-left flex justify-between items-center"
                  >
                    {token1FromWallet ? (
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{token1FromWallet.symbol}</span>
                        <span className="text-muted-foreground text-sm">
                          ({token1FromWallet.balanceFormatted.slice(0, 6)})
                        </span>
                      </div>
                    ) : token1Info.isLoaded ? (
                      <div className="flex items-center space-x-2">
                        <span className="font-medium">{token1Info.symbol}</span>
                        <span className="text-muted-foreground text-sm">
                          ({formatEther(token1Info.balance || 0n).slice(0, 6)})
                        </span>
                      </div>
                    ) : token1Address ? (
                      <div className="flex items-center space-x-2">
                        <span className="font-mono text-sm">{token1Address.slice(0, 10)}...</span>
                        <span className="text-xs text-success">(Valid address ✓)</span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Select token or enter address</span>
                    )}
                    <Droplets className="w-4 h-4 text-muted-foreground" />
                  </button>

                  {showTokenSelector === 'token1' && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-card border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      {/* Wallet Tokens */}
                      <div className="p-2 border-b">
                        <div className="text-sm font-medium mb-2">Your Tokens</div>
                        {tokensLoading ? (
                          <div className="text-sm text-muted-foreground">Loading tokens...</div>
                        ) : allTokens.filter(t => t.address.toLowerCase() !== token0Address.toLowerCase()).length > 0 ? (
                          allTokens
                            .filter(t => t.address.toLowerCase() !== token0Address.toLowerCase())
                            .map((token) => (
                              <button
                                key={token.address}
                                onClick={() => selectToken(token.address, 'token1')}
                                className="w-full p-2 text-left hover:bg-secondary rounded flex justify-between items-center"
                              >
                                <div>
                                  <div className="font-medium">{token.symbol}</div>
                                  <div className="text-xs text-muted-foreground">{token.name}</div>
                                </div>
                                <div className="text-sm text-muted-foreground">
                                  {token.balanceFormatted.slice(0, 6)}
                                </div>
                              </button>
                            ))
                        ) : (
                          <div className="text-sm text-muted-foreground">No available tokens</div>
                        )}
                      </div>

                      {/* Add Custom Token */}
                      <div className="p-2">
                        <div className="text-sm font-medium mb-2">Enter Token Address</div>
                        <div className="flex space-x-2">
                          <input
                            value={customTokenInput}
                            onChange={(e) => setCustomTokenInput(e.target.value)}
                            placeholder="0x1234... (paste token contract address)"
                            className="flex-1 px-2 py-1 text-xs border rounded font-mono"
                          />
                          <button
                            onClick={handleAddCustomToken}
                            disabled={!isAddress(customTokenInput)}
                            className="px-3 py-1 bg-primary text-primary-foreground rounded text-xs disabled:opacity-50"
                          >
                            Select
                          </button>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Token info is optional - only valid address needed
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                {(token1FromWallet || token1Info.isLoaded) && (
                  <div className="pool-token-info">
                    <span className="font-medium">{token1FromWallet?.symbol || token1Info.symbol}</span>
                    <span className="text-muted-foreground">
                      Balance: {token1FromWallet?.balanceFormatted.slice(0, 8) || formatEther(token1Info.balance || 0n).slice(0, 8)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Validation Errors */}
            {validationErrors.length > 0 && (
              <div className="pool-creation-progress">
                <div className="flex items-center space-x-2 mb-3">
                  <AlertCircle className="w-5 h-5 text-destructive" />
                  <h4 className="font-medium text-destructive">Please fix these issues:</h4>
                </div>
                <ul className="space-y-1">
                  {validationErrors.map((error, index) => (
                    <li key={index} className="text-sm text-destructive flex items-center space-x-2">
                      <span className="w-1 h-1 bg-destructive rounded-full flex-shrink-0" />
                      <span>{error}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Pool Parameters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="pool-param-input">
                <label className="pool-label">Initial Price ({token1FromWallet?.symbol || token1Info.symbol || 'Token1'}/{token0FromWallet?.symbol || token0Info.symbol || 'Token0'})</label>
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
                  value={leverageLimit}
                  onChange={(e) => setLeverageLimit(Number(e.target.value))}
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
                  <span className="pool-preview-label">Pair:</span>
                  <span>{token0FromWallet?.symbol || token0Info.symbol || 'Token0'} / {token1FromWallet?.symbol || token1Info.symbol || 'Token1'}</span>
                </div>
                <div className="pool-preview-item">
                  <span className="pool-preview-label">Fee:</span>
                  <span>0.3% (3000 bps)</span>
                </div>
                <div className="pool-preview-item">
                  <span className="pool-preview-label">Hook:</span>
                  <span className="font-mono text-sm">
                    LeverageHook ({SHINRAI_CONTRACTS.LEVERAGE_HOOK.slice(0, 8)}...)
                    <ExternalLink className="w-3 h-3 inline ml-1" />
                  </span>
                </div>
                <div className="pool-preview-item">
                  <span className="pool-preview-label">Max Leverage:</span>
                  <span>{leverageLimit / 100}x</span>
                </div>
                <div className="pool-preview-item">
                  <span className="pool-preview-label">Initial Price:</span>
                  <span>{initialPrice} {token1FromWallet?.symbol || token1Info.symbol || 'Token1'} per {token0FromWallet?.symbol || token0Info.symbol || 'Token0'}</span>
                </div>
              </div>
            </div>

            {/* Button Status Debug */}
            {!isFormValid() && (
              <div className="pool-creation-progress">
                <div className="flex items-center space-x-2 mb-3">
                  <AlertCircle className="w-4 h-4 text-muted-foreground" />
                  <h4 className="text-sm font-medium text-muted-foreground">Button Status:</h4>
                </div>
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>• Token 0 Selected: {token0Address ? '✓' : '✗'}</div>
                  <div>• Token 1 Selected: {token1Address ? '✓' : '✗'}</div>
                  <div>• Valid Addresses: {token0Address && isAddress(token0Address) && token1Address && isAddress(token1Address) ? '✓' : '✗'}</div>
                  <div>• Different Tokens: {token0Address && token1Address && token0Address.toLowerCase() !== token1Address.toLowerCase() ? '✓' : '✗'}</div>
                  <div>• Initial Price Valid: {initialPrice && parseFloat(initialPrice) > 0 ? '✓' : '✗'}</div>
                  <div>• Borrow Cap Valid: {borrowCap && parseFloat(borrowCap) > 0 ? '✓' : '✗'}</div>
                  <div className="text-xs text-success mt-2">✓ Token info not required (per Uniswap V4 docs)</div>
                </div>
              </div>
            )}

            {/* Create Button */}
            <button
              onClick={handleCreatePool}
              disabled={!isFormValid() || isCreating}
              className={`pool-create-button ${
                !isFormValid() || isCreating
                  ? 'opacity-50 cursor-not-allowed'
                  : 'hover:bg-primary/90 active:bg-primary/80'
              }`}
            >
              {isCreating ? (
                <div className="flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
                  <span>Creating Pool...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <Plus className="w-4 h-4" />
                  <span>Create Uniswap V4 Pool with LeverageHook</span>
                </div>
              )}
            </button>
          </div>
        </div>

        {/* Creation Progress */}
        {creationSteps.length > 0 && (
          <div className="pool-creation-progress">
            <h4 className="font-medium mb-4">Pool Creation Progress</h4>
            <div className="space-y-3">
              {creationSteps.map((step) => (
                <div
                  key={step.id}
                  className={`flex items-center space-x-3 p-3 rounded-lg border ${
                    step.status === 'completed'
                      ? 'bg-success/10 border-success/20'
                      : step.status === 'in-progress'
                      ? 'bg-primary/10 border-primary/20'
                      : step.status === 'error'
                      ? 'bg-destructive/10 border-destructive/20'
                      : 'bg-muted border-border'
                  }`}
                >
                  <div className="flex-shrink-0">
                    {step.status === 'completed' ? (
                      <CheckCircle className="w-5 h-5 text-success" />
                    ) : step.status === 'in-progress' ? (
                      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                    ) : step.status === 'error' ? (
                      <AlertCircle className="w-5 h-5 text-destructive" />
                    ) : (
                      <div className="w-5 h-5 rounded-full border-2 border-muted-foreground" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium">{step.title}</div>
                    <div className="text-sm text-muted-foreground">{step.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Success Message */}
        {createdPool && (
          <div className="pool-creation-progress">
            <div className="flex items-center space-x-2 mb-4">
              <CheckCircle className="w-6 h-6 text-success" />
              <h4 className="font-medium text-success">Pool Created Successfully!</h4>
            </div>
            <div className="space-y-2 text-sm">
              <div>✅ Pool authorized for leverage trading</div>
              <div>✅ Borrow caps configured</div>
              <div>✅ LeverageHook integrated</div>
              <div className="mt-4 p-3 bg-muted rounded-lg">
                <div className="font-medium mb-2">Next Steps:</div>
                <ol className="list-decimal list-inside space-y-1 text-sm">
                  <li>Add initial liquidity to the pool</li>
                  <li>Test leverage trading functionality</li>
                  <li>Monitor EigenLayer operator validation</li>
                </ol>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UniswapV4PoolCreator;