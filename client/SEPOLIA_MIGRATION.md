# Sepolia Migration Summary

This document summarizes the migration from Holesky to Sepolia testnet for the Shinrai Protocol integration.

## Updated Contract Addresses

### Core Shinrai Protocol (New Sepolia Deployment)
- **PoolManager**: `0xE03A1074c86CFeDd5C142C4F04F1a1536e203543` (Official Uniswap V4 Sepolia)
- **LeverageHook**: `0x48b720406c379135F5675b566c4e8B4E9Fc903c0`
- **MarginRouter**: `0x3923799a9431f32b489B0FBCed2f974363a8f228`
- **GlobalAssetLedger**: `0x6Efe5798864d9197e46F881eA009037DF2147238`

### EigenLayer (Sepolia)
- **DelegationManager**: `0xD4A7E1Bd8015057293f0D0A557088c286942e84b`
- **AVS Directory**: `0xa789c91ECDdae96865913130B786140Ee17aF545`

### Uniswap V4 Helper Contracts (Official Sepolia)
- **UniversalRouter**: `0x3A9D48AB9751398BbFa63ad67599Bb04e4BdF98b`
- **PositionManager**: `0x429ba70129df741B2Ca2a85BC3A2a3328e5c09b4`
- **StateView**: `0xe1dd9c3fa50edb962e442f60dfbc432e24537e4c`
- **Quoter**: `0x61b3f2011a92d183c7dbadbda940a7555ccf9227`
- **PoolSwapTest**: `0x9b6b46e2c869aa39918db7f52f5557fe577b6eee`
- **PoolModifyLiquidityTest**: `0x0c478023803a644c94c4ce1e7b9a087e411b0a`
- **Permit2**: `0x000000000022D473030F116dDEE9F6B43aC78BA3`

### Test Tokens (Real Sepolia Tokens)
- **USDC**: `0x6f14C02FC1F78322cFd7d707aB90f18baD3B54f5`
- **DAI**: `0x3e622317f8C93f7328350cF0B56d9eD4C620C5d6`
- **WETH**: `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14`

## Network Configuration

### Previous (Holesky)
- Chain ID: 17000
- RPC: https://holesky.drpc.org
- Explorer: https://holesky.etherscan.io

### New (Sepolia)
- Chain ID: 11155111
- RPC: https://eth-sepolia.g.alchemy.com/v2/t7Oxw5b_OpDL6yQVWN70ZjxO6hTCaZeW
- Explorer: https://sepolia.etherscan.io

## Files Updated

1. **contracts.ts** - Updated all contract addresses and network config
2. **App.tsx** - Updated wagmi configuration to use Sepolia
3. **useWagmiContracts.ts** - Updated chain imports and connection logic
4. **useWalletTokens.ts** - Updated RPC endpoints and token discovery addresses
5. **LeverageTrading.tsx** - Added contract testing functionality

## New Features Added

### Contract Testing
- Added `ContractTest.tsx` component for verifying contract deployments
- Added "Test Contracts" tab in main interface
- Provides real-time contract verification and read function testing

### Enhanced Token Discovery
- Updated to use real Sepolia testnet tokens
- Improved token discovery with proper Sepolia token addresses
- Better error handling for non-existent tokens

## Protocol Configuration

- **Max Global Leverage**: 1000 (10x)
- **Initial Global Borrow Cap**: 10,000,000 tokens
- **Initial Pool Borrow Cap**: 1,000,000 tokens
- **Min Collateral Ratio**: 150%
- **Liquidation Threshold**: 120%

## Verification Steps

1. Use the "Test Contracts" tab to verify all contract deployments
2. Check that PoolManager.isUnlocked() returns expected values
3. Verify MarginRouter.maxGlobalLeverage() returns 1000
4. Test GlobalAssetLedger.globalBorrowCaps() for token addresses
5. Verify wallet connection works on Sepolia (Chain ID: 11155111)

## Key Changes from Previous Implementation

1. **Official Uniswap V4 Contracts**: Now using official Uniswap V4 Sepolia deployments
2. **Real Testnet Tokens**: Replaced mock tokens with actual Sepolia testnet tokens
3. **Enhanced Monitoring**: Added comprehensive contract testing and verification
4. **Improved Error Handling**: Better handling of failed contract calls and token discovery
5. **Network Consistency**: All components now consistently use Sepolia configuration

## Environment Variables Used

From the provided .env:
- PRIVATE_KEY: 0x5f1d34e1196fe5f90407361006daae557106c07abf8ffcffc43e027d9859cd39
- RPC_URL: https://eth-sepolia.g.alchemy.com/v2/t7Oxw5b_OpDL6yQVWN70ZjxO6hTCaZeW
- All contract addresses as specified in the deployment

## Next Steps

1. Deploy to Sepolia and test end-to-end functionality
2. Verify leverage trading works with real Sepolia tokens
3. Test pool creation with the new PoolManager address
4. Validate EigenLayer integration with new operator addresses
5. Perform comprehensive integration testing

## Migration Checklist

- [x] Update contract addresses in contracts.ts
- [x] Update network configuration to Sepolia
- [x] Update wagmi configuration and chain imports
- [x] Update RPC endpoints in all API calls
- [x] Replace mock tokens with real Sepolia tokens
- [x] Add contract testing functionality
- [x] Update token discovery for Sepolia
- [x] Verify all imports and references
- [x] Test contract read functions
- [ ] Deploy and test in browser
- [ ] Perform end-to-end testing
- [ ] Validate leverage trading functionality