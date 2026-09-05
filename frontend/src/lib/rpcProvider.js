// src/lib/rpcProvider.js
import { JsonRpcProvider, FallbackProvider, Network } from "ethers";

const SEPOLIA = Network.from(11155111);

// Ordered by preference — drop flaky public endpoints
const RPC_URLS = [
  import.meta.env.VITE_SEPOLIA_RPC_URL,        // Alchemy (primary)
  import.meta.env.VITE_SEPOLIA_RPC_URL_BACKUP, // Ankr with API key
  "https://rpc.ankr.com/eth_sepolia",
  "https://1rpc.io/sepolia",
  // avoid sepolia.drpc.org — it often returns 400 on free tier
].filter(Boolean);

let _cachedProvider = null;

/**
 * Read-only multi-RPC provider.
 * quorum: 1 → first successful response wins (no multi-node consensus required)
 */
export function getReadProvider() {
  if (_cachedProvider) return _cachedProvider;

  if (RPC_URLS.length === 0) {
    throw new Error("No RPC URLs configured. Set VITE_SEPOLIA_RPC_URL in .env / Vercel.");
  }

  // Single URL → simple provider (no FallbackProvider quirks)
  if (RPC_URLS.length === 1) {
    _cachedProvider = new JsonRpcProvider(RPC_URLS[0], SEPOLIA, {
      staticNetwork: SEPOLIA,
    });
    return _cachedProvider;
  }

  const configs = RPC_URLS.map((url, i) => ({
    provider: new JsonRpcProvider(url, SEPOLIA, { staticNetwork: SEPOLIA }),
    priority: i + 1,   // lower = tried first
    stallTimeout: 1500,
    weight: 1,
  }));

  _cachedProvider = new FallbackProvider(configs, SEPOLIA, {
    quorum: 1, // ✅ critical — only 1 RPC needs to succeed
  });

  return _cachedProvider;
}

export function resetReadProvider() {
  _cachedProvider = null;
}