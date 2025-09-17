import { Token } from '@uniswap/sdk-core'
import { FeeAmount } from '@uniswap/v3-sdk'

// Environment configuration
export const Environment = {
  MAINNET: 'mainnet',
  LOCAL: 'local'
}

export const WETH_TOKEN = new Token(
  1, // Mainnet chain ID
  '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  18,
  'WETH',
  'Wrapped Ether'
)

export const USDC_TOKEN = new Token(
  1, // Mainnet chain ID
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  6,
  'USDC',
  'USD//C'
)

// RPC configuration
export const CurrentConfig = {
  env: Environment.MAINNET,
  rpc: {
    local: 'http://localhost:8545',
    mainnet: 'https://eth-mainnet.g.alchemy.com/v2/t7Oxw5b_OpDL6yQVWN70ZjxO6hTCaZeW'
  },
  pool: {
    token0: USDC_TOKEN,
    token1: WETH_TOKEN,
    fee: FeeAmount.MEDIUM
  }
}
