# LeverageHook - Uniswap V4 Leverage Trading Integration

## Overview

The LeverageHook is a specialized Uniswap V4 hook that enables leveraged trading with EigenLayer validation. It integrates seamlessly with Uniswap V4 pools to provide secure, validated leverage operations while maintaining compatibility with the standard AMM infrastructure.

## 🚀 Key Features

- **✅ Uniswap V4 Integration**: Full compatibility with Uniswap V4 PoolManager
- **✅ EigenLayer Validation**: Operator-validated leverage positions
- **✅ Dynamic Fee Management**: Utilization-based fee adjustments
- **✅ Price Manipulation Detection**: Real-time monitoring and protection
- **✅ Cross-Pool Exposure Limits**: Portfolio-wide risk management
- **✅ Emergency Controls**: Protocol-level safety mechanisms

## 📋 Contract Details

### Contract Address
- **Network**: Sepolia Testnet
- **Address**: `0x220c3B7316280D991fB501060EfB58D1819743c0`
- **Salt**: `0x00000000000000000000000000000000000000000000000000000000000009d4`

### Hook Permissions

```solidity
Hooks.Permissions({
    beforeInitialize: false,
    afterInitialize: false,
    beforeAddLiquidity: false,
    beforeRemoveLiquidity: true,  // ✅ Leverage operations
    afterAddLiquidity: false,
    afterRemoveLiquidity: true,   // ✅ Dynamic fees
    beforeSwap: true,             // ✅ Price validation
    afterSwap: true,              // ✅ State verification
    beforeDonate: false,
    afterDonate: false,
    beforeSwapReturnDelta: false,
    afterSwapReturnDelta: false,
    afterAddLiquidityReturnDelta: false,
    afterRemoveLiquidityReturnDelta: false
});
```

## 🏗️ Architecture

### Core Components

1. **LeverageRequest Struct**
   ```solidity
   struct LeverageRequest {
       address trader;
       address collateralToken;
       uint256 collateralAmount;
       uint256 borrowAmount;
       uint256 leverageRatio;
       bool isLongPosition;
       bytes32 positionId;
   }
   ```

2. **PoolState Monitoring**
   ```solidity
   struct PoolState {
       uint256 utilizationRate;
       uint256 availableLiquidity;
       bool manipulationDetected;
       uint256 lastPriceUpdate;
   }
   ```

3. **Dynamic Fee System**
   - Base fee: 0.05% (500 in pip units)
   - High utilization (>80%): 0.2% (2000 pip)
   - Medium utilization (>60%): 0.1% (1000 pip)
   - Normal utilization (<60%): 0.05% (500 pip)

## 🔧 Hook Implementation

### Before Remove Liquidity Hook
**Purpose**: Validates leverage requests through EigenLayer operators

```solidity
function _beforeRemoveLiquidity(
    address sender,
    PoolKey calldata key,
    ModifyLiquidityParams calldata params,
    bytes calldata hookData
) internal override returns (bytes4)
```

**Validation Checks**:
- ✅ Leverage ratio ≤ MAX_LEVERAGE (1000 = 10x)
- ✅ Collateral amount > 0
- ✅ Position ID generation
- ✅ Event emission for tracking

### After Remove Liquidity Hook
**Purpose**: Updates dynamic fees based on utilization

```solidity
function _afterRemoveLiquidity(
    address sender,
    PoolKey calldata key,
    ModifyLiquidityParams calldata params,
    BalanceDelta delta,
    BalanceDelta hookDelta,
    bytes calldata hookData
) internal override returns (bytes4, BalanceDelta)
```

**Dynamic Fee Logic**:
- Calculates post-operation utilization rate
- Updates fee based on utilization thresholds
- Emits fee update events

### Before Swap Hook
**Purpose**: Validates swap operations and detects manipulation

```solidity
function _beforeSwap(
    address sender,
    PoolKey calldata key,
    SwapParams calldata params,
    bytes calldata hookData
) internal override returns (bytes4, BeforeSwapDelta, uint24)
```

**Validation Steps**:
- ✅ Pool state health check
- ✅ Manipulation detection
- ✅ Rate limiting (configurable)
- ✅ Market ID validation

### After Swap Hook
**Purpose**: Verifies final state and emits monitoring events

```solidity
function _afterSwap(
    address sender,
    PoolKey calldata key,
    SwapParams calldata params,
    BalanceDelta delta,
    bytes calldata hookData
) internal override returns (bytes4, int128)
```

## 🧪 Testing Suite

### Test Coverage

The LeverageHook has comprehensive test coverage through `LeverageValidationTest.t.sol`:

#### ✅ Leverage Position Tests
- `testOpenLeveragePositionSuccess()` - Valid position creation
- `testOpenLeveragePositionExceedsLeverage()` - Leverage limit enforcement
- `testOpenLeveragePositionInvalidPool()` - Pool authorization checks
- `testOpenLeveragePositionInsufficientCollateral()` - Collateral validation

#### ✅ Borrow Authorization Tests
- `testBorrowAuthorizationSuccess()` - Valid borrow requests
- `testBorrowAuthorizationExceedsGlobalCap()` - Global limit enforcement
- `testBorrowAuthorizationExceedsPoolCap()` - Pool-specific limits
- `testBorrowAuthorizationEigenLayerReject()` - Operator consensus requirements

#### ✅ Cross-Pool Exposure Tests
- `testCrossPoolExposureValidation()` - Portfolio risk management
- Risk aggregation across multiple pools
- Exposure limit enforcement

#### ✅ Liquidation Tests
- `testPositionLiquidation()` - Health factor monitoring
- Automatic liquidation triggers
- Position cleanup verification

#### ✅ Funding Rate Tests
- `testFundingRateUpdate()` - Dynamic rate calculations
- Utilization-based adjustments
- Event emission verification

#### ✅ Emergency Function Tests
- `testEmergencyPause()` - Protocol pause functionality
- Owner-only access controls
- Operation blocking during emergencies

### Running Tests

```bash
# Run all LeverageHook tests
forge test --match-contract LeverageValidationTest -vvv

# Run specific test category
forge test --match-test testOpenLeveragePosition -vvv

# Run with coverage
forge coverage --match-contract LeverageValidationTest
```

## 🎯 Use Cases

### 1. Leveraged Long Position
```solidity
// Trader deposits 100 USDC as collateral
// Hook validates 3x leverage (300 USDC position)
// Borrows 200 DAI from pool
// Swaps DAI → USDC with borrowed amount
```

### 2. Leveraged Short Position
```solidity
// Trader deposits 100 DAI as collateral
// Hook validates 3x leverage (300 DAI position)
// Borrows 200 USDC from pool
// Swaps USDC → DAI with borrowed amount
```

### 3. Dynamic Fee Adjustment
```solidity
// Pool utilization = 85% (high)
// Hook calculates new fee = 0.2%
// Updates pool fee through PoolManager
// Incentivizes rebalancing
```

### 4. Risk Management
```solidity
// EigenLayer operators validate:
// - Position health factors
// - Cross-pool exposure limits
// - Price manipulation detection
// - Liquidation thresholds
```

## 🔗 Integration Points

### MarginRouter Integration
The hook works with MarginRouter for position management:
```solidity
bytes32 positionId = marginRouter.openLeveragePosition(
    poolKey,
    collateralToken,
    collateralAmount,
    borrowAmount,
    leverageRatio,
    isLongPosition
);
```

### GlobalAssetLedger Integration
Borrow authorization through the ledger:
```solidity
BorrowAuthorization memory auth = globalAssetLedger.authorizeBorrow(
    poolId,
    trader,
    borrowToken,
    borrowAmount,
    collateralToken,
    collateralAmount
);
```

### EigenLayer Integration
Validation through registered operators:
```solidity
(bool isValid, string memory reason) = leverageValidator.validateLeveragePosition(
    leveragePosition,
    operatorSignatures
);
```

## 📊 Events

### LeveragePositionOpened
```solidity
event LeveragePositionOpened(
    address indexed trader,
    bytes32 indexed positionId,
    uint256 collateral,
    uint256 borrowed,
    uint256 leverage
);
```

### PoolStateVerified
```solidity
event PoolStateVerified(
    bytes32 indexed poolId,
    uint256 utilizationRate,
    bool isHealthy
);
```

### DynamicFeeUpdated
```solidity
event DynamicFeeUpdated(
    bytes32 indexed poolId,
    uint24 newFee,
    uint256 utilizationRate
);
```

## ⚙️ Configuration

### Constants
```solidity
uint24 public constant DYNAMIC_FEE_FLAG = 0x800000;  // Signals dynamic fees
uint256 public constant MAX_LEVERAGE = 1000;         // 10x leverage max
uint256 public constant BASE_FUNDING_RATE = 100;     // 1% base rate
```

### Dependencies
- **Uniswap V4 Core**: Pool management and AMM functionality
- **V4 Periphery**: Base hook implementation
- **EigenLayer**: Operator validation infrastructure
- **Solmate**: Optimized contract utilities

## 🔐 Security Features

### Access Controls
- Owner-only emergency functions
- Operator-validated position creation
- Pool authorization requirements

### Risk Management
- Maximum leverage limits (10x)
- Cross-pool exposure monitoring
- Real-time health factor tracking
- Automated liquidation triggers

### Price Protection
- Manipulation detection algorithms
- Operator consensus requirements
- Swap validation hooks
- Rate limiting capabilities

## 🚀 Deployment

### Prerequisites
```bash
# Install dependencies
forge install

# Set environment variables
cp .env.example .env
# Edit .env with your configuration
```

### Deploy Hook
```bash
# Mine hook address with proper flags
forge script script/00_MineHookAddress.s.sol

# Deploy with mined salt
forge script script/01_DeployCore.s.sol --broadcast --verify
```

### Verify Deployment
```bash
# Check hook permissions
cast call $LEVERAGE_HOOK_ADDRESS "getHookPermissions()" --rpc-url $RPC_URL

# Verify integration
forge test --match-contract LeverageValidationTest
```

## 📈 Future Enhancements

### Planned Features
- [ ] Multi-chain deployment support
- [ ] Advanced fee models (time-based, volatility-adjusted)
- [ ] Integration with additional price oracles
- [ ] Automated market maker for leverage positions
- [ ] Insurance fund integration
- [ ] Flash loan liquidations

### Optimization Opportunities
- [ ] Gas optimization for hook operations
- [ ] Batch processing for multiple positions
- [ ] Advanced caching mechanisms
- [ ] MEV protection enhancements

## 📞 Support

### Documentation
- [Uniswap V4 Documentation](https://docs.uniswap.org/sdk/v4/overview)
- [EigenLayer Developer Docs](https://docs.eigenlayer.xyz/)
- [Shinrai Protocol Guide](../README.md)

### Community
- GitHub Issues: Report bugs and feature requests
- Discord: Join the Shinrai community
- Twitter: Follow [@ShinraiProtocol](https://twitter.com/shinraiprotocol)

---

*Built with ❤️ for the DeFi ecosystem by the Shinrai team*