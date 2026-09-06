// src/lib/getLogsChunked.js
import addresses from "../contracts/addresses.json";
import { Contract } from "ethers";
import { withRpcFailover } from "./rpcProvider";

const logsCache = new Map();
const CHUNK = 2_000; // smaller chunks = fewer free-tier range kills

function cacheKey(address, filter) {
  const addr = (address || "").toLowerCase();
  const topics = filter?.topics ? JSON.stringify(filter.topics) : "all";
  return `${addr}_${topics}`;
}

/**
 * queryFilter with:
 * - nullYieldBlock floor
 * - small chunks
 * - full RPC loop on each chunk failure
 * - no cache of failed/partial first scans
 */
export async function queryFilterChunked(contract, filter, options = {}) {
  if (!contract) return [];

  if (typeof options === "number") {
    options = { fromBlock: options };
  }

  const {
    fromBlock: fromBlockOpt = null,
    forceRefresh = false,
    chunkSize = CHUNK,
  } = options;

  const contractAddress = contract.target || contract.address;
  const abi = contract.interface;

  // Need a provider only for getBlockNumber — failover loop
  const latest = await withRpcFailover(
    async (provider) => provider.getBlockNumber(),
    { label: "getBlockNumber" }
  );

  const deployFloor = Number(
    addresses.nullYieldBlock ?? addresses.startBlock ?? 0
  );

  const floor =
    fromBlockOpt != null
      ? Math.max(0, Number(fromBlockOpt))
      : Math.max(0, deployFloor);

  const fromBlock = Math.min(floor, latest);
  const size = Math.min(Math.max(1, Number(chunkSize) || CHUNK), 9_999);
  const key = cacheKey(contractAddress, filter);

  if (forceRefresh) logsCache.delete(key);

  const cached = logsCache.get(key);
  let scanStart = fromBlock;
  let existing = [];

  if (
    cached &&
    !forceRefresh &&
    cached.floor <= fromBlock &&
    cached.lastBlock >= fromBlock &&
    cached.complete
  ) {
    if (cached.lastBlock >= latest) return cached.events;
    scanStart = cached.lastBlock + 1;
    existing = cached.events;
  }

  const fresh = [];
  let cursor = scanStart;
  let complete = true;

  while (cursor <= latest) {
    const end = Math.min(cursor + size - 1, latest);

    try {
      // Entire chunk tries RPC #1, then #2, then #3...
      const part = await withRpcFailover(
        async (provider) => {
          const c = new Contract(contractAddress, abi, provider);
          return c.queryFilter(filter, cursor, end);
        },
        { label: `getLogs ${cursor}-${end}` }
      );
      fresh.push(...part);
      cursor = end + 1;
    } catch (e) {
      complete = false;
      console.warn(
        `[getLogs] ALL RPCs failed for ${cursor}-${end}:`,
        e.message
      );
      break;
    }
  }

  // merge + dedupe
  const merged = [...existing, ...fresh];
  const seen = new Set();
  const deduped = [];
  for (const ev of merged) {
    const id =
      ev.logIndex != null
        ? `${ev.transactionHash}-${ev.logIndex}`
        : `${ev.transactionHash}-${ev.args?.drawId ?? ""}`;
    if (seen.has(id)) continue;
    seen.add(id);
    deduped.push(ev);
  }

  if (complete) {
    logsCache.set(key, {
      floor: fromBlock,
      lastBlock: latest,
      events: deduped,
      complete: true,
    });
  }

  return deduped;
}

export function clearLogsCache() {
  logsCache.clear();
}