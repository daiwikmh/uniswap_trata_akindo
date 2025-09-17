import { ethers } from 'ethers'
import { Pool } from '@uniswap/v3-sdk'
import { CurrentConfig } from './config.js'
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json' with { type: 'json' }

function getProvider() {
  const rpcUrl = CurrentConfig.rpc[CurrentConfig.env]
  return new ethers.providers.JsonRpcProvider(rpcUrl)
}

export class PoolDataFetcher {
  constructor() {
    this.provider = getProvider()

    // Compute pool address
    this.poolAddress = Pool.getAddress(
      CurrentConfig.pool.token0,
      CurrentConfig.pool.token1,
      CurrentConfig.pool.fee
    )

    // Create pool contract instance
    this.poolContract = new ethers.Contract(
      this.poolAddress,
      IUniswapV3PoolABI.abi,
      this.provider
    )
  }

  /**
   * Fetch basic pool metadata (slot0 and liquidity)
   */
  async getPoolMetadata() {
    try {
      const [slot0, liquidity] = await Promise.all([
        this.poolContract.slot0(),
        this.poolContract.liquidity()
      ])

      return {
        poolAddress: this.poolAddress,
        metadata: {
          sqrtPriceX96: slot0.sqrtPriceX96,
          tick: slot0.tick,
          observationIndex: slot0.observationIndex,
          observationCardinality: slot0.observationCardinality,
          observationCardinalityNext: slot0.observationCardinalityNext,
          feeProtocol: slot0.feeProtocol,
          unlocked: slot0.unlocked,
          liquidity: liquidity
        }
      }
    } catch (error) {
      console.error('Error fetching pool metadata:', error)
      throw error
    }
  }

  /**
   * Construct a Pool object with current data
   */
  async constructPool() {
    try {
      const { poolAddress, metadata } = await this.getPoolMetadata()

      console.log('Pool Address:', poolAddress)

      // Construct Pool object
      const pool = new Pool(
        CurrentConfig.pool.token0,
        CurrentConfig.pool.token1,
        CurrentConfig.pool.fee,
        metadata.sqrtPriceX96,
        metadata.liquidity,
        metadata.tick
      )

      return {
        pool,
        poolAddress,
        metadata
      }
    } catch (error) {
      console.error('Error constructing pool:', error)
      throw error
    }
  }

  /**
   * Monitor pool for real-time updates
   */
  async monitorPool(callback) {
    console.log('Starting pool monitoring for:', this.poolAddress)

    const updateInterval = 5000 // 5 seconds

    setInterval(async () => {
      try {
        const { metadata } = await this.getPoolMetadata()
        callback(metadata)
      } catch (error) {
        console.error('Error in pool monitoring:', error)
      }
    }, updateInterval)
  }
}

export default PoolDataFetcher