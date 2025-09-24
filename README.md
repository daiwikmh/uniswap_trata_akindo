# CoW Uniswap V4 Protocol

## Overview

The CoW Uniswap V4 Protocol is a decentralized trading system integrating **Coincidence of Wants (CoW)** order matching with **Uniswap v4** pools for efficient token swaps. Traders submit EIP-712 signed orders specifying tokens, amounts, minimum outputs, and deadlines. The `CoWSolver` contract matches orders off-chain, settling them on-chain via the `CoWUniswapV4Hook` contract with direct token transfers. Unmatched orders fall back to Uniswap v4 pools using custom hooks for dynamic fees, reducing slippage and improving capital efficiency.

## Features

- **CoW Order Matching**: Direct peer-to-peer swaps to minimize AMM pool reliance.
- **Uniswap v4 Hooks**: Custom logic for order matching and dynamic fee calculation.
- **EIP-712 Security**: Signed orders with nonces prevent replay attacks.
- **Event Tracking**: Logs for matched orders and fallback swaps.

## Contracts

- **CoWUniswapV4Hook**:
  - **Address**: `0x2b9c691E06Cb5F1b23858E4585d8eF58fd0380c0`
  - **Pool Manager**: `0xab68573623f90708958c119F7F75236b5F13EF00`
  - **CREATE2 Deployer**: `0x4e59b44847b379578588920cA78FbF26c0B4956C`
  - **Salt**: `0x00000000000000000000000000000000000000000000000000000000000030c8`
  - **Hook Flags**: `192` (`beforeSwap` and `afterSwap`)
- **CoWSolver**:
  - **Address**: `0x6659362Dd22ebA589aFe952da13517361FDe8a2a`

## Prerequisites

- **Node.js** and **npm** (or **Yarn**)
- **Hardhat** or **Foundry** for contract management
- **Ethereum Wallet** (e.g., MetaMask) with testnet/mainnet funds
- **Environment Variables**: Create a `.env` file:
  ```env
  POOL_MANAGER_ADDRESS=0xab68573623f90708958c119F7F75236b5F13EF00
  COW_HOOK_ADDRESS=0x2b9c691E06Cb5F1b23858E4585d8eF58fd0380c0
  COW_HOOK_SALT=0x00000000000000000000000000000000000000000000000000000000000030c8
  COW_SOLVER_ADDRESS=0x6659362Dd22ebA589aFe952da13517361FDe8a2a
  PRIVATE_KEY=your_private_key
  RPC_URL=your_rpc_url
