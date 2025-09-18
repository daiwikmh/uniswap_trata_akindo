import { ok } from "assert";
import { CurrentConfig } from "../config/config.js";
import PoolDataFetcher from "../pool_fetcher/poolDataFetcher.js";
import { Token } from "@uniswap/sdk-core";
export async function getAllPoolsInfo() {
  const results = [];

  for (const poolConfig of CurrentConfig.pools) {
    const fetcher = new PoolDataFetcher(poolConfig);

    try {
      const { poolAddress, metadata } = await fetcher.constructPool();

      results.push({
        name: poolConfig.name,
        poolAddress,
        sqrtPriceX96: metadata.sqrtPriceX96.toString(),
        tick: metadata.tick,
        liquidity: metadata.liquidity.toString(),
        observationIndex: metadata.observationIndex,
        feeProtocol: metadata.feeProtocol,
      });
    } catch (error) {
      console.error(`❌ Error fetching pool info for ${poolConfig.name}:`, error.message);
      results.push({
        name: poolConfig.name,
        error: error.message,
      });
    }
  }

  return results;
}


export function addPool(poolConfig) {
  try {
    const { name, token0, token1, fee } = poolConfig;

    if (!name || !token0 || !token1 || !fee) {
      throw new Error("Missing required pool fields");
    }

    // Construct Token objects
    const token0Obj = new Token(
      token0.chainId,
      token0.address,
      token0.decimals,
      token0.symbol,
      token0.name
    );

    const token1Obj = new Token(
      token1.chainId,
      token1.address,
      token1.decimals,
      token1.symbol,
      token1.name
    );

    const newPool = {
      name,
      token0: token0Obj,
      token1: token1Obj,
      fee,
    };

    CurrentConfig.pools.push(newPool);

    return {
      ok: true,
      totalPools: CurrentConfig.pools.length,
      pool: newPool,
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
    };
  }
}