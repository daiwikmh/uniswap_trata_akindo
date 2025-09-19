// Hook to discover tokens in connected wallet
import { useState, useEffect } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { formatEther, isAddress } from 'viem';
import { ERC20_ABI } from '../contracts';

interface WalletToken {
  address: `0x${string}`;
  symbol: string;
  name: string;
  decimals: number;
  balance: bigint;
  balanceFormatted: string;
}

// Common token addresses on Sepolia testnet for discovery
const COMMON_TESTNET_TOKENS = [
  '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14', // WETH on Sepolia
  '0x6f14C02FC1F78322cFd7d707aB90f18baD3B54f5', // USDC on Sepolia
  '0x3e622317f8C93f7328350cF0B56d9eD4C620C5d6', // DAI on Sepolia
  '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // USDT on Sepolia
  '0x779877A7B0D9E8603169DdbD7836e478b4624789', // LINK on Sepolia
  '0x53844F9577C2334e541Aec7Df7174ECe5dF1fCf0', // UNI on Sepolia
];

export function useWalletTokens() {
  const { address: userAddress } = useAccount();
  const [discoveredTokens, setDiscoveredTokens] = useState<WalletToken[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [customTokens, setCustomTokens] = useState<WalletToken[]>([]);

  // Discover tokens in wallet
  const discoverTokens = async () => {
    if (!userAddress) return;

    setIsLoading(true);
    const tokens: WalletToken[] = [];

    try {
      // Check common testnet tokens
      for (const tokenAddress of COMMON_TESTNET_TOKENS) {
        try {
          const [symbol, name, decimals, balance] = await Promise.all([
            fetch(`https://eth-sepolia.g.alchemy.com/v2/t7Oxw5b_OpDL6yQVWN70ZjxO6hTCaZeW`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_call',
                params: [
                  {
                    to: tokenAddress,
                    data: '0x95d89b41' // symbol()
                  },
                  'latest'
                ],
                id: 1
              })
            }).then(r => r.json()).then(r => {
              if (r.result && r.result !== '0x') {
                // Decode hex to string
                const hex = r.result.slice(2);
                const str = Buffer.from(hex, 'hex').toString('utf8').replace(/\0/g, '');
                return str || 'UNKNOWN';
              }
              return 'UNKNOWN';
            }).catch(() => 'UNKNOWN'),

            fetch(`https://eth-sepolia.g.alchemy.com/v2/t7Oxw5b_OpDL6yQVWN70ZjxO6hTCaZeW`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_call',
                params: [
                  {
                    to: tokenAddress,
                    data: '0x06fdde03' // name()
                  },
                  'latest'
                ],
                id: 1
              })
            }).then(r => r.json()).then(r => {
              if (r.result && r.result !== '0x') {
                const hex = r.result.slice(2);
                const str = Buffer.from(hex, 'hex').toString('utf8').replace(/\0/g, '');
                return str || 'Unknown Token';
              }
              return 'Unknown Token';
            }).catch(() => 'Unknown Token'),

            fetch(`https://eth-sepolia.g.alchemy.com/v2/t7Oxw5b_OpDL6yQVWN70ZjxO6hTCaZeW`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_call',
                params: [
                  {
                    to: tokenAddress,
                    data: '0x313ce567' // decimals()
                  },
                  'latest'
                ],
                id: 1
              })
            }).then(r => r.json()).then(r => {
              if (r.result && r.result !== '0x') {
                return parseInt(r.result, 16);
              }
              return 18;
            }).catch(() => 18),

            fetch(`https://eth-sepolia.g.alchemy.com/v2/t7Oxw5b_OpDL6yQVWN70ZjxO6hTCaZeW`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'eth_call',
                params: [
                  {
                    to: tokenAddress,
                    data: `0x70a08231000000000000000000000000${userAddress.slice(2)}` // balanceOf(user)
                  },
                  'latest'
                ],
                id: 1
              })
            }).then(r => r.json()).then(r => {
              if (r.result && r.result !== '0x') {
                return BigInt(r.result);
              }
              return 0n;
            }).catch(() => 0n)
          ]);

          // Only include tokens with balance > 0 or known tokens
          if (balance > 0n || ['TOKEN0', 'TOKEN1', 'WETH', 'USDC', 'DAI'].includes(symbol)) {
            tokens.push({
              address: tokenAddress as `0x${string}`,
              symbol,
              name,
              decimals,
              balance,
              balanceFormatted: formatEther(balance)
            });
          }
        } catch (error) {
          console.log(`Failed to load token ${tokenAddress}:`, error);
        }
      }

      setDiscoveredTokens(tokens);
    } catch (error) {
      console.error('Token discovery failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Add custom token by address
  const addCustomToken = async (tokenAddress: string): Promise<WalletToken | null> => {
    if (!isAddress(tokenAddress) || !userAddress) return null;

    try {
      // Fetch token info
      const [symbol, name, decimals, balance] = await Promise.all([
        fetch(`https://eth-sepolia.g.alchemy.com/v2/t7Oxw5b_OpDL6yQVWN70ZjxO6hTCaZeW`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_call',
            params: [{ to: tokenAddress, data: '0x95d89b41' }, 'latest'],
            id: 1
          })
        }).then(r => r.json()).then(r => {
          if (r.result && r.result !== '0x') {
            const hex = r.result.slice(2);
            return Buffer.from(hex, 'hex').toString('utf8').replace(/\0/g, '') || 'UNKNOWN';
          }
          return 'UNKNOWN';
        }),

        fetch(`https://eth-sepolia.g.alchemy.com/v2/t7Oxw5b_OpDL6yQVWN70ZjxO6hTCaZeW`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_call',
            params: [{ to: tokenAddress, data: '0x06fdde03' }, 'latest'],
            id: 1
          })
        }).then(r => r.json()).then(r => {
          if (r.result && r.result !== '0x') {
            const hex = r.result.slice(2);
            return Buffer.from(hex, 'hex').toString('utf8').replace(/\0/g, '') || 'Unknown';
          }
          return 'Unknown';
        }),

        18, // Default decimals

        fetch(`https://eth-sepolia.g.alchemy.com/v2/t7Oxw5b_OpDL6yQVWN70ZjxO6hTCaZeW`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            method: 'eth_call',
            params: [
              {
                to: tokenAddress,
                data: `0x70a08231000000000000000000000000${userAddress.slice(2)}`
              },
              'latest'
            ],
            id: 1
          })
        }).then(r => r.json()).then(r => {
          if (r.result && r.result !== '0x') {
            return BigInt(r.result);
          }
          return 0n;
        })
      ]);

      const token: WalletToken = {
        address: tokenAddress as `0x${string}`,
        symbol,
        name,
        decimals,
        balance,
        balanceFormatted: formatEther(balance)
      };

      // Add to custom tokens if not already exists
      setCustomTokens(prev => {
        const exists = prev.some(t => t.address.toLowerCase() === tokenAddress.toLowerCase());
        if (!exists) {
          return [...prev, token];
        }
        return prev;
      });

      return token;
    } catch (error) {
      console.error('Failed to add custom token:', error);
      return null;
    }
  };

  // Get all tokens (discovered + custom)
  const allTokens = [...discoveredTokens, ...customTokens];

  // Auto-discover on wallet connection
  useEffect(() => {
    if (userAddress) {
      discoverTokens();
    }
  }, [userAddress]);

  return {
    discoveredTokens,
    customTokens,
    allTokens,
    isLoading,
    discoverTokens,
    addCustomToken
  };
}