# Shinrai Protocol Knowledge Base

## Overview
Shinrai is a leveraged trading protocol built on Uniswap V4 with EigenLayer validation. It enables users to open leveraged positions while ensuring security through decentralized operator validation.

## Architecture

### Core Components

1. **LeverageHook** - Uniswap V4 Hook Contract
2. **MarginRouter** - Entry point for leveraged trades
3. **GlobalAssetLedger** - Central accounting and risk management
4. **ILeverageValidator** - Interface for EigenLayer validation
5. **IEigenAssetVerifier** - Base interface for asset verification

---

## Contract Details

### 1. LeverageHook.sol

**Purpose**: Uniswap V4 hook that integrates with EigenLayer for leveraged trading validation

**Key Features**:
- Extends BaseHook for Uniswap V4 integration
- Validates leverage operations through EigenLayer operators
- Implements dynamic fees based on pool utilization
- Prevents price manipulation through operator consensus

**Hook Permissions**:
```solidity
beforeInitialize: false
afterInitialize: false
beforeRemoveLiquidity: true  // For leverage operations
afterRemoveLiquidity: true   // For dynamic fees
beforeSwap: true            // For swap validation
afterSwap: true             // For post-swap verification
```

**Key Constants**:
- `MAX_LEVERAGE = 1000` (10x leverage)
- `DYNAMIC_FEE_FLAG = 0x800000`
- `BASE_FUNDING_RATE = 100` (1%)

**Core Structs**:
- `LeverageRequest`: Contains trader, collateral, borrow amount, leverage ratio
- `PoolState`: Tracks utilization, liquidity, manipulation detection

**Main Functions**:
- `_beforeRemoveLiquidity()`: Validates leverage requests via EigenLayer
- `_afterRemoveLiquidity()`: Updates dynamic fees based on utilization
- `_beforeSwap()`: Verifies swap conditions and detects manipulation
- `_afterSwap()`: Validates final pool state

---

### 2. MarginRouter.sol

**Purpose**: Entry point for all leveraged trades with comprehensive validation

**Key Features**:
- Manages leverage position lifecycle (open/close/liquidate)
- Enforces global and pool-specific leverage caps
- Integrates with EigenLayer for position validation
- Emergency pause functionality
- Cross-pool exposure tracking

**Access Control**:
- Inherits from `Ownable` and `ReentrancyGuard`
- Emergency pause controls
- Pool authorization management

**Key State Variables**:
- `maxGlobalLeverage = 1000` (10x)
- `positionCounter`: Global position ID counter
- `emergencyPaused`: Emergency state flag

**Mappings**:
- `traderPositions`: User address → position IDs array
- `positions`: Position ID → position details
- `authorizedPools`: Pool ID → authorization status
- `poolLeverageCaps`: Pool-specific leverage limits

**Core Functions**:
- `openLeveragePosition()`: Creates new leveraged position
- `closeLeveragePosition()`: Closes existing position
- `getTraderPositions()`: Returns user's positions
- `checkPositionHealth()`: Validates position health
- `authorizePool()`: Admin function to authorize pools
- `setEmergencyPause()`: Emergency controls

**Validation Flow**:
1. Check leverage constraints
2. Transfer collateral from trader
3. Validate through EigenLayer operators
4. Check cross-pool exposure limits
5. Execute leverage operation via pool

---

### 3. GlobalAssetLedger.sol

**Purpose**: Central accounting system for tracking borrow balances, caps, and cross-pool exposure

**Key Features**:
- Authorizes borrow requests with EigenLayer validation
- Maintains global and pool-specific borrow caps
- Tracks user collateral and borrowed amounts
- Manages funding rates based on utilization
- Cross-pool exposure monitoring

**Access Control**:
- Inherits from `Ownable` and `ReentrancyGuard`
- `onlyAuthorizedRouter` modifier for router access
- Admin controls for caps and settings

**Key Mappings**:
- `globalBorrowCaps`: Token → global borrow limit
- `totalBorrowed`: Token → current global borrowed amount
- `poolBorrowCaps`: Pool ID → Token → pool borrow limit
- `poolBorrowed`: Pool ID → Token → current pool borrowed
- `userTotalBorrowed`: User → Token → total borrowed
- `userCollateral`: User → Token → deposited collateral
- `poolUtilizationRates`: Pool ID → utilization rate (basis points)
- `poolFundingRates`: Pool ID → funding rate (basis points/day)

**Core Structs**:
- `PositionData`: Complete position information
- `BorrowAuthorization`: Detailed authorization result
- `SystemMetrics`: Overall system health metrics

**Core Functions**:
- `authorizeBorrow()`: Main authorization function with EigenLayer validation
- `registerPosition()`: Records new position in ledger
- `repayBorrow()`: Processes borrow repayments
- `depositCollateral()` / `withdrawCollateral()`: Collateral management
- `updateFundingRate()`: Dynamic funding rate updates
- `getSystemMetrics()`: System-wide health overview

**Authorization Flow**:
1. Check global borrow caps
2. Check pool-specific caps
3. Validate through EigenLayer
4. Calculate utilization impact
5. Process authorization if approved

---

### 4. ILeverageValidator.sol (Interface)

**Purpose**: Extended interface for leverage validation using EigenLayer

**Inheritance**: Extends `IEigenAssetVerifier`

**Key Structs**:
- `LeveragePosition`: Complete position data structure
- `BorrowValidation`: Borrow request validation result
- `BorrowAuthorization`: Authorization with caps and requirements
- `PoolUtilization`: Pool utilization and capacity data
- `ManipulationCheck`: Price manipulation detection results

**Core Function Categories**:

**Leverage Validation**:
- `validateLeveragePosition()`: Validates position with operator signatures
- `validateBorrowRequest()`: Validates borrow against caps and consensus
- `checkPoolManipulation()`: Detects price/volume manipulation
- `getPoolUtilization()`: Returns current pool utilization

**Cross-Pool Exposure**:
- `checkCrossPoolExposure()`: Validates exposure limits
- `getTraderExposure()`: Returns trader's total exposure

**Liquidation**:
- `checkLiquidation()`: Determines if position should be liquidated

**Funding Rates**:
- `calculateFundingRate()`: Dynamic funding rate calculation
- `updateFundingRate()`: Updates pool funding rates

**Emergency Functions**:
- `emergencyPausePool()`: Emergency pool pause
- `emergencyLiquidate()`: Emergency position liquidation

---

### 5. IEigenAssetVerifier.sol (Interface)

**Purpose**: Base interface for EigenLayer-powered asset verification

**Key Structs**:
- `OperatorInfo`: Operator registration and stake data
- `MarketValidation`: Market validation parameters
- `SwapValidation`: Swap authorization details

**Core Function Categories**:

**Swap Verification**:
- `verifySwap()`: Core swap validation function
- `getSwapValidation()`: Detailed swap validation info

**Operator Management**:
- `registerOperator()` / `deregisterOperator()`: Operator lifecycle
- `getOperatorInfo()`: Operator details and status
- `checkStakeRequirement()`: Validates operator stake

**Market Management**:
- `createMarket()`: Creates new prediction market
- `submitMarketValidation()`: Validates market outcomes
- `getMarketValidation()`: Market validation details

**Slashing Functions**:
- `slashOperator()`: Penalizes incorrect validation
- `isOperatorSlashed()`: Checks operator slash status

---

## Key Integration Points

### Uniswap V4 Integration
- **Hook System**: LeverageHook integrates with Uniswap V4's hook architecture
- **Dynamic Fees**: Utilization-based fee adjustments
- **Liquidity Operations**: Leverage operations through liquidity modifications

### EigenLayer Integration
- **Operator Validation**: All critical operations validated by EigenLayer operators
- **Slashing Conditions**: Operators slashed for incorrect validations
- **Consensus Mechanisms**: Multi-operator consensus for security

### Risk Management
- **Global Caps**: System-wide borrow limits per token
- **Pool Caps**: Pool-specific borrow limits
- **Cross-Pool Exposure**: Prevents excessive concentration risk
- **Health Factors**: Continuous position health monitoring
- **Emergency Controls**: Pause mechanisms for crisis situations

---

## Key Constants and Limits

### Leverage Limits
- Maximum Global Leverage: 10x (1000 basis points)
- Pool-specific leverage caps (configurable)
- Minimum leverage: 1x (100 basis points)

### Utilization Thresholds
- Maximum utilization: 95% (9500 basis points)
- Dynamic fee triggers: 60%, 80% utilization

### Funding Rates
- Base funding rate: 1% (100 basis points)
- Dynamic adjustments based on utilization

---

## Event System

### LeverageHook Events
- `LeveragePositionOpened`: New position created
- `PoolStateVerified`: Pool health verification
- `DynamicFeeUpdated`: Fee adjustments

### MarginRouter Events
- `LeveragePositionOpened` / `LeveragePositionClosed`: Position lifecycle
- `PoolAuthorized`: Pool authorization changes
- `EmergencyPauseToggled`: Emergency state changes

### GlobalAssetLedger Events
- `BorrowAuthorized` / `BorrowRepaid`: Borrow lifecycle
- `CollateralDeposited` / `CollateralWithdrawn`: Collateral management
- `FundingRateUpdated`: Funding rate changes
- `PositionRegistered`: Position registration

---

## Testing Infrastructure

### Test Structure
- Located in `/test/LeverageValidationTest.t.sol`
- Inherits from Forge's `Test` and Uniswap's `Deployers`
- Comprehensive test coverage for all contract interactions

### Mock Contracts
- `MockLeverageValidator`: Simulates EigenLayer validation
- Test utilities for position lifecycle testing
- Hook deployment and integration testing

### Test Categories
1. Position lifecycle tests (open/close/liquidate)
2. Borrow authorization tests
3. Hook validation tests
4. Cross-pool exposure tests
5. Emergency function tests
6. Funding rate mechanism tests

---

## Security Considerations

### Access Controls
- Owner-only functions for critical parameters
- Router authorization for asset ledger operations
- Emergency pause mechanisms

### Validation Layers
1. Smart contract validation (caps, limits, health)
2. EigenLayer operator consensus
3. Pool state verification
4. Cross-pool exposure checks

### Risk Mitigation
- Reentrancy guards on all external calls
- SafeERC20 for token interactions
- Overflow/underflow protection
- Price manipulation detection

---

## Deployment Notes

### Hook Deployment
- Must be deployed to specific address with correct permission flags
- Uses `deployCodeTo` pattern for deterministic addresses
- Hook address encodes permissions: `BEFORE_REMOVE_LIQUIDITY_FLAG | AFTER_REMOVE_LIQUIDITY_FLAG | BEFORE_SWAP_FLAG | AFTER_SWAP_FLAG`

### Contract Dependencies
1. Deploy MockLeverageValidator (for testing)
2. Deploy LeverageHook with proper flags
3. Deploy GlobalAssetLedger
4. Deploy MarginRouter
5. Configure authorizations and caps
6. Initialize pools with hook integration

### Configuration Steps
1. Set global borrow caps
2. Set pool-specific caps
3. Authorize pools for leverage trading
4. Connect MarginRouter to GlobalAssetLedger
5. Configure funding rate parameters

This knowledge base provides a comprehensive reference for understanding and working with the Shinrai protocol contracts.