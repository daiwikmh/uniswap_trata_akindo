import PoolDataFetcher from '../pool_fetcher/poolDataFetcher.js'

async function main() {
  console.log('🚀 Starting Shinrai Pool Data Fetcher...')

  try {
    // Initialize pool data fetcher
    const fetcher = new PoolDataFetcher()

    // Construct pool with current data
    console.log('📊 Fetching pool data...')
    const { pool, poolAddress, metadata } = await fetcher.constructPool()

    console.log('\n📈 Pool Information:')
    console.log('Pool Address:', poolAddress)
    console.log('Current Price (sqrtPriceX96):', metadata.sqrtPriceX96.toString())
    console.log('Current Tick:', metadata.tick)
    console.log('Total Liquidity:', metadata.liquidity.toString())
    console.log('Observation Index:', metadata.observationIndex)
    console.log('Fee Protocol:', metadata.feeProtocol)

    // Start monitoring pool for changes
    console.log('\n👀 Starting real-time monitoring...')
    await fetcher.monitorPool((newMetadata) => {
      console.log(`\n📊 Pool Update at ${new Date().toLocaleTimeString()}:`)
      console.log('Price:', newMetadata.sqrtPriceX96.toString())
      console.log('Tick:', newMetadata.tick)
      console.log('Liquidity:', newMetadata.liquidity.toString())
    })

  } catch (error) {
    console.error('❌ Error:', error.message)

    if (error.message.includes('network')) {
      console.log('\n💡 Make sure to set your RPC URL in the config!')
    }

    if (error.message.includes('contract')) {
      console.log('\n💡 Make sure StateView contract address is correct!')
    }
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down pool monitor...')
  process.exit(0)
})

// Start the application
main().catch(console.error)