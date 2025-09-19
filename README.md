Shinrai Protocol Analysis

  What is Shinrai?

  Shinrai is a leveraged trading protocol built on Uniswap V4 with EigenLayer validation. It enables users to trade with
  leverage while using EigenLayer operators to validate positions and prevent manipulation.

  🚀 **Latest Update**: Migrated to Sepolia Testnet with full frontend integration

  Core Architecture

  1. ✅ Core Contracts (/src/)

  ✅ **LeverageHook.sol** - Uniswap V4 Hook
  - **Purpose**: Integrates with Uniswap V4 pools to enable leveraged trading
  - **Key Features**:
    - ✅ Validates leverage requests before liquidity operations
    - ✅ Implements dynamic fees based on pool utilization
    - ✅ Detects price manipulation through EigenLayer operators
    - ✅ Permissions: beforeSwap, afterSwap, beforeRemoveLiquidity, afterRemoveLiquidity
  - **Documentation**: [LeverageHook.md](Shinrai/LeverageHook.md)

  ✅ **MarginRouter.sol** - Trading Entry Point
  - **Purpose**: Main interface for opening/closing leveraged positions
  - **Key Features**:
    - ✅ Position management (open/close leverage positions)
    - ✅ Authorization checks and leverage limits
    - ✅ Emergency pause functionality
    - ✅ Pool authorization system

  ✅ **GlobalAssetLedger.sol** - Accounting System
  - **Purpose**: Tracks all borrowing, collateral, and cross-pool exposure
  - **Key Features**:
    - ✅ Borrow authorization with caps (global & pool-specific)
    - ✅ Collateral management
    - ✅ Utilization and funding rate calculations
    - ✅ Position registration and tracking

  2. ✅ Interfaces (/src/interface/)

  ✅ **ILeverageValidator.sol** - EigenLayer Integration
  - **Purpose**: Defines validation interface using EigenLayer operators
  - **Key Functions**:
    - ✅ Position validation with operator signatures
    - ✅ Borrow request authorization
    - ✅ Pool manipulation detection
    - ✅ Cross-pool exposure limits
    - ✅ Liquidation checks

  ✅ **IEigenAssetVerifier.sol** - Base Validation
  - **Purpose**: Core EigenLayer operator management
  - **Key Functions**:
    - ✅ Operator registration/deregistration
    - ✅ Market creation and validation
    - ✅ Stake requirements and slashing

  ✅ **Deployment Workflow**

  ✅ **Phase 1**: Mining Hook Address (00_MineHookAddress.s.sol)
  ```bash
  forge script script/00_MineHookAddress.s.sol
  ```
  - ✅ Mines a salt for CREATE2 deployment
  - ✅ Ensures hook address has correct permission flags
  - ✅ Saves salt to .env for deployment

  ✅ **Phase 2**: Core Deployment (01_DeployCore.s.sol)
  ```bash
  forge script script/01_DeployCore.s.sol --broadcast
  ```
  - ✅ Deploys PoolManager (Uniswap V4)
  - ✅ Deploys LeverageHook with mined salt
  - ✅ Deploys GlobalAssetLedger
  - ✅ Deploys MarginRouter
  - ✅ Connects to EigenLayer contracts on Sepolia testnet

  ✅ **Phase 3**: Operator Registration (02_RegisterOperators.s.sol)
  ```bash
  forge script script/02_RegisterOperators.s.sol --broadcast
  ```
  - ✅ Registers operators with EigenLayer DelegationManager
  - ✅ Sets up operator validation infrastructure

  ✅ **Phase 4**: Protocol Configuration (03_ConfigureProtocol.s.sol)
  ```bash
  forge script script/03_ConfigureProtocol.s.sol --broadcast
  ```
  - ✅ Authorizes MarginRouter with GlobalAssetLedger
  - ✅ Sets global and pool-specific borrow caps
  - ✅ Configures leverage limits (max 10x)
  - ✅ Sets up mock trading pools

  ✅ **Phase 5**: Integration Testing (04_TestIntegration.s.sol)
  ```bash
  forge script script/04_TestIntegration.s.sol --broadcast
  ```
  - ✅ Deploys test tokens
  - ✅ Tests operator validation
  - ✅ Tests borrow authorization
  - ✅ Tests emergency functions

  ✅ **How Integration Works**

  **For Users (Traders):**
  1. ✅ **Deposit Collateral**: Transfer tokens to GlobalAssetLedger
  2. ✅ **Open Position**: Call MarginRouter.openLeveragePosition()
     - ✅ Specify pool, collateral, leverage ratio
     - ✅ System validates through EigenLayer operators
  3. ✅ **Position Execution**: Hook triggers during Uniswap operations
  4. ✅ **Close Position**: Call MarginRouter.closeLeveragePosition()

  **For Operators:**
  1. ✅ **Registration**: Register with EigenLayer DelegationManager
  2. ✅ **Validation**: Provide signatures for position validation
  3. ✅ **Monitoring**: Watch for manipulation and unhealthy positions
  4. ✅ **Slashing**: Get slashed for incorrect validations

  **For Developers:**
  1. ✅ **Deploy Infrastructure**: Run deployment scripts in sequence
  2. ✅ **Configure Pools**: Authorize specific Uniswap V4 pools
  3. ✅ **Set Limits**: Configure leverage caps and borrow limits
  4. ✅ **Monitor**: Track utilization and funding rates

  Key Dependencies (.env)

  **Current Deployment (Sepolia Testnet):**

  EigenLayer Addresses:
  - ✅ DELEGATION_MANAGER: `0xD4A7E1Bd8015057293f0D0A557088c286942e84b`
  - ✅ AVS_DIRECTORY: `0xa789c91ECDdae96865913130B786140Ee17aF545`

  Core Contract Addresses:
  - ✅ POOL_MANAGER: `0xab68573623f90708958c119F7F75236b5F13EF00`
  - ✅ LEVERAGE_HOOK: `0x220c3B7316280D991fB501060EfB58D1819743c0`
  - ✅ MARGIN_ROUTER: `0x90204d0F2A1C0e9BD2fb56849bD9262e694D8701`
  - ✅ GLOBAL_ASSET_LEDGER: `0x3570161C03e5dD3CaC20C1e140C7B4889152B69D`

  Network Configuration:
  - CHAIN_ID: 11155111 (Sepolia)
  - RPC_URL: https://eth-sepolia.g.alchemy.com/v2/t7Oxw5b_OpDL6yQVWN70ZjxO6hTCaZeW
  - EXPLORER: https://sepolia.etherscan.io

  Protocol Config:
  - ✅ MAX_GLOBAL_LEVERAGE: 1000 (10x max)
  - ✅ INITIAL_GLOBAL_BORROW_CAP: 10M tokens
  - ✅ INITIAL_POOL_BORROW_CAP: 1M tokens per pool

  ## ✅ Frontend Integration

  **React Application** (`/client/src/components/leverage/`)

  ### ✅ Core Features:
  1. ✅ **Pool Creation**: Create Uniswap V4 pools with LeverageHook integration
  2. ✅ **Pool Management**: Store and manage created pools with local persistence
  3. ✅ **Leverage Trading**: Open/close leveraged positions using created pools
  4. ✅ **Contract Testing**: Real-time verification of contract deployments
  5. ✅ **Token Discovery**: Automatic discovery of wallet tokens on Sepolia

  ### ✅ Key Components:
  - ✅ `LeverageTrading.tsx` - Main trading interface with multiple tabs
  - ✅ `UniswapV4PoolCreator.tsx` - Pool creation with step-by-step guidance
  - ✅ Pool selection and management interface (integrated)
  - ✅ Leverage position trading interface (integrated)
  - ✅ Real-time pool data and analytics (integrated)
  - ✅ Contract verification and testing (integrated)

  ### ✅ How to Use:

  1. ✅ **Connect Wallet**: Connect MetaMask to Sepolia testnet
  2. ✅ **Create Pool**: Use "Create Pools" tab to create Uniswap V4 pools
     - ✅ Select any two token addresses (real Sepolia tokens recommended)
     - ✅ Set initial price and leverage limits
     - ✅ Creates pool with LeverageHook integration
  3. ✅ **Trade with Leverage**: Use "Trade" tab for leverage trading
     - ✅ Select created pool from dropdown
     - ✅ Choose long/short position with up to 10x leverage
     - ✅ Open/close positions through MarginRouter

  ### ✅ Live Pool Creation Success:
  ```
  Pool ID: 0x652a195ad30fd56A78950F88299e878Fc752D496f4406811b5Accb0331f608c2
  Currency0: 0x652a195ad30fd56A78950F88299e878Fc752D496
  Currency1: 0xf4406811b5Accb0331f608c2CCAf809255a472Be
  Transaction: 0xa1a4a34e0c134a5b00785ec7b0c3e719d48fca907636ba19a5c541e508851f56
  ```

  ### ✅ Migration from Holesky:
  - ✅ Updated all contract addresses to Sepolia deployment
  - ✅ Integrated official Uniswap V4 Sepolia contracts
  - ✅ Updated network configuration and RPC endpoints
  - ✅ Added comprehensive contract testing functionality
  - ✅ Enhanced pool management with local storage
  - ✅ Real token integration (USDC, DAI, WETH on Sepolia)
  - ✅ **NEW**: Added LeverageHook comprehensive documentation
