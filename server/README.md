# Shinrai Pool Data Client

Client for fetching Uniswap v4 pool data for EigenLayer-verified prediction markets.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Configure your environment:
   - Set RPC URLs in `src/config.js`
   - Update contract addresses (PoolManager, StateView, Hook addresses)
   - Configure your prediction market token addresses

3. Run the client:
```bash
npm start
```

## Configuration

Update `src/config.js` with your specific addresses:

- **RPC URLs**: Your Infura/Alchemy/etc endpoints
- **Contract Addresses**:
  - PoolManager (Uniswap v4)
  - StateView (for reading pool data)
  - EigenPredictHook (your hook contract)
- **Token Addresses**: YES/NO tokens for your prediction markets

## Features

- ✅ Fetch real-time pool data (price, liquidity, ticks)
- ✅ Monitor pool changes every 5 seconds
- ✅ Calculate pool IDs from pool keys
- ✅ Get initialized tick data around current price
- 🔄 Ready for EigenLayer operator integration

## Pool Data Structure

The client fetches:
- **Slot0**: Current price (sqrtPriceX96), tick, fees
- **Liquidity**: Total pool liquidity
- **Ticks**: Initialized price ranges with liquidity

This data can be used by EigenLayer operators to validate swap conditions and market outcomes.

## Next Steps

1. Integrate with your deployed EigenPredictHook contract
2. Add operator validation logic
3. Connect to EigenLayer AVS for real-time verification
4. Implement market outcome tracking