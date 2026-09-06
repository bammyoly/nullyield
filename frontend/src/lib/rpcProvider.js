// src/lib/rpcProvider.js
import { JsonRpcProvider, FallbackProvider, Network } from "ethers";

const SEPOLIA = Network.from(11155111);

/** Ordered preference — put keyed RPCs first */
export const RPC_URLS = [
  import.meta.env.VITE_SEPOLIA_RPC_URL,          // Ankr (primary)
  import.meta.env.VITE_SEPOLIA_RPC_URL_BACKUP,   // ethpanda / second key
  "https://rpc.sepolia.ethpandaops.io",
  "https://1rpc.io/sepolia",
  "https://rpc.ankr.com/eth_sepolia",
].filter(Boolean);

let _fallback = null;

function makeProvider(url) {
  return new JsonRpcProvider(url, SEPOLIA, { staticNetwork: SEPOLIA });
}

/** General reads (eth_call, getBlockNumber, etc.) */
export function getReadProvider() {
  if (_fallback) return _fallback;

  if (!RPC_URLS.length) {
    throw new Error("No RPC URLs — set VITE_SEPOLIA_RPC_URL");
  }

  if (RPC_URLS.length === 1) {
    _fallback = makeProvider(RPC_URLS[0]);
    return _fallback;
  }

  const configs = RPC_URLS.map((url, i) => ({
    provider: makeProvider(url),
    priority: i + 1,
    weight: 1,
    stallTimeout: 2000,
  }));

  _fallback = new FallbackProvider(configs, SEPOLIA, {
    quorum: 1, // first success wins
  });

  return _fallback;
}

/**
 * Try each RPC in order until fn(provider) succeeds.
 * Use this for eth_getLogs / queryFilter — FallbackProvider is unreliable there.
 */
export async function withRpcFailover(fn, { label = "rpc" } = {}) {
  const errors = [];

  for (let i = 0; i < RPC_URLS.length; i++) {
    const url = RPC_URLS[i];
    const short = url.replace(/^https?:\/\//, "").slice(0, 40);
    try {
      const provider = makeProvider(url);
      const result = await fn(provider, url, i);
      if (i > 0) {
        console.info(`[${label}] recovered via RPC #${i + 1} (${short})`);
      }
      return result;
    } catch (err) {
      const msg = err.shortMessage || err.message || String(err);
      console.warn(`[${label}] RPC #${i + 1} failed (${short}):`, msg);
      errors.push({ url, msg });
    }
  }

  const detail = errors.map((e, i) => `#${i + 1}: ${e.msg}`).join(" | ");
  throw new Error(`All RPCs failed for ${label}. ${detail}`);
}

export function resetReadProvider() {
  _fallback = null;
}