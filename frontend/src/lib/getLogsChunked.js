/**
 * src/lib/getLogsChunked.js
 * queryFilter in chunks of ≤9999 blocks (Sepolia public RPC limit).
 * Uses nullYieldBlock as deploy floor + incremental caching to save 95% of RPC calls.
 */
import addresses from "../contracts/addresses.json";

// Memory cache across 15-second polling intervals
const logsCache = new Map();

export async function queryFilterChunked(contract, filter, options = {}) {
  if (!contract) return [];

  // Handle positional number argument: queryFilterChunked(contract, filter, 7450000)
  let fromBlockOpt = null;
  let lookbackBlocks = null;
  let chunkSize = 9999;

  if (typeof options === "number") {
    fromBlockOpt = options;
  } else if (typeof options === "object" && options !== null) {
    fromBlockOpt = options.fromBlock;
    lookbackBlocks = options.lookbackBlocks;
    chunkSize = options.chunkSize || 9999;
  }

  const provider = contract.runner?.provider || contract.provider;
  if (!provider) return [];

  const latest = await provider.getBlockNumber();

  // Fix: Renamed from hushPoolBlock to nullYieldBlock
  const deployFloor = Number(
    addresses.nullYieldBlock || addresses.startBlock || 0
  );

  let fromBlock;
  if (fromBlockOpt != null) {
    fromBlock = Math.max(0, Number(fromBlockOpt));
  } else if (lookbackBlocks != null) {
    fromBlock = Math.max(deployFloor, latest - Number(lookbackBlocks), 0);
  } else {
    fromBlock = Math.min(Math.max(0, deployFloor), latest);
  }

  // Safety cap on chunk size
  const size = Math.min(Math.max(1, Number(chunkSize) || 9999), 9999);

  // Incremental cache key per contract event filter
  const filterKey = `${contract.target || contract.address}_${
    filter.topics ? JSON.stringify(filter.topics) : "all"
  }`;

  const cached = logsCache.get(filterKey);
  let scanStart = fromBlock;
  let cachedEvents = [];

  // If already fetched before, only scan NEW blocks since last poll
  if (cached && cached.lastBlock < latest) {
    scanStart = cached.lastBlock + 1;
    cachedEvents = cached.events;
  } else if (cached && cached.lastBlock >= latest) {
    return cached.events;
  }

  const newEvents = [];

  // Fetch missing block chunks
  for (let start = scanStart; start <= latest; start += size) {
    const end = Math.min(start + size - 1, latest);
    try {
      const part = await contract.queryFilter(filter, start, end);
      newEvents.push(...part);
    } catch (e) {
      console.warn(`[getLogs] ${start}-${end}:`, e.shortMessage || e.message);
    }
  }

  const allEvents = [...cachedEvents, ...newEvents];

  // Save to memory cache for the current session
  logsCache.set(filterKey, {
    lastBlock: latest,
    events: allEvents,
  });

  return allEvents;
}