# EigenLayer Middleware Knowledge Base

## Project Context
Building a verifiable polymarket using EigenLayer and Uniswap v4 hooks. This document captures understanding of EigenLayer middleware contracts for implementation.

## EigenLayer Middleware Architecture

### Core Purpose
EigenLayer middleware enables "Actively Validated Services" (AVSs) by providing infrastructure for:
- Operator registration and management
- Stake tracking and validation  
- Operator set coordination
- Slashing mechanisms for protocol security

### Key Contracts Overview

#### 1. ServiceManagerBase (`ServiceManagerBase.sol`)
- **Purpose**: Base contract for managing AVS services
- **Key Features**:
  - Integrates with AVSDirectory for operator registration
  - Handles rewards distribution via RewardsCoordinator
  - Manages allocation through AllocationManager
  - Provides pausing/access control functionality
- **Integration Point**: Main entry point for AVS-specific logic

#### 2. RegistryCoordinator (`RegistryCoordinator.sol`)
- **Purpose**: Central coordinator managing four registries
- **Managed Registries**:
  1. StakeRegistry - tracks operator stakes
  2. BLSApkRegistry - manages BLS public keys  
  3. IndexRegistry - maintains ordered operator lists
  4. SocketRegistry - stores operator connection info
- **Key Functions**: Operator registration/deregistration across all registries

#### 3. StakeRegistry (`StakeRegistry.sol`)
- **Purpose**: Tracks operator stakes across up to 256 quorums
- **Functionality**:
  - Operator stake tracking per quorum for block ranges
  - Total stake calculation per quorum
  - Minimum stake requirements per quorum
  - Stake updates and validations

#### 4. BLSApkRegistry (`BLSApkRegistry.sol`)
- **Purpose**: Manages BLS public keys and aggregations
- **Features**:
  - Individual operator BLS public key registration
  - Aggregate public key computation per quorum
  - Cryptographic verification for operator sets

#### 5. SlashingRegistryCoordinator (`SlashingRegistryCoordinator.sol`)
- **Purpose**: Extended coordinator with slashing capabilities
- **Features**: 
  - All RegistryCoordinator functionality
  - Slashing logic integration
  - Enhanced security mechanisms

## Implementation Strategy for Polymarket + Uniswap v4 Hooks

### Hook Integration Points

#### 1. **beforeSwap Hook**
```solidity
// Validate operator stake before allowing market participation
function beforeSwap(PoolKey calldata key, IPoolManager.SwapParams calldata params) 
    external returns (bytes4) {
    // Check operator registration via RegistryCoordinator
    // Validate minimum stake requirements via StakeRegistry
    // Verify operator is not slashed
}
```

#### 2. **afterSwap Hook** 
```solidity
// Update operator performance metrics post-swap
function afterSwap(PoolKey calldata key, IPoolManager.SwapParams calldata params) 
    external returns (bytes4) {
    // Record operator validation performance
    // Update reward calculations
    // Trigger slashing conditions if needed
}
```

#### 3. **beforeModifyPosition Hook**
```solidity
// Validate liquidity provider credentials
function beforeModifyPosition(PoolKey calldata key, IPoolManager.ModifyPositionParams calldata params) 
    external returns (bytes4) {
    // Check if LP is registered operator
    // Validate stake requirements for position size
}
```

### Polymarket Integration Architecture

#### 1. **Market Validation Service**
- Inherit from `ServiceManagerBase`
- Implement market outcome verification logic
- Integrate with oracle networks for price feeds
- Handle dispute resolution mechanisms

#### 2. **Operator Registration for Market Makers**
- Use `RegistryCoordinator` for market maker registration
- Set quorum-specific stake requirements via `StakeRegistry`
- Implement BLS signature aggregation for consensus

#### 3. **Slashing for Invalid Predictions**
- Extend `SlashingRegistryCoordinator` 
- Define slashing conditions for incorrect market outcomes
- Implement dispute resolution and appeal processes

### Key Benefits for Polymarket

1. **Decentralized Validation**: Operators stake to validate market outcomes
2. **Economic Security**: Slashing ensures honest behavior
3. **Composability**: Uniswap v4 hooks provide seamless DeFi integration
4. **Scalability**: Quorum-based validation enables efficient consensus

### Development Status
- Contracts are in testnet/beta phase
- Not fully audited yet
- Suitable for experimentation and testnet deployment
- Active development with 33+ contributors

## Next Steps
1. Design specific quorum structures for market types
2. Define slashing conditions for market manipulation
3. Implement hook-based operator validation
4. Create market outcome verification logic
5. Integrate with existing DeFi protocols via hooks

## File Locations
- Core contracts: `/mnt/d/atrium/Shinrai/lib/eigenlayer-middleware/src/`
- Interfaces: `/mnt/d/atrium/Shinrai/lib/eigenlayer-middleware/src/interfaces/`
- Libraries: `/mnt/d/atrium/Shinrai/lib/eigenlayer-middleware/src/libraries/`