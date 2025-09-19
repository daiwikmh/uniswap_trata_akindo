// Component for selecting and managing created pools
import React, { useState } from 'react';
import { Waves, Settings, ExternalLink, Edit2, Trash2, Plus, CheckCircle } from 'lucide-react';
import { useCreatedPools, useTokenSymbols, type StoredPool } from './hooks/useCreatedPools';
import { NETWORK_CONFIG } from './contracts';

interface PoolSelectorProps {
  onPoolSelected?: (pool: StoredPool) => void;
  className?: string;
}

export const PoolSelector: React.FC<PoolSelectorProps> = ({
  onPoolSelected,
  className = ""
}) => {
  const {
    pools,
    userPools,
    selectedPool,
    setSelectedPool,
    updatePoolName,
    removePool
  } = useCreatedPools();

  const { getTokenSymbol } = useTokenSymbols();
  const [editingPool, setEditingPool] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [tokenSymbols, setTokenSymbols] = useState<Record<string, string>>({});

  // Load token symbols for display
  const loadTokenSymbol = async (address: string) => {
    if (tokenSymbols[address]) return;

    const symbol = await getTokenSymbol(address);
    setTokenSymbols(prev => ({ ...prev, [address]: symbol }));
  };

  // Handle pool selection
  const handleSelectPool = (pool: StoredPool) => {
    setSelectedPool(pool);
    onPoolSelected?.(pool);
    console.log('Selected pool:', pool);
  };

  // Handle pool name editing
  const handleEditName = (pool: StoredPool) => {
    setEditingPool(pool.poolId);
    setEditName(pool.name || '');
  };

  const handleSaveName = (poolId: string) => {
    updatePoolName(poolId, editName);
    setEditingPool(null);
  };

  const handleCancelEdit = () => {
    setEditingPool(null);
    setEditName('');
  };

  // Format pool display name
  const getPoolDisplayName = (pool: StoredPool) => {
    const token0Symbol = tokenSymbols[pool.poolKey.currency0] || pool.poolKey.currency0.slice(0, 6) + '...';
    const token1Symbol = tokenSymbols[pool.poolKey.currency1] || pool.poolKey.currency1.slice(0, 6) + '...';
    return pool.name || `${token0Symbol}/${token1Symbol}`;
  };

  // Load symbols for displayed pools
  React.useEffect(() => {
    pools.forEach(pool => {
      loadTokenSymbol(pool.poolKey.currency0);
      loadTokenSymbol(pool.poolKey.currency1);
    });
  }, [pools]);

  if (pools.length === 0) {
    return (
      <div className={`bg-muted rounded-lg p-6 text-center ${className}`}>
        <Waves className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
        <p className="text-muted-foreground mb-2">No pools created yet</p>
        <p className="text-xs text-muted-foreground">
          Create your first pool in the "Create Pools" tab
        </p>
      </div>
    );
  }

  return (
    <div className={`bg-card border rounded-lg overflow-hidden ${className}`}>
      {/* Header */}
      <div className="p-4 border-b bg-muted/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Waves className="w-5 h-5 text-primary" />
            <h3 className="font-semibold">Available Pools</h3>
          </div>
          <div className="text-sm text-muted-foreground">
            {pools.length} pool{pools.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>

      {/* Pool List */}
      <div className="max-h-80 overflow-y-auto">
        {pools.map((pool) => (
          <div
            key={pool.poolId}
            className={`p-4 border-b last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer ${
              selectedPool?.poolId === pool.poolId ? 'bg-primary/10 border-l-4 border-l-primary' : ''
            }`}
            onClick={() => handleSelectPool(pool)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                {/* Pool Name */}
                <div className="flex items-center space-x-2 mb-2">
                  {editingPool === pool.poolId ? (
                    <div className="flex items-center space-x-2 flex-1">
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="flex-1 px-2 py-1 text-sm border rounded"
                        placeholder="Pool name"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSaveName(pool.poolId);
                        }}
                        className="p-1 text-success hover:bg-success/10 rounded"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelEdit();
                        }}
                        className="p-1 text-muted-foreground hover:bg-muted rounded"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <>
                      <h4 className="font-medium truncate">{getPoolDisplayName(pool)}</h4>
                      {selectedPool?.poolId === pool.poolId && (
                        <CheckCircle className="w-4 h-4 text-success flex-shrink-0" />
                      )}
                    </>
                  )}
                </div>

                {/* Pool Details */}
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="flex justify-between">
                    <span>Pool ID:</span>
                    <span className="font-mono">{pool.poolId.slice(0, 10)}...</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Fee:</span>
                    <span>{pool.poolKey.fee / 10000}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Created:</span>
                    <span>{new Date(pool.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Token Addresses */}
                <div className="mt-2 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-muted-foreground">Token 0:</div>
                      <div className="font-mono bg-muted/50 rounded px-1 py-0.5 truncate">
                        {tokenSymbols[pool.poolKey.currency0] || pool.poolKey.currency0.slice(0, 8) + '...'}
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground">Token 1:</div>
                      <div className="font-mono bg-muted/50 rounded px-1 py-0.5 truncate">
                        {tokenSymbols[pool.poolKey.currency1] || pool.poolKey.currency1.slice(0, 8) + '...'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-1 ml-2 flex-shrink-0">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleEditName(pool);
                  }}
                  className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                  title="Edit name"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                <a
                  href={`${NETWORK_CONFIG.EXPLORER_URL}/tx/${pool.transactionHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-1 text-muted-foreground hover:text-foreground hover:bg-muted rounded"
                  title="View on explorer"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Are you sure you want to remove this pool from your list?')) {
                      removePool(pool.poolId);
                    }
                  }}
                  className="p-1 text-destructive hover:bg-destructive/10 rounded"
                  title="Remove from list"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Selected Pool Info */}
      {selectedPool && (
        <div className="p-3 bg-primary/5 border-t">
          <div className="text-sm">
            <span className="text-muted-foreground">Selected:</span>{' '}
            <span className="font-medium">{getPoolDisplayName(selectedPool)}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Ready for leverage trading
          </div>
        </div>
      )}
    </div>
  );
};

export default PoolSelector;