/**
 * getLogsChunked.js
 * queryFilter in chunks of ≤9999 blocks (Sepolia public RPC limit).
 * Prefers contract deploy block from addresses.json as the scan floor.
 */
import addresses from "../contracts/addresses.json";

/**
 * @param {import("ethers").Contract} contract
 * @param {*} filter - ethers event filter (e.g. pool.filters.DrawFinalized())
 * @param {object} [options]
 * @param {number|null} [options.fromBlock] - absolute start (overrides deploy floor)
 * @param {number|null} [options.lookbackBlocks] - if set, max(deployFloor, latest - lookback)
 * @param {number} [options.chunkSize=9999] - must stay ≤ 9999 on many free RPCs
 */
export async function queryFilterChunked(
  contract,
  filter,
  options = {}
) {
  // Back-compat: old call style queryFilterChunked(c, f, 8000, 9999)
  if (typeof options === "number") {
    const lookbackBlocks = options;
    const chunkSize = arguments[3] ?? 9999;
    return queryFilterChunked(contract, filter, { lookbackBlocks, chunkSize });
  }

  const {
    fromBlock: fromBlockOpt = null,
    lookbackBlocks = null,
    chunkSize = 9999,
  } = options;

  const provider = contract.runner?.provider;
  if (!provider) return [];

  const latest = await provider.getBlockNumber();

  const deployFloor = Number(
    addresses.hushPoolBlock || addresses.startBlock || 0
  );

  let fromBlock;
  if (fromBlockOpt != null) {
    fromBlock = Math.max(0, Number(fromBlockOpt));
  } else if (lookbackBlocks != null) {
    // Optional cap: don't scan more than lookback, but never before deploy
    fromBlock = Math.max(deployFloor, latest - Number(lookbackBlocks), 0);
  } else {
    // Default: from deploy block → latest (best for free-tier RPC)
    fromBlock = Math.min(Math.max(0, deployFloor), latest);
  }

  // Safety: never request a range wider than chunkSize in one shot
  const size = Math.min(Math.max(1, Number(chunkSize) || 9999), 9999);

  const events = [];

  for (let start = fromBlock; start <= latest; start += size) {
    const end = Math.min(start + size - 1, latest);
    try {
      const part = await contract.queryFilter(filter, start, end);
      events.push(...part);
    } catch (e) {
      console.warn(
        `[getLogs] ${start}-${end}:`,
        e.shortMessage || e.message
      );
    }
  }

  return events;
}