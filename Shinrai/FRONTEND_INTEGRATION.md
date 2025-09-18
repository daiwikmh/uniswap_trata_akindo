# Shinrai Protocol - Frontend Integration Guide

## 🏗️ Architecture Overview

The Shinrai Protocol consists of several key contracts that work together to enable leveraged trading on Uniswap V4:

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │    │  MarginRouter    │    │ LeverageHook    │
│                 │───▶│                  │───▶│                 │
│ User Interface  │    │ Entry Point      │    │ Uniswap V4 Hook │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐    ┌─────────────────┐
                       │GlobalAssetLedger │    │LeverageValidator│
                       │                  │───▶│                 │
                       │ Asset Management │    │ EigenLayer AVS  │
                       └──────────────────┘    └─────────────────┘
```

## 📄 Contract Addresses

After deployment, update these addresses in your frontend:

```typescript
// Contract Addresses (Update after deployment)
export const CONTRACTS = {
  // Core Protocol Contracts
  MARGIN_ROUTER: "0x...", // Primary entry point for users
  LEVERAGE_HOOK: "0x...", // Uniswap V4 Hook for leverage
  GLOBAL_ASSET_LEDGER: "0x...", // Asset tracking and limits
  LEVERAGE_VALIDATOR: "0x...", // EigenLayer AVS validator
  POOL_MANAGER: "0x...", // Uniswap V4 Pool Manager

  // Network Configuration
  CHAIN_ID: 17000, // Holesky testnet
  RPC_URL: "https://holesky.drpc.org"
};
```

## 🎯 Frontend Functions by Contract

### 1. MarginRouter - Primary User Interface

**Main Entry Point for all user interactions**

#### Open Leveraged Position
```typescript
// Function: openLeveragedPosition
interface OpenPositionParams {
  poolKey: PoolKey;
  trader: string;
  collateralToken: string;
  borrowToken: string;
  collateralAmount: bigint;
  borrowAmount: bigint;
  leverage: number; // 100-1000 (1x-10x)
  slippageTolerance: number; // in basis points
}

async function openLeveragedPosition(params: OpenPositionParams) {
  const tx = await marginRouter.openLeveragedPosition(
    params.poolKey,
    params.trader,
    params.collateralToken,
    params.borrowToken,
    params.collateralAmount,
    params.borrowAmount,
    params.leverage,
    params.slippageTolerance
  );
  return tx;
}
```

#### Close Position
```typescript
// Function: closeLeveragedPosition
async function closeLeveragedPosition(
  positionId: string,
  closePercentage: number // 1-100
) {
  const tx = await marginRouter.closeLeveragedPosition(
    positionId,
    closePercentage * 100 // Convert to basis points
  );
  return tx;
}
```

#### Add Collateral
```typescript
async function addCollateral(positionId: string, amount: bigint) {
  const tx = await marginRouter.addCollateral(positionId, amount);
  return tx;
}
```

#### Get Position Details
```typescript
async function getPosition(positionId: string) {
  const position = await marginRouter.positions(positionId);
  return {
    trader: position.trader,
    collateralToken: position.collateralToken,
    borrowToken: position.borrowToken,
    collateralAmount: position.collateralAmount,
    borrowAmount: position.borrowAmount,
    leverage: position.leverage,
    healthFactor: position.healthFactor,
    isLiquidatable: position.healthFactor < 1100 // 110%
  };
}
```

### 2. GlobalAssetLedger - Portfolio & Risk Management

#### Get User Portfolio
```typescript
async function getUserPortfolio(userAddress: string) {
  const portfolio = await globalAssetLedger.getUserPortfolio(userAddress);
  return {
    totalCollateral: portfolio.totalCollateral,
    totalBorrowed: portfolio.totalBorrowed,
    totalExposure: portfolio.totalExposure,
    avgLeverage: portfolio.avgLeverage,
    positions: portfolio.positions
  };
}
```

#### Get Asset Limits
```typescript
async function getAssetLimits(tokenAddress: string) {
  const globalCap = await globalAssetLedger.globalBorrowCaps(tokenAddress);
  const globalBorrowed = await globalAssetLedger.globalBorrowedAmounts(tokenAddress);

  return {
    globalBorrowCap: globalCap,
    globalBorrowed: globalBorrowed,
    availableToLend: globalCap - globalBorrowed,
    utilizationRate: (globalBorrowed * 10000n) / globalCap // basis points
  };
}
```

### 3. LeverageValidator (EigenLayer AVS) - Risk Validation

#### Validate Position Before Opening
```typescript
async function validatePosition(positionParams: any) {
  const validation = await leverageValidator.validateLeveragePosition(
    positionParams,
    [] // operator signatures
  );

  return {
    isValid: validation.isValid,
    reason: validation.reason,
    maxLeverage: validation.maxLeverage,
    requiredCollateral: validation.requiredCollateral
  };
}
```

#### Get Pool Utilization
```typescript
async function getPoolUtilization(poolId: string) {
  const utilization = await leverageValidator.getPoolUtilization(poolId);

  return {
    totalLiquidity: utilization.totalLiquidity,
    borrowedAmount: utilization.borrowedAmount,
    utilizationRate: utilization.utilizationRate,
    fundingRate: utilization.fundingRate,
    isAtCapacity: utilization.isAtCapacity
  };
}
```

## 🎮 Complete Frontend Integration Example

### Trading Interface Component
```typescript
import { useState } from 'react';
import { useAccount, useContractWrite } from 'wagmi';

function LeverageTradingInterface() {
  const { address } = useAccount();
  const [position, setPosition] = useState({
    collateralAmount: '',
    leverage: 200, // 2x
    token0: 'ETH',
    token1: 'USDC'
  });

  // 1. Open Position
  const openPosition = async () => {
    try {
      // Validate first
      const validation = await validatePosition({
        trader: address,
        collateralAmount: parseEther(position.collateralAmount),
        leverage: position.leverage
      });

      if (!validation.isValid) {
        alert(`Position invalid: ${validation.reason}`);
        return;
      }

      // Execute trade
      const tx = await openLeveragedPosition({
        poolKey: getPoolKey(position.token0, position.token1),
        trader: address,
        collateralAmount: parseEther(position.collateralAmount),
        leverage: position.leverage
      });

      console.log('Position opened:', tx.hash);
    } catch (error) {
      console.error('Failed to open position:', error);
    }
  };

  // 2. Get User Positions
  const [userPositions, setUserPositions] = useState([]);

  useEffect(() => {
    async function loadPositions() {
      if (!address) return;

      const portfolio = await getUserPortfolio(address);
      setUserPositions(portfolio.positions);
    }

    loadPositions();
  }, [address]);

  return (
    <div className="leverage-trading">
      {/* Trading Form */}
      <div className="trading-form">
        <input
          placeholder="Collateral Amount"
          value={position.collateralAmount}
          onChange={(e) => setPosition({...position, collateralAmount: e.target.value})}
        />

        <select
          value={position.leverage}
          onChange={(e) => setPosition({...position, leverage: Number(e.target.value)})}
        >
          <option value={200}>2x Leverage</option>
          <option value={500}>5x Leverage</option>
          <option value={1000}>10x Leverage</option>
        </select>

        <button onClick={openPosition}>
          Open Leveraged Position
        </button>
      </div>

      {/* User Positions */}
      <div className="positions-list">
        <h3>Your Positions</h3>
        {userPositions.map(pos => (
          <div key={pos.id} className="position-card">
            <p>Leverage: {pos.leverage/100}x</p>
            <p>Health: {pos.healthFactor/100}%</p>
            <p>P&L: ${pos.unrealizedPnl}</p>
            <button onClick={() => closeLeveragedPosition(pos.id, 100)}>
              Close Position
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## ⚙️ EigenLayer Operator Integration

### For Operators Running Validation Nodes

#### 1. Operator Registration
```bash
# Register as EigenLayer operator
cast send $DELEGATION_MANAGER "registerAsOperator(address,uint32,string)" \
  $NULL_ADDRESS 0 "" \
  --private-key $OPERATOR_PRIVATE_KEY \
  --rpc-url https://holesky.drpc.org

# Register with Shinrai AVS
cast send $LEVERAGE_VALIDATOR "registerOperator(address,uint8[],string)" \
  $OPERATOR_ADDRESS [] "" \
  --private-key $OPERATOR_PRIVATE_KEY \
  --rpc-url https://holesky.drpc.org
```

#### 2. Validation Service (Node.js/Python)
```typescript
// Operator validation service
class ShinraiOperator {
  async validatePosition(positionData: any): Promise<ValidationResult> {
    // Custom risk validation logic
    const riskScore = await this.calculateRiskScore(positionData);
    const priceData = await this.fetchPriceFeeds();
    const liquidityCheck = await this.checkLiquidity(positionData.poolId);

    return {
      isValid: riskScore < 80 && liquidityCheck.sufficient,
      reason: riskScore >= 80 ? "High risk detected" : "Approved",
      signature: await this.signValidation(positionData)
    };
  }

  async submitValidation(positionId: string, validation: ValidationResult) {
    // Submit validation to the AVS
    const tx = await leverageValidator.submitMarketValidation(
      positionId,
      validation.isValid,
      validation.signature
    );

    return tx;
  }
}
```

## 🔍 Monitoring & Analytics

### Real-time Data Feeds
```typescript
// WebSocket or polling for real-time updates
function useProtocolMetrics() {
  const [metrics, setMetrics] = useState({
    totalValueLocked: 0,
    totalBorrowed: 0,
    averageLeverage: 0,
    activePositions: 0,
    liquidations24h: 0
  });

  useEffect(() => {
    const interval = setInterval(async () => {
      // Fetch protocol metrics
      const tvl = await getTotalValueLocked();
      const borrowed = await getTotalBorrowed();
      const positions = await getActivePositionsCount();

      setMetrics({
        totalValueLocked: tvl,
        totalBorrowed: borrowed,
        averageLeverage: tvl > 0 ? borrowed / tvl : 0,
        activePositions: positions,
        liquidations24h: await getLiquidations24h()
      });
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  return metrics;
}
```

## 🚨 Risk Management

### Liquidation Monitoring
```typescript
async function monitorLiquidations() {
  // Listen for positions approaching liquidation
  const positions = await getPositionsNearLiquidation(115); // 115% health factor

  positions.forEach(position => {
    // Notify user
    notifyUser(position.trader, {
      type: 'liquidation_warning',
      message: `Position ${position.id} health factor: ${position.healthFactor}%`,
      action: 'Add collateral or close position'
    });
  });
}
```

## 📊 Integration Checklist

- [ ] Deploy all contracts to Holesky testnet
- [ ] Update contract addresses in frontend
- [ ] Implement position management UI
- [ ] Add risk monitoring and alerts
- [ ] Set up EigenLayer operator validation
- [ ] Test complete user flow
- [ ] Add error handling and edge cases
- [ ] Implement real-time price feeds
- [ ] Add liquidation protection features
- [ ] Setup monitoring and analytics

## 🔗 Useful Links

- **Uniswap V4 Docs**: https://docs.uniswap.org/contracts/v4/overview
- **EigenLayer Docs**: https://docs.eigenlayer.xyz/
- **Holesky Testnet**: https://holesky.etherscan.io/
- **Contract Verification**: Use `--verify` flag in forge commands

---

*This guide covers the complete integration flow. Update contract addresses after deployment and customize the UI/UX based on your specific requirements.*