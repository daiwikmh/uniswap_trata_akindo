// Quick test component to verify Sepolia contract connections
import React, { useState } from 'react';
import { useReadContract } from 'wagmi';
import { SHINRAI_CONTRACTS, POOL_MANAGER_ABI, MARGIN_ROUTER_ABI, GLOBAL_ASSET_LEDGER_ABI } from './contracts';

export const ContractTest: React.FC = () => {
  const [testResults, setTestResults] = useState<Record<string, any>>({});

  // Test PoolManager connection
  const { data: isUnlocked, error: poolManagerError } = useReadContract({
    address: SHINRAI_CONTRACTS.POOL_MANAGER as `0x${string}`,
    abi: POOL_MANAGER_ABI,
    functionName: 'isUnlocked',
    query: {
      retry: false,
      refetchOnWindowFocus: false
    }
  });

  // Test MarginRouter connection
  const { data: maxLeverage, error: marginRouterError } = useReadContract({
    address: SHINRAI_CONTRACTS.MARGIN_ROUTER as `0x${string}`,
    abi: MARGIN_ROUTER_ABI,
    functionName: 'maxGlobalLeverage',
    query: {
      retry: false,
      refetchOnWindowFocus: false
    }
  });

  // Test GlobalAssetLedger connection
  const { data: globalBorrowCap, error: ledgerError } = useReadContract({
    address: SHINRAI_CONTRACTS.GLOBAL_ASSET_LEDGER as `0x${string}`,
    abi: GLOBAL_ASSET_LEDGER_ABI,
    functionName: 'globalBorrowCaps',
    args: [SHINRAI_CONTRACTS.MOCK_TOKEN0 as `0x${string}`],
    query: {
      retry: false,
      refetchOnWindowFocus: false
    }
  });

  const testContract = async (contractName: string, address: string) => {
    try {
      console.log(`Testing ${contractName} at ${address}`);

      // Simple existence check via RPC
      const response = await fetch('https://eth-sepolia.g.alchemy.com/v2/t7Oxw5b_OpDL6yQVWN70ZjxO6hTCaZeW', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          method: 'eth_getCode',
          params: [address, 'latest'],
          id: 1
        })
      });

      const result = await response.json();
      const hasCode = result.result && result.result !== '0x';

      setTestResults(prev => ({
        ...prev,
        [contractName]: {
          address,
          hasCode,
          codeLength: result.result ? result.result.length : 0
        }
      }));
    } catch (error) {
      setTestResults(prev => ({
        ...prev,
        [contractName]: { address, error: error instanceof Error ? error.message : String(error) }
      }));
    }
  };

  const runAllTests = async () => {
    await Promise.all([
      testContract('PoolManager', SHINRAI_CONTRACTS.POOL_MANAGER),
      testContract('LeverageHook', SHINRAI_CONTRACTS.LEVERAGE_HOOK),
      testContract('MarginRouter', SHINRAI_CONTRACTS.MARGIN_ROUTER),
      testContract('GlobalAssetLedger', SHINRAI_CONTRACTS.GLOBAL_ASSET_LEDGER),
    ]);
  };

  return (
    <div className="bg-card p-6 rounded-lg border">
      <h3 className="text-xl font-semibold mb-4">Sepolia Contract Tests</h3>

      <div className="space-y-4">
        <button
          onClick={runAllTests}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90"
        >
          Test All Contracts
        </button>

        {/* Contract read results */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div className="space-y-2">
            <h4 className="font-medium">Read Contract Results:</h4>
            <div className={`p-2 rounded ${poolManagerError ? 'bg-destructive/10' : 'bg-success/10'}`}>
              <strong>PoolManager.isUnlocked():</strong> {
                poolManagerError ? `Error: ${poolManagerError.message}` :
                isUnlocked !== undefined ? String(isUnlocked) : 'Loading...'
              }
            </div>
            <div className={`p-2 rounded ${marginRouterError ? 'bg-destructive/10' : 'bg-success/10'}`}>
              <strong>MarginRouter.maxGlobalLeverage():</strong> {
                marginRouterError ? `Error: ${marginRouterError.message}` :
                maxLeverage !== undefined ? String(maxLeverage) : 'Loading...'
              }
            </div>
            <div className={`p-2 rounded ${ledgerError ? 'bg-destructive/10' : 'bg-success/10'}`}>
              <strong>GlobalAssetLedger.globalBorrowCaps():</strong> {
                ledgerError ? `Error: ${ledgerError.message}` :
                globalBorrowCap !== undefined ? String(globalBorrowCap) : 'Loading...'
              }
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="font-medium">Contract Deployment Check:</h4>
            {Object.entries(testResults).map(([name, result]) => (
              <div key={name} className={`p-2 rounded text-xs ${result.hasCode ? 'bg-success/10' : 'bg-destructive/10'}`}>
                <strong>{name}:</strong><br/>
                {result.address}<br/>
                {result.error ? `Error: ${result.error}` :
                 result.hasCode ? `✅ Deployed (${result.codeLength} chars)` : '❌ No code found'}
              </div>
            ))}
          </div>
        </div>

        {/* Network Info */}
        <div className="mt-4 p-3 bg-muted rounded">
          <h4 className="font-medium mb-2">Network Configuration:</h4>
          <div className="text-xs space-y-1">
            <div>Chain ID: 11155111 (Sepolia)</div>
            <div>RPC: https://eth-sepolia.g.alchemy.com/v2/...</div>
            <div>Explorer: https://sepolia.etherscan.io</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContractTest;