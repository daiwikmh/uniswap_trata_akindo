import { useCreatedPools } from './hooks/useCreatedPools';
import React, { useState, useEffect } from 'react';
import { parseEther, formatEther, isAddress } from 'viem';
import {
  TrendingUp, TrendingDown, Zap, AlertTriangle,
  Target, Activity, Calculator, Info
} from 'lucide-react';
import { useWagmiContracts, useTokenInfo } from './hooks/useWagmiContracts';
import { usePoolData, useLeveragePositions } from './hooks/usePoolData';
import { SHINRAI_CONTRACTS } from './contracts';

interface LeverageTradingInterfaceProps {
  poolKey?: any; // Made optional - will use created pools if not provided
  poolId?: string;
  className?: string;
}

interface TradeParams {
  collateralToken: string;
  collateralAmount: string;
  borrowToken: string;
  leverageRatio: number;
  isLongPosition: boolean;
  slippagePercent: number;
}

export const LeverageTradingInterface: React.FC<LeverageTradingInterfaceProps> = ({
  poolKey: providedPoolKey,
  className = ""
}) => {
  const { openLeveragePosition, approveToken, isConnected } = useWagmiContracts();

  // Use created pools if no poolKey is provided
  const { pools, selectedPool } = useCreatedPools();
  const [selectedPoolId, setSelectedPoolId] = useState<string>('');

  // Determine which pool to use
  const currentPool = providedPoolKey
    ? { poolKey: providedPoolKey }
    : selectedPoolId
      ? pools.find(p => p.poolId === selectedPoolId)
      : selectedPool;

  const poolKey = currentPool?.poolKey;

  const { poolData } = usePoolData(poolKey);
  const { totalPositions } = useLeveragePositions();

  // Debug logging
  useEffect(() => {
    console.log('🔄 LeverageTradingInterface state:', {
      providedPoolKey: !!providedPoolKey,
      poolsAvailable: pools.length,
      selectedPoolId,
      currentPool: currentPool ? 'found' : 'none',
      poolKey: poolKey ? 'available' : 'missing'
    });
  }, [providedPoolKey, pools.length, selectedPoolId, currentPool, poolKey]);

  // Trading state
  const [tradeParams, setTradeParams] = useState<TradeParams>({
    collateralToken: '',
    collateralAmount: '',
    borrowToken: '',
    leverageRatio: 200, // 2x
    isLongPosition: true,
    slippagePercent: 0.5
  });

  // Update trade params when pool changes
  useEffect(() => {
    if (poolKey) {
      setTradeParams(prev => ({
        ...prev,
        collateralToken: poolKey.currency0 || '',
        borrowToken: poolKey.currency1 || ''
      }));
      console.log('🔄 Updated trade params with pool tokens:', {
        currency0: poolKey.currency0,
        currency1: poolKey.currency1
      });
    }
  }, [poolKey]);

  const [isTrading, setIsTrading] = useState(false);
  const [tradeStep, setTradeStep] = useState<'input' | 'approve' | 'confirm' | 'pending'>('input');
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [estimatedOutput, setEstimatedOutput] = useState<bigint>(0n);

  // Token info
  const collateralTokenInfo = useTokenInfo(tradeParams.collateralToken as `0x${string}`);
  const borrowTokenInfo = useTokenInfo(tradeParams.borrowToken as `0x${string}`);

  // Validate trade parameters
  useEffect(() => {
    const errors: string[] = [];

    if (!poolKey) {
      errors.push('No pool selected');
    }

    if (!tradeParams.collateralAmount || parseFloat(tradeParams.collateralAmount) <= 0) {
      errors.push('Enter valid collateral amount');
    }

    if (tradeParams.leverageRatio < 100 || tradeParams.leverageRatio > 1000) {
      errors.push('Leverage must be between 1x and 10x');
    }

    if (!isAddress(tradeParams.collateralToken)) {
      errors.push('Invalid collateral token address');
    }

    if (!isAddress(tradeParams.borrowToken)) {
      errors.push('Invalid borrow token address');
    }

    if (tradeParams.collateralToken.toLowerCase() === tradeParams.borrowToken.toLowerCase()) {
      errors.push('Collateral and borrow tokens must be different');
    }

    // Check balance
    if (collateralTokenInfo.balance && tradeParams.collateralAmount) {
      const requiredBalance = parseEther(tradeParams.collateralAmount);
      if (collateralTokenInfo.balance < requiredBalance) {
        errors.push(`Insufficient ${collateralTokenInfo.symbol || 'token'} balance`);
      }
    }

    setValidationErrors(errors);
  }, [tradeParams, poolKey, collateralTokenInfo.balance, collateralTokenInfo.symbol]);

  // Calculate estimated borrow amount
  useEffect(() => {
    if (!tradeParams.collateralAmount || tradeParams.leverageRatio <= 100) {
      setEstimatedOutput(0n);
      return;
    }

    try {
      const collateralBigInt = parseEther(tradeParams.collateralAmount);
      const leverageMultiplier = BigInt(tradeParams.leverageRatio - 100); // Remove 1x for collateral
      const borrowAmount = (collateralBigInt * leverageMultiplier) / BigInt(100);
      setEstimatedOutput(borrowAmount);
    } catch (err) {
      setEstimatedOutput(0n);
    }
  }, [tradeParams.collateralAmount, tradeParams.leverageRatio]);

  // Handle parameter changes
  const updateTradeParam = (key: keyof TradeParams, value: any) => {
    setTradeParams(prev => ({ ...prev, [key]: value }));
  };

  // Swap collateral and borrow tokens
  const swapTokens = () => {
    setTradeParams(prev => ({
      ...prev,
      collateralToken: prev.borrowToken,
      borrowToken: prev.collateralToken,
      isLongPosition: !prev.isLongPosition
    }));
  };

  // Execute leverage trade
  const executeTrade = async () => {
    if (validationErrors.length > 0 || !poolKey) return;

    try {
      setIsTrading(true);
      setTradeStep('approve');

      // Step 1: Approve collateral token
      console.log('Approving collateral token...');
      await approveToken(
        tradeParams.collateralToken as `0x${string}`,
        SHINRAI_CONTRACTS.MARGIN_ROUTER as `0x${string}`,
        tradeParams.collateralAmount
      );

      setTradeStep('confirm');

      // Step 2: Open leverage position
      console.log('Opening leverage position...');
      const tx = await openLeveragePosition(
        poolKey,
        tradeParams.collateralToken as `0x${string}`,
        tradeParams.collateralAmount,
        formatEther(estimatedOutput),
        tradeParams.leverageRatio,
        tradeParams.isLongPosition
      );

      setTradeStep('pending');
      console.log('Trade transaction:', tx);

      // Reset form
      setTradeParams(prev => ({ ...prev, collateralAmount: '' }));
      setTradeStep('input');
      alert('Leverage position opened successfully!');

    } catch (error) {
      console.error('Trade failed:', error);
      alert(`Trade failed: ${error}`);
      setTradeStep('input');
    } finally {
      setIsTrading(false);
    }
  };

  const isFormValid = validationErrors.length === 0 && isConnected && tradeParams.collateralAmount;

  // Show pool selection if no pool is available and there are created pools
  if (!poolKey && pools.length === 0) {
    return (
      <div className={`bg-muted rounded-lg p-6 text-center ${className}`}>
        <Info className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-muted-foreground">No pools available for trading</p>
        <p className="text-sm text-muted-foreground mt-2">
          Create a pool first in the "Create Pools" tab
        </p>
      </div>
    );
  }

  return (
    <div className={`bg-card border rounded-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className="p-6 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Zap className="w-6 h-6 text-primary" />
            <div>
              <h3 className="text-xl font-bold">Leverage Trading</h3>
              <p className="text-sm text-muted-foreground">
                Trade with up to 10x leverage using LeverageHook
              </p>
            </div>
          </div>
          {totalPositions > 0 && (
            <div className="text-right">
              <div className="text-sm text-muted-foreground">Your Positions</div>
              <div className="text-lg font-bold">{totalPositions}</div>
            </div>
          )}
        </div>
      </div>

      {/* Pool Selection - only show if no poolKey provided and pools are available */}
      {!providedPoolKey && pools.length > 0 && (
        <div className="p-4 bg-secondary/5 border-b">
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Select Trading Pool</h4>
            <select
              value={selectedPoolId}
              onChange={(e) => setSelectedPoolId(e.target.value)}
              className="w-full p-3 border rounded-lg bg-background"
            >
              <option value="">Choose a pool...</option>
              {pools.map((pool) => (
                <option key={pool.poolId} value={pool.poolId}>
                  {pool.name} (Fee: {pool.poolKey.fee / 10000}%)
                </option>
              ))}
            </select>
            <div className="text-xs text-muted-foreground">
              Pools available: {pools.length} |
              Current: {currentPool ? (currentPool as any).name || 'Selected' : 'None'}
            </div>
          </div>
        </div>
      )}

      {/* Pool Status */}
      {poolData && (
        <div className="p-4 bg-primary/5 border-b">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-success" />
              <span>Pool Active</span>
              <span className="text-muted-foreground">•</span>
              <span>Price: {poolData.price.toFixed(6)}</span>
            </div>
            <div className="text-muted-foreground">
              Liquidity: ${formatEther(poolData.liquidity).slice(0, 8)}
            </div>
          </div>
        </div>
      )}

      <div className="p-6 space-y-6">
        {/* Trade Direction */}
        <div className="space-y-4">
          <h4 className="font-semibold flex items-center space-x-2">
            <Target className="w-4 h-4" />
            <span>Trade Direction</span>
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => updateTradeParam('isLongPosition', true)}
              className={`p-4 rounded-lg border text-center transition-colors ${
                tradeParams.isLongPosition
                  ? 'border-success bg-success/10 text-success'
                  : 'border-border hover:border-success/50'
              }`}
            >
              <TrendingUp className="w-6 h-6 mx-auto mb-2" />
              <div className="font-medium">Long</div>
              <div className="text-xs text-muted-foreground">Buy & Hold</div>
            </button>
            <button
              onClick={() => updateTradeParam('isLongPosition', false)}
              className={`p-4 rounded-lg border text-center transition-colors ${
                !tradeParams.isLongPosition
                  ? 'border-destructive bg-destructive/10 text-destructive'
                  : 'border-border hover:border-destructive/50'
              }`}
            >
              <TrendingDown className="w-6 h-6 mx-auto mb-2" />
              <div className="font-medium">Short</div>
              <div className="text-xs text-muted-foreground">Sell & Profit</div>
            </button>
          </div>
        </div>

        {/* Token Selection */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Token Pair</h4>
            <button
              onClick={swapTokens}
              className="text-sm text-primary hover:text-primary/80"
            >
              ↕️ Swap
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {/* Collateral Token */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                Collateral Token
              </label>
              <div className="bg-muted rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="font-mono text-sm">
                    {tradeParams.collateralToken.slice(0, 10)}...
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {collateralTokenInfo.symbol || 'Token'}
                  </div>
                </div>
                {collateralTokenInfo.balance && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Balance: {formatEther(collateralTokenInfo.balance).slice(0, 8)}
                  </div>
                )}
              </div>
            </div>

            {/* Borrow Token */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">
                Borrow Token
              </label>
              <div className="bg-muted rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="font-mono text-sm">
                    {tradeParams.borrowToken.slice(0, 10)}...
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {borrowTokenInfo.symbol || 'Token'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Trade Parameters */}
        <div className="space-y-4">
          <h4 className="font-semibold flex items-center space-x-2">
            <Calculator className="w-4 h-4" />
            <span>Trade Parameters</span>
          </h4>

          {/* Collateral Amount */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Collateral Amount
            </label>
            <div className="relative">
              <input
                type="number"
                value={tradeParams.collateralAmount}
                onChange={(e) => updateTradeParam('collateralAmount', e.target.value)}
                placeholder="0.00"
                step="0.001"
                className="w-full px-4 py-3 bg-background border rounded-lg text-lg"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {collateralTokenInfo.symbol || 'Tokens'}
              </div>
            </div>
          </div>

          {/* Leverage Ratio */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Leverage: {(tradeParams.leverageRatio / 100).toFixed(1)}x
            </label>
            <input
              type="range"
              min="100"
              max="1000"
              step="50"
              value={tradeParams.leverageRatio}
              onChange={(e) => updateTradeParam('leverageRatio', parseInt(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>1x</span>
              <span>5.5x</span>
              <span>10x</span>
            </div>
          </div>

          {/* Slippage */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Slippage Tolerance: {tradeParams.slippagePercent}%
            </label>
            <div className="flex space-x-2">
              {[0.1, 0.5, 1.0].map((percent) => (
                <button
                  key={percent}
                  onClick={() => updateTradeParam('slippagePercent', percent)}
                  className={`px-3 py-1 rounded text-sm ${
                    tradeParams.slippagePercent === percent
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted hover:bg-muted/80'
                  }`}
                >
                  {percent}%
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Trade Summary */}
        {estimatedOutput > 0n && (
          <div className="bg-muted rounded-lg p-4 space-y-2">
            <h5 className="font-medium">Trade Summary</h5>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Collateral:</span>
                <span>{tradeParams.collateralAmount} {collateralTokenInfo.symbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Borrow Amount:</span>
                <span>{formatEther(estimatedOutput).slice(0, 8)} {borrowTokenInfo.symbol}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Total Exposure:</span>
                <span className="font-medium">
                  {(parseFloat(tradeParams.collateralAmount || '0') * tradeParams.leverageRatio / 100).toFixed(4)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Liquidation Risk:</span>
                <span className={`${
                  tradeParams.leverageRatio > 500 ? 'text-destructive' : 'text-warning'
                }`}>
                  {tradeParams.leverageRatio > 500 ? 'High' : 'Medium'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Validation Errors */}
        {validationErrors.length > 0 && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
            <div className="flex items-center space-x-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-destructive" />
              <span className="text-destructive font-medium">Please fix these issues:</span>
            </div>
            <ul className="space-y-1">
              {validationErrors.map((error, index) => (
                <li key={index} className="text-sm text-destructive flex items-center space-x-2">
                  <span className="w-1 h-1 bg-destructive rounded-full" />
                  <span>{error}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Execute Button */}
        <button
          onClick={executeTrade}
          disabled={!isFormValid || isTrading}
          className={`w-full py-4 rounded-lg font-medium transition-all ${
            isFormValid && !isTrading
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'bg-muted text-muted-foreground cursor-not-allowed'
          }`}
        >
          {isTrading ? (
            <div className="flex items-center justify-center space-x-2">
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span>
                {tradeStep === 'approve' && 'Approving...'}
                {tradeStep === 'confirm' && 'Confirming...'}
                {tradeStep === 'pending' && 'Processing...'}
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-center space-x-2">
              <Zap className="w-4 h-4" />
              <span>
                Open {tradeParams.isLongPosition ? 'Long' : 'Short'} Position
              </span>
            </div>
          )}
        </button>
      </div>
    </div>
  );
};

export default LeverageTradingInterface;