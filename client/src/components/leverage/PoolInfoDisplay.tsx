// Pool Information Display Component with real-time data
import React, { useState } from 'react';
import { formatEther } from 'viem';
import {
  TrendingUp, TrendingDown, Activity, Droplets,
  Zap, Shield, AlertTriangle, Info, ExternalLink,
  RefreshCw, Clock, DollarSign
} from 'lucide-react';
import { usePoolData, useLeveragePoolInfo, usePoolMonitoring, useLeveragePositions } from './hooks/usePoolData';
import { NETWORK_CONFIG } from './contracts';

interface PoolInfoDisplayProps {
  poolKey: any;
  poolId?: string;
  className?: string;
}

export const PoolInfoDisplay: React.FC<PoolInfoDisplayProps> = ({
  poolKey,
  poolId,
  className = ""
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'positions' | 'analytics'>('overview');

  // Fetch pool data
  const { poolData, isLoading: poolLoading, error } = usePoolData(poolKey);
  const leverageInfo = useLeveragePoolInfo(poolKey);
  const { priceHistory, alerts, currentPrice, priceChange24h } = usePoolMonitoring(poolKey);
  const { positions, totalPositions } = useLeveragePositions(poolKey);

  if (!poolKey) {
    return (
      <div className={`bg-muted rounded-lg p-6 text-center ${className}`}>
        <Info className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-muted-foreground">No pool selected</p>
      </div>
    );
  }

  if (poolLoading) {
    return (
      <div className={`bg-card border rounded-lg p-6 ${className}`}>
        <div className="flex items-center justify-center space-x-2">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span>Loading pool data...</span>
        </div>
      </div>
    );
  }

  if (error || !poolData) {
    return (
      <div className={`bg-destructive/10 border border-destructive/20 rounded-lg p-6 ${className}`}>
        <div className="flex items-center space-x-2 text-destructive">
          <AlertTriangle className="w-5 h-5" />
          <span>Failed to load pool data: {error || 'Unknown error'}</span>
        </div>
      </div>
    );
  }

  const formatPrice = (price: number) => {
    if (price < 0.001) return price.toExponential(4);
    if (price < 1) return price.toFixed(6);
    return price.toFixed(4);
  };

  const formatLiquidity = (liquidity: bigint) => {
    const value = Number(formatEther(liquidity));
    if (value > 1000000) return `${(value / 1000000).toFixed(2)}M`;
    if (value > 1000) return `${(value / 1000).toFixed(2)}K`;
    return value.toFixed(2);
  };

  return (
    <div className={`bg-card border rounded-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className="p-6 border-b">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <Droplets className="w-6 h-6 text-primary" />
              <h3 className="text-xl font-bold">Pool Information</h3>
            </div>
            {leverageInfo.isAuthorized && (
              <div className="flex items-center space-x-1 px-2 py-1 bg-success/10 text-success rounded-full text-xs">
                <Shield className="w-3 h-3" />
                <span>Leverage Enabled</span>
              </div>
            )}
          </div>
          <a
            href={`${NETWORK_CONFIG.EXPLORER_URL}/tx/${poolId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="w-3 h-3" />
            <span>View on Explorer</span>
          </a>
        </div>

        {/* Pool ID */}
        <div className="bg-muted rounded-lg p-3 font-mono text-sm break-all">
          Pool ID: {poolData.poolId}
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="p-4 bg-warning/10 border-b border-warning/20">
          <div className="flex items-center space-x-2 text-warning text-sm">
            <AlertTriangle className="w-4 h-4" />
            <span>Latest: {alerts[alerts.length - 1]}</span>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b">
        {(['overview', 'positions', 'analytics'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 px-4 py-3 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? 'text-primary border-b-2 border-primary bg-primary/5'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
            {tab === 'positions' && totalPositions > 0 && (
              <span className="ml-2 px-2 py-0.5 bg-primary text-primary-foreground rounded-full text-xs">
                {totalPositions}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-muted rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Current Price</span>
                  <DollarSign className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-2xl font-bold">{formatPrice(currentPrice)}</span>
                  {priceChange24h !== 0 && (
                    <div className={`flex items-center space-x-1 ${
                      priceChange24h > 0 ? 'text-success' : 'text-destructive'
                    }`}>
                      {priceChange24h > 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      <span className="text-sm">{Math.abs(priceChange24h).toFixed(2)}%</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-muted rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Total Liquidity</span>
                  <Droplets className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="text-2xl font-bold">${formatLiquidity(poolData.liquidity)}</div>
              </div>

              <div className="bg-muted rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-muted-foreground">Max Leverage</span>
                  <Zap className="w-4 h-4 text-muted-foreground" />
                </div>
                <div className="text-2xl font-bold">{leverageInfo.maxLeverage / 100}x</div>
              </div>
            </div>

            {/* Pool Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="font-semibold">Pool Configuration</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fee Tier:</span>
                    <span>{poolData.lpFee / 100}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current Tick:</span>
                    <span className="font-mono">{poolData.tick}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Protocol Fee:</span>
                    <span>{poolData.protocolFee / 100}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status:</span>
                    <span className={`flex items-center space-x-1 ${
                      poolData.isInitialized ? 'text-success' : 'text-destructive'
                    }`}>
                      <Activity className="w-3 h-3" />
                      <span>{poolData.isInitialized ? 'Active' : 'Inactive'}</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold">Token Addresses</h4>
                <div className="space-y-2 text-xs">
                  <div>
                    <div className="text-muted-foreground mb-1">Token 0:</div>
                    <div className="font-mono bg-muted rounded px-2 py-1 break-all">
                      {poolData.token0}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">Token 1:</div>
                    <div className="font-mono bg-muted rounded px-2 py-1 break-all">
                      {poolData.token1}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground mb-1">LeverageHook:</div>
                    <div className="font-mono bg-muted rounded px-2 py-1 break-all">
                      {poolData.hooks}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'positions' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold">Your Leverage Positions</h4>
              <div className="text-sm text-muted-foreground">
                Total: {totalPositions}
              </div>
            </div>

            {positions.length === 0 ? (
              <div className="text-center py-8">
                <Activity className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-muted-foreground mb-2">No positions found</p>
                <p className="text-xs text-muted-foreground">
                  Open your first leverage position to see it here
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {positions.map((position, index) => (
                  <div key={position.id || index} className="bg-muted rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                          <span className="text-primary text-sm font-bold">#{index + 1}</span>
                        </div>
                        <div>
                          <div className="font-medium">Position {position.id?.slice(0, 8)}...</div>
                          <div className="text-sm text-muted-foreground">
                            <Clock className="w-3 h-3 inline mr-1" />
                            Opened recently
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">Status</div>
                        <div className="text-success">Active</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'analytics' && (
          <div className="space-y-6">
            <h4 className="font-semibold">Pool Analytics</h4>

            {/* Price Chart Placeholder */}
            <div className="bg-muted rounded-lg p-6 text-center">
              <TrendingUp className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">Price Chart</p>
              <p className="text-xs text-muted-foreground">
                Historical price data: {priceHistory.length} points collected
              </p>
              {priceHistory.length > 0 && (
                <div className="mt-4 text-sm">
                  <div>Latest Price: {formatPrice(priceHistory[priceHistory.length - 1]?.price || 0)}</div>
                  <div>24h Change: {priceChange24h.toFixed(2)}%</div>
                </div>
              )}
            </div>

            {/* Trading Volume */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-muted rounded-lg p-4">
                <h5 className="font-medium mb-2">Trading Volume</h5>
                <div className="text-2xl font-bold">$0</div>
                <div className="text-xs text-muted-foreground">24h volume</div>
              </div>
              <div className="bg-muted rounded-lg p-4">
                <h5 className="font-medium mb-2">Fees Earned</h5>
                <div className="text-2xl font-bold">$0</div>
                <div className="text-xs text-muted-foreground">24h fees</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PoolInfoDisplay;