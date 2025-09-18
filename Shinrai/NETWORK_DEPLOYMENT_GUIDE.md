# Shinrai Protocol - Network Deployment Guide

This guide covers deploying Shinrai Protocol to Holesky testnet using CREATE2 for deterministic hook addresses.

## Overview

The deployment process has been updated to use CREATE2 for proper hook address deployment as required by Uniswap V4. This ensures hook addresses match their permission flags for network deployments.

## Prerequisites

1. **Funded Accounts**: Ensure your deployer and operator accounts have sufficient Holesky ETH
2. **Environment Setup**: Configure your `.env` file with proper keys and network settings
3. **RPC Access**: Reliable Holesky RPC endpoint (default: `https://ethereum-holesky-rpc.publicnode.com`)

## Deployment Steps

### Step 0: Mine Hook Address (Recommended)

**Purpose**: Pre-compute the hook salt for faster deployment

```bash
# Mine hook address (this may take several minutes)
forge script script/00_MineHookAddress.s.sol --rpc-url $RPC_URL

# The script will output a salt like:
# LEVERAGE_HOOK_SALT=0x1234567890abcdef...

# Add this to your .env file:
echo "LEVERAGE_HOOK_SALT=0x1234567890abcdef..." >> .env
```

**Benefits**:
- Faster deployment (no mining during deployment)
- Deterministic hook address
- Can verify address before deployment

### Step 1: Deploy Core Contracts

**Purpose**: Deploy all core protocol contracts including CREATE2 infrastructure

```bash
# Deploy core contracts with CREATE2 hook deployment
forge script script/01_DeployCore.s.sol:DeployCore \
  --rpc-url $RPC_URL \
  --broadcast \
  --verify

# Expected output:
# 1. CREATE2 Deployer
# 2. Hook Miner utility
# 3. PoolManager
# 4. MockLeverageValidator
# 5. LeverageHook (using CREATE2)
# 6. GlobalAssetLedger
# 7. MarginRouter
```

**What gets deployed**:
- `HookMiner`: Utility for address mining
- `PoolManager`: Uniswap V4 pool manager (with protocol owner)
- `MockLeverageValidator`: EigenLayer AVS implementation
- `LeverageHook`: Leverage trading hook (CREATE2 deployed using standard deployer)
- `GlobalAssetLedger`: Cross-pool exposure tracking
- `MarginRouter`: Main trading interface

### Step 2: Register Operators

**Purpose**: Register operators with EigenLayer DelegationManager and Shinrai AVS

```bash
# Register operators with EigenLayer
forge script script/02_RegisterOperators.s.sol:RegisterOperators \
  --rpc-url $RPC_URL \
  --broadcast

# This will:
# 1. Register with EigenLayer DelegationManager
# 2. Create AVS registration signatures
# 3. Register with Shinrai LeverageValidator
```

### Step 3: Configure Protocol

**Purpose**: Set up protocol parameters, pool authorizations, and limits

```bash
# Configure protocol parameters
forge script script/03_ConfigureProtocol.s.sol:ConfigureProtocol \
  --rpc-url $RPC_URL \
  --broadcast

# This will:
# 1. Authorize MarginRouter with GlobalAssetLedger
# 2. Set global and pool-specific borrow caps
# 3. Configure leverage limits
# 4. Authorize mock pools for trading
```

### Step 4: Test Integration

**Purpose**: Validate deployment with integration tests

```bash
# Run integration tests
forge script script/04_TestIntegration.s.sol:TestIntegration \
  --rpc-url $RPC_URL \
  --broadcast

# This will:
# 1. Deploy test tokens
# 2. Test operator validation
# 3. Test borrow authorization
# 4. Test position management
# 5. Test emergency functions
```

## Key Deployment Features

### CREATE2 Hook Deployment

- **Standard Foundry Pattern**: Uses CREATE2_DEPLOYER (0x4e59b44847b379578588920ca78fbf26c0b4956c)
- **Deterministic Addresses**: Hook addresses are computed deterministically
- **Permission Validation**: Addresses automatically match required permission flags
- **Mining Support**: Pre-compute salts for faster deployment
- **Network Compatible**: Works on any network (local, testnet, mainnet)

### Hook Permission Flags

LeverageHook requires these specific flags:
```solidity
uint160 flags = uint160(
    Hooks.BEFORE_REMOVE_LIQUIDITY_FLAG |
    Hooks.AFTER_REMOVE_LIQUIDITY_FLAG |
    Hooks.BEFORE_SWAP_FLAG |
    Hooks.AFTER_SWAP_FLAG
);
```

### Environment Configuration

The `.env` file now includes:

```bash
# CREATE2 Configuration
LEVERAGE_HOOK_SALT=0x...  # Pre-computed salt for hook deployment

# Network Settings
RPC_URL=https://ethereum-holesky-rpc.publicnode.com

# Contract Addresses (auto-populated after deployment)
CREATE2_DEPLOYER_ADDRESS=
HOOK_MINER_ADDRESS=
LEVERAGE_HOOK_ADDRESS=
# ... other addresses
```

### Hook Address Mining

The mining process finds a salt that produces a hook address with the correct permission flags:

```solidity
// Required flags for LeverageHook
uint160 requiredFlags =
    BEFORE_REMOVE_LIQUIDITY_FLAG |
    AFTER_REMOVE_LIQUIDITY_FLAG |
    BEFORE_SWAP_FLAG |
    AFTER_SWAP_FLAG;
```

## Network-Specific Considerations

### Holesky Testnet

- **EigenLayer Contracts**: Using official Holesky deployments
  - AVS Directory: `0x055733000064333CaDDbC92763c58BF0192fFeBf`
  - Delegation Manager: `0xA44151489861Fe9e3055d95adC98FbD462B948e7`
- **Gas Optimization**: CREATE2 mining can be expensive, pre-mine locally
- **Verification**: All contracts are verified on Etherscan automatically

### Local Testing vs Network Deployment

| Feature | Local Testing | Network Deployment |
|---------|---------------|-------------------|
| Hook Deployment | `deployCodeTo` | CREATE2 with mining |
| Address Mining | Not needed | Required for valid hooks |
| Gas Costs | Simulated | Real ETH required |
| Verification | Not applicable | Automatic via `--verify` |

## Troubleshooting

### Common Issues

1. **Hook Deployment Fails**
   ```bash
   Error: Hook address does not match required permissions
   ```
   **Solution**: Ensure LEVERAGE_HOOK_SALT is properly mined and set in .env

2. **Mining Takes Too Long**
   ```bash
   # Run mining on a powerful machine or pre-computed environment
   # Consider using multiple parallel processes
   ```

3. **RPC Rate Limits**
   ```bash
   # Use a dedicated RPC endpoint
   # Add delays between transactions
   ```

4. **Insufficient Gas**
   ```bash
   # Increase gas limit in forge commands
   --gas-limit 10000000
   ```

### Recovery Commands

```bash
# Check deployment status
forge script script/01_DeployCore.s.sol --rpc-url $RPC_URL --dry-run

# Verify specific contract
forge verify-contract <ADDRESS> <CONTRACT> --etherscan-api-key $ETHERSCAN_API_KEY

# Re-run specific deployment step
forge script script/02_RegisterOperators.s.sol --rpc-url $RPC_URL --broadcast --resume
```

## Post-Deployment

After successful deployment:

1. **Save Contract Addresses**: All addresses are saved to `deployed_addresses.txt`
2. **Update Frontend**: Use addresses for frontend integration
3. **Monitor Operations**: Set up monitoring for operator consensus
4. **Test Trading**: Execute test trades to validate functionality

## Security Considerations

- **Private Keys**: Never commit real private keys to version control
- **Address Verification**: Always verify deployed contract addresses
- **Permission Validation**: Ensure hook addresses match expected permissions
- **Operator Security**: Secure operator keys and infrastructure

## Next Steps

1. **Frontend Integration**: Connect frontend to deployed contracts
2. **Operator Setup**: Configure operator infrastructure for validation
3. **Pool Creation**: Create real Uniswap V4 pools for trading
4. **Liquidity Provision**: Add initial liquidity to trading pools
5. **Monitoring**: Set up alerts and monitoring for protocol operations

---

For questions or issues, refer to the [Uniswap V4 Hook Deployment Guide](https://docs.uniswap.org/contracts/v4/guides/hooks/hook-deployment) and [OpenZeppelin CREATE2 Documentation](https://docs.openzeppelin.com/cli/2.8/deploying-with-create2).