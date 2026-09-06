import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount, useWalletClient } from "wagmi";
import {
  Contract,
  BrowserProvider,
  formatUnits,
} from "ethers";
import {
  Trophy,
  Clock,
  Users,
  Loader2,
  Play,
  CheckCircle2,
  Sparkles,
  Award,
  History,
  RefreshCw,
  LockOpen,
  Unlock,
  ShieldAlert,
  Coins,
  ChevronDown,
  Eye,
  Hourglass,
  Bot,
} from "lucide-react";

import addresses from "../contracts/addresses.json";
import RawNullYieldABI from "../contracts/NullYield.json";
import { useCountdown } from "../hooks/useCountdown";
import { useZamaEncrypt } from "../hooks/useZamaEncrypt";
import { toast } from "../components/Toaster";
import { queryFilterChunked, clearLogsCache } from "../lib/getLogsChunked";
import { getReadProvider } from "../lib/rpcProvider";

// Centralized Notifications Import
import { maybeEmailWinner } from "../lib/notifications";

const NullYieldABI = Array.isArray(RawNullYieldABI)
  ? RawNullYieldABI
  : RawNullYieldABI.abi;
const DECIMALS = 6;

const DrawStateLabels = {
  0: {
    label: "Open",
    color: "text-green-400",
    border: "border-green-500/30",
  },
  1: {
    label: "Awaiting total decryption",
    color: "text-yellow-400",
    border: "border-yellow-500/30",
    phase: "Step 2 of 3 — reveal pool total & select winner",
  },
  2: {
    label: "Awaiting finalization",
    color: "text-accent-400",
    border: "border-accent-500/30",
    phase: "Step 3 of 3 — decrypt winner & credit prize",
  },
};

const ERROR_MESSAGES = {
  DrawNotDue: "The next draw window hasn't opened yet.",
  DrawInProgress: "A draw is already in progress.",
  InvalidDrawState: "That step isn't available in the draw's current phase.",
  NotAuthorizedKeeper: "Only the pool owner or keeper can do that.",
  InvalidDrawId: "This draw has already moved on — refresh and try again.",
  EmptyPool: "There are no depositors in the pool yet.",
  IndexOutOfBounds: "Winner index didn't match the depositor list.",
};

function friendlyError(err, fallback) {
  const raw =
    err?.reason || err?.shortMessage || err?.data?.message || err?.message || "";
  const matched = Object.keys(ERROR_MESSAGES).find((code) => raw.includes(code));
  if (matched) return ERROR_MESSAGES[matched];
  if (raw.includes("rejected") || err?.code === 4001)
    return "Request rejected in wallet.";
  return raw || fallback;
}

function isEmptyHandle(h) {
  if (h == null || h === "") return true;
  const s = String(h).toLowerCase().replace(/^0x/, "");
  return !s.length || /^0+$/.test(s);
}

const Draws = () => {
  const { isConnected, address } = useAccount();
  const { data: walletClient } = useWalletClient();
  const {
    publicDecryptHandle,
    encryptAmount,
    decryptHandle,
    sdkReady,
  } = useZamaEncrypt();

  const [drawState, setDrawState] = useState(0);
  const [currentDrawId, setCurrentDrawId] = useState(0);
  const [nextDrawTime, setNextDrawTime] = useState(0);
  const [depositorCount, setDepositorCount] = useState(0);
  const [prizePerDraw, setPrizePerDraw] = useState("0");
  const [drawInterval, setDrawIntervalValue] = useState(0);
  const [pastDraws, setPastDraws] = useState([]);
  const [loading, setLoading] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  
  // History scanning states
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState("");
  const [rpcStatus, setRpcStatus] = useState("");

  const [ownerAddress, setOwnerAddress] = useState(null);
  const [keeperAddress, setKeeperAddress] = useState(null);

  const [fundAmount, setFundAmount] = useState("");
  const [newInterval, setNewInterval] = useState("");
  const [adminOpen, setAdminOpen] = useState(true);
  const [reserveDisplay, setReserveDisplay] = useState("🔒 Encrypted");
  const [reserveHandle, setReserveHandle] = useState(null);

  const isAdmin =
    isConnected &&
    address &&
    ((ownerAddress && address.toLowerCase() === ownerAddress.toLowerCase()) ||
      (keeperAddress && address.toLowerCase() === keeperAddress.toLowerCase()));

  const setLoad = (key, val) => setLoading((p) => ({ ...p, [key]: val }));
  const { format, isReady } = useCountdown(nextDrawTime);

  const lastKnownIds = useRef(new Set());

  // Write contract helper (Wallet instance for signing transactions)
  const getSignerPool = useCallback(async () => {
    if (!walletClient) throw new Error("Wallet not connected");
    const provider = new BrowserProvider(walletClient.transport);
    const signer = await provider.getSigner();
    return new Contract(addresses.nullYield, NullYieldABI, signer);
  }, [walletClient]);

  const loadData = useCallback(async (isManualRefresh = false) => {
    setRefreshing(true);
    if (isManualRefresh) {
      setHistoryLoading(true);
      setHistoryError("");
      setRpcStatus("Scanning draw history across RPCs…");
    }

    try {
      const provider = getReadProvider();
      const pool = new Contract(addresses.nullYield, NullYieldABI, provider);

      const [state, currentId, nextTime, count, prize, interval, owner, keeper] =
        await Promise.all([
          pool.drawState(),
          pool.currentDrawId(),
          pool.nextDrawTime(),
          pool.depositorCount(),
          pool.prizePerDraw(),
          pool.drawInterval(),
          pool.owner(),
          pool.keeper(),
        ]);

      setDrawState(Number(state));
      setCurrentDrawId(Number(currentId));
      setNextDrawTime(Number(nextTime));
      setDepositorCount(Number(count));
      setPrizePerDraw(formatUnits(prize, DECIMALS));
      setDrawIntervalValue(Number(interval));
      setOwnerAddress(owner);
      setKeeperAddress(keeper);

      try {
        const reserve = await pool.prizeReserve();
        const rh = reserve?.toString?.() ?? null;
        setReserveHandle(rh);
      } catch {
        setReserveHandle(null);
      }

      // ── HISTORY QUERY (Incremental cache + Fallback failover) ──
      const events = await queryFilterChunked(
        pool,
        pool.filters.DrawFinalized(),
        {
          fromBlock: Number(addresses.nullYieldBlock || addresses.startBlock || 0),
          forceRefresh: isManualRefresh,
          chunkSize: 2000, // smaller chunks prevent RPC range timeouts
        }
      );

      // Deduplicate strictly by drawId
      const drawMap = new Map();
      for (const e of events) {
        const drawId = Number(e.args?.drawId ?? e.args?.[0]);
        const winner = e.args?.winner ?? e.args?.[1];
        const prizeAwarded = e.args?.prizeAwarded ?? e.args?.[2] ?? 0n;

        if (!Number.isFinite(drawId) || !winner) {
          continue;
        }

        drawMap.set(drawId, {
          drawId,
          winner,
          prize: formatUnits(prizeAwarded, DECIMALS),
          blockNumber: e.blockNumber,
          txHash: e.transactionHash,
        });
      }

      const past = Array.from(drawMap.values()).sort((a, b) => b.drawId - a.drawId);
      setPastDraws(past);
      setRpcStatus(
        past.length
          ? `Loaded ${past.length} finalized draw(s)`
          : "No finalized draws found on this deployment"
      );

      // ── Winner Notification Check ──
      for (const d of past) {
        if (lastKnownIds.current.has(d.drawId)) continue;
        lastKnownIds.current.add(d.drawId);

        await maybeEmailWinner({
          connectedAddress: address,
          winner: d.winner,
          drawId: d.drawId,
          prizeAmount: d.prize,
        });
      }
    } catch (err) {
      console.error("Load error:", err);
      setHistoryError(err.message || "Failed to load draw history");
      setRpcStatus("");
    } finally {
      setHistoryLoading(false);
      setRefreshing(false);
    }
  }, [address]);

  useEffect(() => {
    loadData();
    const id = setInterval(() => loadData(false), 15000);
    return () => clearInterval(id);
  }, [loadData]);

  useEffect(() => {
    if (isAdmin && drawState !== 0) setAdminOpen(true);
  }, [isAdmin, drawState]);

  // ─── ADMIN ACTIONS ──────────────────────────────────────────────────────────

  const handleTriggerDraw = async () => {
    setLoad("trigger", true);
    try {
      const pool = await getSignerPool();
      toast.info(`Triggering Draw #${currentDrawId + 1}…`);
      const tx = await pool.triggerDraw();
      await tx.wait();
      toast.success("Draw triggered. Pool locked — continue with Reveal.");
      await loadData();
    } catch (err) {
      toast.error(friendlyError(err, "Trigger failed"));
    } finally {
      setLoad("trigger", false);
    }
  };

  const handleRevealTotal = async () => {
    if (!sdkReady) return toast.warning("FHE SDK initializing…");
    setLoad("reveal", true);
    try {
      const pool = await getSignerPool();

      toast.info("Fetching pending total handle…");
      const totalHandle = await pool.pendingTotalSharesHandle();

      toast.info("Public decrypt via Zama relayer (may take a few seconds)…");
      await new Promise((r) => setTimeout(r, 3000));

      const { clearValue, proof } = await publicDecryptHandle(totalHandle);

      toast.info(`Total ${clearValue.toString()} — submitting selection…`);
      const tx = await pool.revealTotalAndSelectWinner(
        currentDrawId,
        clearValue,
        proof
      );
      await tx.wait();
      toast.success("Winner selected — finalize to credit prize.");
      await loadData();
    } catch (err) {
      console.error(err);
      toast.error(friendlyError(err, "Reveal failed"));
    } finally {
      setLoad("reveal", false);
    }
  };

  const handleFinalize = async () => {
    if (!sdkReady) return toast.warning("FHE SDK initializing…");
    setLoad("finalize", true);
    try {
      const pool = await getSignerPool();

      toast.info("Fetching pending winner index…");
      const winnerHandle = await pool.pendingWinnerIndexHandle();

      toast.info("Public decrypt winner index…");
      await new Promise((r) => setTimeout(r, 3000));

      const { clearValue: clearWinnerIndex, proof } =
        await publicDecryptHandle(winnerHandle);

      toast.info("Finalizing on-chain…");
      const tx = await pool.finalizeDraw(
        currentDrawId,
        clearWinnerIndex,
        proof
      );
      
      const receipt = await tx.wait();

      let finalizedWinner = null;
      let finalizedDrawId = currentDrawId;
      let finalizedPrize = prizePerDraw;

      for (const log of receipt.logs) {
        try {
          const parsed = pool.interface.parseLog({
            topics: log.topics,
            data: log.data,
          });
          if (parsed?.name === "DrawFinalized") {
            finalizedDrawId = Number(parsed.args.drawId);
            finalizedWinner = parsed.args.winner;
            finalizedPrize = formatUnits(parsed.args.prizeAwarded ?? 0, DECIMALS);
            break;
          }
        } catch {
          /* skip */
        }
      }

      toast.success("Draw finalized — prize credited, pool unlocked.");
      await loadData(true); // Force refresh history to see the new draw immediately

      await maybeEmailWinner({
        connectedAddress: address,
        winner: finalizedWinner,
        drawId: finalizedDrawId,
        prizeAmount: finalizedPrize,
      });
    } catch (err) {
      console.error(err);
      toast.error(friendlyError(err, "Finalize failed"));
    } finally {
      setLoad("finalize", false);
    }
  };

  const handleFundReserve = async () => {
    if (!fundAmount || Number(fundAmount) <= 0)
      return toast.warning("Enter a valid amount");
    if (!sdkReady) return toast.warning("FHE SDK initializing…");

    setLoad("fund", true);
    try {
      toast.info("Encrypting reserve top-up…");
      const { handle, proof } = await encryptAmount(
        fundAmount,
        addresses.nullYield
      );
      const pool = await getSignerPool();
      const tx = await pool.fundPrize(handle, proof);
      await tx.wait();
      toast.success(`Funded reserve with ${fundAmount} cUSDC`);
      setFundAmount("");
      setReserveDisplay("🔒 Encrypted");
      await loadData();
    } catch (err) {
      toast.error(friendlyError(err, "Funding failed"));
    } finally {
      setLoad("fund", false);
    }
  };

  const handleDecryptReserve = async () => {
    if (!sdkReady) return toast.warning("FHE SDK not ready");
    if (isEmptyHandle(reserveHandle)) {
      setReserveDisplay("0 cUSDC");
      toast.info("Reserve appears empty");
      return;
    }
    setLoad("decryptReserve", true);
    try {
      toast.info("Sign EIP-712 to decrypt reserve…");
      const clear = await decryptHandle(reserveHandle, addresses.nullYield);
      const formatted = formatUnits(clear, DECIMALS);
      setReserveDisplay(
        `${Number(formatted).toLocaleString(undefined, {
          maximumFractionDigits: 6,
        })} cUSDC`
      );
      toast.success("Reserve decrypted");
    } catch (err) {
      toast.error(friendlyError(err, "Reserve decrypt failed"));
    } finally {
      setLoad("decryptReserve", false);
    }
  };

  const handleSetInterval = async () => {
    const seconds = Number(newInterval);
    if (!seconds || seconds <= 0)
      return toast.warning("Enter seconds (e.g. 300)");

    setLoad("interval", true);
    try {
      const pool = await getSignerPool();
      const tx = await pool.setDrawInterval(seconds);
      await tx.wait();
      toast.success(`Draw interval set to ${seconds}s`);
      setNewInterval("");
      await loadData();
    } catch (err) {
      toast.error(friendlyError(err, "Failed to update interval"));
    } finally {
      setLoad("interval", false);
    }
  };

  const stateInfo = DrawStateLabels[drawState] || DrawStateLabels[0];
  const canTrigger = isReady && drawState === 0 && depositorCount > 0;
  const nextDrawId = drawState === 0 ? currentDrawId + 1 : currentDrawId;
  const inProgress = drawState !== 0;

  return (
    <>
      <style>{`
        @keyframes shimmer {
          100% {
            transform: translateX(100%);
          }
        }
      `}</style>
      
      <main className="pt-32 pb-24 px-6 min-h-screen">
        <div className="max-w-5xl mx-auto">
          
          {/* ── HEADER ── */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent-500/10 border border-accent-500/20 mb-6 backdrop-blur-md">
              <Trophy className="w-4 h-4 text-accent-400" />
              <span className="text-xs font-mono font-bold text-accent-400 uppercase tracking-widest">
                FHE Prize Arena
              </span>
            </div>
            <h1 className="font-display font-extrabold text-5xl md:text-6xl mb-6 tracking-tight">
              Draw <span className="gradient-text">#{nextDrawId}</span>
            </h1>
            <p className="text-text-secondary text-lg max-w-xl mx-auto leading-relaxed">
              Deposit-weighted winner selection over encrypted balances. Provably
              fair, confidential, no-loss principal.
            </p>
          </motion.div>

          {/* ── HERO STATUS CARD ── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className={`card relative overflow-hidden text-center mb-10 border ${stateInfo.border}`}
          >
            <div className="absolute inset-0 bg-radial-glow opacity-20 pointer-events-none" />
            <div className="relative">
              <h2 className="text-sm font-mono font-bold text-text-muted uppercase tracking-widest mb-6 flex justify-center items-center gap-2">
                <Clock className="w-4 h-4" />
                {inProgress
                  ? "Draw in progress"
                  : isReady
                  ? "Draw window open"
                  : "Time until next draw"}
              </h2>

              <div
                className={`text-6xl md:text-8xl font-display font-extrabold mb-8 tracking-tighter ${
                  inProgress ? "text-text-muted opacity-60" : "gradient-text"
                }`}
              >
                {inProgress ? "LOCKED" : format()}
              </div>

              <div className="flex flex-wrap justify-center gap-4 mb-2">
                <StateChip
                  label="Depositors"
                  value={depositorCount}
                  icon={<Users className="w-4 h-4" />}
                />
                <StateChip
                  label="Prize"
                  value={`${Number(prizePerDraw).toLocaleString()} cUSDC`}
                  icon={<Award className="w-4 h-4" />}
                />
                <StateChip
                  label="Status"
                  value={stateInfo.label}
                  icon={<Sparkles className="w-4 h-4" />}
                />
              </div>

              {!isAdmin && (
                <div className="mt-6 inline-flex items-center gap-2 text-xs text-text-muted bg-bg-tertiary border border-border rounded-full px-4 py-2">
                  <Bot className="w-3.5 h-3.5 text-accent-400" />
                  Draws are run by an automated keeper — nothing for you to do here except watch.
                </div>
              )}
            </div>
          </motion.div>

          {/* ── IN-PROGRESS BANNER ── */}
          <AnimatePresence>
            {inProgress && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                className={`card mb-8 border ${stateInfo.border} bg-bg-card`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center shrink-0">
                    <Hourglass className="w-7 h-7 text-yellow-400 animate-pulse" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <h3 className="font-display font-bold text-xl">
                        Draw #{currentDrawId}
                      </h3>
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-mono font-bold bg-yellow-500/15 text-yellow-400 border border-yellow-500/30">
                        Pending finalization
                      </span>
                    </div>
                    <p className={`text-sm font-medium ${stateInfo.color} mb-1`}>
                      {stateInfo.label}
                    </p>
                    <p className="text-sm text-text-secondary">
                      {stateInfo.phase}. Deposits and withdrawals stay locked until
                      this draw is finalized.
                    </p>
                  </div>
                  
                  {isAdmin && (
                    <div className="shrink-0">
                      {drawState === 1 ? (
                        <button
                          type="button"
                          onClick={handleRevealTotal}
                          disabled={loading.reveal || !sdkReady}
                          className="btn-primary px-5 py-2.5"
                        >
                          {loading.reveal ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <><LockOpen className="w-4 h-4" /> Reveal total</>
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={handleFinalize}
                          disabled={loading.finalize || !sdkReady}
                          className="btn-primary px-5 py-2.5"
                        >
                          {loading.finalize ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <><Unlock className="w-4 h-4" /> Finalize</>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── ADMIN / OPERATOR PANEL ── */}
          {isAdmin && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-10"
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => setAdminOpen((o) => !o)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setAdminOpen((o) => !o);
                  }
                }}
                className="w-full card flex items-center justify-between gap-4 py-4 px-5 hover:border-accent-500/40 transition-colors text-left cursor-pointer select-none"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-accent-500/10">
                    <ShieldAlert className="w-5 h-5 text-accent-400" />
                  </div>
                  <div>
                    <h2 className="font-display font-bold text-lg">
                      Operator controls
                    </h2>
                    <p className="text-xs text-text-muted">
                      Interval, reserve, trigger · reveal · finalize
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      loadData(true);
                    }}
                    disabled={refreshing}
                    className="p-2 rounded-lg border border-border hover:border-accent-500"
                  >
                    <RefreshCw
                      className={`w-4 h-4 text-accent-400 ${
                        refreshing ? "animate-spin" : ""
                      }`}
                    />
                  </button>
                  <ChevronDown
                    className={`w-5 h-5 text-text-muted transition-transform ${
                      adminOpen ? "rotate-180" : ""
                    }`}
                  />
                </div>
              </div>

              <AnimatePresence initial={false}>
                {adminOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className="overflow-hidden"
                  >
                    <div className="pt-4 space-y-6">
                      <div className="grid md:grid-cols-3 gap-4">
                        <StateStep
                          number={1}
                          label="Trigger & freeze"
                          desc="Locks the pool and marks total shares for public decryption."
                          active={drawState === 0 && isReady}
                          done={drawState > 0}
                          action={handleTriggerDraw}
                          actionLabel="Trigger draw"
                          disabled={!canTrigger || loading.trigger}
                          loading={loading.trigger}
                          icon={<Play className="w-4 h-4" />}
                        />
                        <StateStep
                          number={2}
                          label="Reveal total"
                          desc="Decrypt pool total via KMS, then run encrypted winner scan."
                          active={drawState === 1}
                          done={drawState > 1}
                          action={handleRevealTotal}
                          actionLabel="Reveal total"
                          disabled={drawState !== 1 || loading.reveal}
                          loading={loading.reveal}
                          icon={<LockOpen className="w-4 h-4" />}
                        />
                        <StateStep
                          number={3}
                          label="Finalize"
                          desc="Decrypt winner index, credit prize, unlock deposits."
                          active={drawState === 2}
                          done={false}
                          action={handleFinalize}
                          actionLabel="Finalize draw"
                          disabled={drawState !== 2 || loading.finalize}
                          loading={loading.finalize}
                          icon={<Unlock className="w-4 h-4" />}
                        />
                      </div>

                      <div className="grid md:grid-cols-2 gap-4">
                        {/* Reserve */}
                        <div className="card">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="p-2.5 rounded-xl bg-accent-500/10">
                              <Coins className="w-5 h-5 text-accent-400" />
                            </div>
                            <div>
                              <h3 className="font-display font-semibold text-lg">
                                Prize reserve
                              </h3>
                              <p className="text-xs text-text-muted">
                                Encrypted yield · fund before draws
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-bg-tertiary border border-border mb-4">
                            <div className="min-w-0">
                              <div className="text-[10px] font-mono uppercase text-text-muted mb-0.5">
                                Balance
                              </div>
                              <div className="font-mono font-semibold text-accent-400 truncate">
                                {reserveDisplay}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={handleDecryptReserve}
                              disabled={loading.decryptReserve || !sdkReady}
                              className="btn-secondary px-3 py-2 text-xs shrink-0"
                            >
                              {loading.decryptReserve ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <><Eye className="w-3.5 h-3.5" /> Decrypt</>
                              )}
                            </button>
                          </div>

                          <input
                            type="number"
                            value={fundAmount}
                            onChange={(e) => setFundAmount(e.target.value)}
                            placeholder="Amount cUSDC"
                            className="input-field mb-3"
                          />
                          <button
                            type="button"
                            onClick={handleFundReserve}
                            disabled={loading.fund}
                            className="btn-primary w-full"
                          >
                            {loading.fund ? (
                              <><Loader2 className="w-4 h-4 animate-spin" /> Funding…</>
                            ) : (
                              "Fund reserve"
                            )}
                          </button>
                        </div>

                        {/* Interval */}
                        <div className="card">
                          <div className="flex items-center gap-3 mb-4">
                            <div className="p-2.5 rounded-xl bg-accent-500/10">
                              <Clock className="w-5 h-5 text-accent-400" />
                            </div>
                            <div>
                              <h3 className="font-display font-semibold text-lg">
                                Draw interval
                              </h3>
                              <p className="text-xs text-text-muted">
                                Now {drawInterval.toLocaleString()}s (
                                {(drawInterval / 60).toFixed(1)} min)
                              </p>
                            </div>
                          </div>
                          <input
                            type="number"
                            value={newInterval}
                            onChange={(e) => setNewInterval(e.target.value)}
                            placeholder="e.g. 300 for 5 min"
                            className="input-field mb-3"
                          />
                          <button
                            type="button"
                            onClick={handleSetInterval}
                            disabled={loading.interval}
                            className="btn-secondary w-full"
                          >
                            {loading.interval ? (
                              <><Loader2 className="w-4 h-4 animate-spin" /> Updating…</>
                            ) : (
                              "Update interval"
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ── PAST DRAWS HISTORY ── */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="card"
          >
            <div className="flex items-center justify-between gap-3 mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-accent-500/10">
                  <History className="w-6 h-6 text-accent-400" />
                </div>
                <div>
                  <h2 className="font-display font-bold text-2xl">Draw history</h2>
                  <p className="text-xs text-text-muted">
                    {rpcStatus || "Finalized draws · multi-RPC scan"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  clearLogsCache();
                  loadData(true);
                }}
                disabled={refreshing || historyLoading}
                className="p-2 rounded-xl border border-border hover:border-accent-500 transition-colors"
              >
                <RefreshCw
                  className={`w-4 h-4 text-accent-400 ${
                    refreshing || historyLoading ? "animate-spin" : ""
                  }`}
                />
              </button>
            </div>

            {historyLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="relative overflow-hidden rounded-xl border border-border bg-bg-primary/50 p-5"
                  >
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-xl bg-zinc-800/80" />
                      <div className="flex-1 space-y-2">
                        <div className="h-3 w-24 rounded bg-zinc-800/80" />
                        <div className="h-3 w-40 rounded bg-zinc-800/60" />
                      </div>
                      <div className="h-6 w-20 rounded bg-zinc-800/80" />
                    </div>
                    {/* shimmer sweep */}
                    <div
                      className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent"
                      style={{ animationDelay: `${i * 0.15}s` }}
                    />
                  </div>
                ))}
                <p className="text-center text-xs font-mono text-text-muted pt-2">
                  Checking RPCs for DrawFinalized events…
                </p>
              </div>
            ) : historyError ? (
              <div className="text-center py-12 border border-red-500/20 rounded-xl bg-red-500/5 px-4">
                <p className="text-sm text-red-300 mb-2">Couldn’t load history</p>
                <p className="text-xs text-text-muted font-mono break-all mb-4">
                  {historyError}
                </p>
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={() => {
                    clearLogsCache();
                    loadData(true);
                  }}
                >
                  Retry with RPC failover
                </button>
              </div>
            ) : pastDraws.length === 0 ? (
              <div className="text-center py-16 bg-bg-primary/50 border border-border rounded-xl">
                <Trophy className="w-12 h-12 text-text-muted mx-auto mb-4 opacity-50" />
                <p className="text-text-secondary">No finalized draws yet.</p>
              </div>
            ) : (
              <div className="space-y-3">
                <AnimatePresence>
                  {pastDraws.map((draw, i) => (
                    <motion.div
                      key={`draw-${draw.drawId}`}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(i * 0.03, 0.4) }}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-5 rounded-xl bg-bg-primary/50 border border-border hover:border-accent-500/40 transition-colors"
                    >
                      <div className="flex items-center gap-4 mb-3 sm:mb-0">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center text-bg-primary font-display font-bold text-lg">
                          #{draw.drawId}
                        </div>
                        <div>
                          <div className="text-xs text-text-muted uppercase tracking-wider mb-1 font-mono flex items-center gap-2">
                            Winner
                            <span className="px-1.5 py-0.5 rounded bg-green-500/15 text-green-400 border border-green-500/25 normal-case tracking-normal">
                              Finalized
                            </span>
                          </div>
                          <div className="font-mono text-sm text-text-primary flex items-center gap-2">
                            {draw.winner.slice(0, 8)}…{draw.winner.slice(-6)}
                            {address &&
                              draw.winner.toLowerCase() ===
                                address.toLowerCase() && (
                                <span className="px-2 py-0.5 rounded-md bg-accent-500/20 text-accent-400 text-xs font-bold border border-accent-500/30">
                                  YOU
                                </span>
                              )}
                          </div>
                        </div>
                      </div>
                      <div className="sm:text-right pl-16 sm:pl-0">
                        <div className="text-xs text-text-muted uppercase tracking-wider mb-1 font-mono">
                          Prize awarded
                        </div>
                        <div className="font-display font-bold text-accent-400 text-xl">
                          {Number(draw.prize).toLocaleString()} cUSDC
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        </div>
      </main>
    </>
  );
};

// ─── UI Helper Components ────────────────────────────────────────────────────

const StateChip = ({ label, value, icon }) => (
  <div className="flex items-center gap-2 px-4 py-2 bg-bg-tertiary border border-border rounded-xl shadow-sm">
    <span className="text-accent-400">{icon}</span>
    <span className="text-xs text-text-muted font-mono uppercase">{label}:</span>
    <span className="font-bold text-text-primary">{value}</span>
  </div>
);

const StateStep = ({
  number,
  label,
  desc,
  active,
  done,
  action,
  actionLabel,
  disabled,
  loading,
  icon,
}) => (
  <div
    className={`card flex flex-col p-5 border-2 transition-all duration-300 ${
      done
        ? "border-green-500/30 bg-green-500/5"
        : active
        ? "border-accent-500 bg-accent-500/5 shadow-[0_0_20px_rgba(240,180,41,0.08)]"
        : "border-border opacity-60"
    }`}
  >
    <div className="flex items-center gap-3 mb-3">
      <div
        className={`w-8 h-8 flex items-center justify-center rounded-lg font-display font-bold text-sm ${
          done
            ? "bg-green-500 text-bg-primary"
            : active
            ? "bg-accent-500 text-bg-primary"
            : "bg-bg-tertiary text-text-muted border border-border"
        }`}
      >
        {done ? <CheckCircle2 className="w-5 h-5" /> : number}
      </div>
      <h3
        className={`font-display font-bold text-base ${
          active ? "text-accent-400" : "text-text-primary"
        }`}
      >
        {label}
      </h3>
    </div>
    <p className="text-sm text-text-secondary mb-4 leading-relaxed flex-grow">
      {desc}
    </p>
    <button
      type="button"
      onClick={action}
      disabled={disabled || !active}
      className={`w-full py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 text-sm transition-all ${
        active && !disabled
          ? "bg-gradient-to-b from-accent-400 to-accent-600 text-bg-primary hover:shadow-[0_4px_15px_rgba(240,180,41,0.3)]"
          : "bg-bg-tertiary text-text-muted border border-border cursor-not-allowed"
      }`}
    >
      {loading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" /> Processing…
        </>
      ) : done ? (
        <>
          <CheckCircle2 className="w-4 h-4" /> Done
        </>
      ) : (
        <>
          {icon} {actionLabel}
        </>
      )}
    </button>
  </div>
);

export default Draws;