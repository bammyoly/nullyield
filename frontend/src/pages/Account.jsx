import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount, useWalletClient } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Contract, formatUnits, BrowserProvider } from "ethers";
import {
  Eye,
  EyeOff,
  Loader2,
  Trophy,
  ArrowUpFromLine,
  Lock,
  ShieldCheck,
  Coins,
  Wallet,
  History,
  RefreshCw,
  Info,
  Mail,
  X,
  Copy,
  CheckCircle2,
  Bell,
  BellOff,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { Link } from "react-router-dom";

import addresses from "../contracts/addresses.json";
import RawNullYieldABI from "../contracts/NullYield.json";
import RawConfidentialTokenABI from "../contracts/ConfidentialToken.json";
import RawMockERC20ABI from "../contracts/MockERC20.json";
import { useZamaEncrypt } from "../hooks/useZamaEncrypt";
import { toast } from "../components/Toaster";
import { queryFilterChunked } from "../lib/getLogsChunked";
import { getReadProvider } from "../lib/rpcProvider";

// Centralized Notifications Import
import {
  getNotifyEmail,
  setNotifyEmail,
  clearNotifyEmail,
  maybeEmailWinner,
} from "../lib/notifications";

const NullYieldABI = Array.isArray(RawNullYieldABI)
  ? RawNullYieldABI
  : RawNullYieldABI.abi;
const ConfidentialTokenABI = Array.isArray(RawConfidentialTokenABI)
  ? RawConfidentialTokenABI
  : RawConfidentialTokenABI.abi;
const MockERC20ABI = Array.isArray(RawMockERC20ABI)
  ? RawMockERC20ABI
  : RawMockERC20ABI.abi;

const DECIMALS = 6;
const EMPTY_HANDLE = "0x" + "0".repeat(64);

function isEmptyHandle(h) {
  if (h == null || h === "") return true;
  const s = String(h).toLowerCase().replace(/^0x/, "");
  return s.length === 0 || /^0+$/.test(s);
}

function formatCusdc(bi) {
  const n = Number(formatUnits(bi, DECIMALS));
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 6 })} cUSDC`;
}

const Account = () => {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { decryptHandle, sdkReady } = useZamaEncrypt();

  const [musdcBalance, setMusdcBalance] = useState("0");
  const [poolDisplay, setPoolDisplay] = useState("🔒 Encrypted");
  const [prizeDisplay, setPrizeDisplay] = useState("🔒 Encrypted");
  const [confWalletDisplay, setConfWalletDisplay] = useState("🔒 Encrypted");
  const [confMasked, setConfMasked] = useState(true);
  const [drawState, setDrawState] = useState(0);
  const [loading, setLoading] = useState({});
  const [myWins, setMyWins] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Depositor verification states to prevent ACL errors
  const [isDepositor, setIsDepositor] = useState(false);
  const [hasPendingPrizeHint, setHasPendingPrizeHint] = useState(false);

  const [sharesHandle, setSharesHandle] = useState(null);
  const [prizeHandle, setPrizeHandle] = useState(null);
  const [confBalHandle, setConfBalHandle] = useState(null);

  const sharesRef = useRef(null);
  const prizeRef = useRef(null);
  const confRef = useRef(null);

  // Email subscription state
  const [email, setEmail] = useState("");
  const [emailSaved, setEmailSaved] = useState(false);

  const setLoad = (k, v) => setLoading((p) => ({ ...p, [k]: v }));

  // Automatically switch email preference when switching connected wallets
  useEffect(() => {
    if (address) {
      const savedEmail = getNotifyEmail(address);
      setEmail(savedEmail);
      setEmailSaved(Boolean(savedEmail));
    } else {
      setEmail("");
      setEmailSaved(false);
    }
  }, [address]);

  // Write signer (wallet only)
  const getSigner = useCallback(async () => {
    if (!walletClient) return null;
    const provider = new BrowserProvider(walletClient.transport);
    return provider.getSigner();
  }, [walletClient]);

  const loadData = useCallback(async () => {
    if (!address) return;
    setRefreshing(true);
    try {
      const provider = getReadProvider();
      const erc20 = new Contract(addresses.mockERC20, MockERC20ABI, provider);
      const pool = new Contract(addresses.nullYield, NullYieldABI, provider);
      const confidentialToken = new Contract(
        addresses.confidentialToken,
        ConfidentialTokenABI,
        provider
      );

      const [musdc, state, shares, prize] = await Promise.all([
        erc20.balanceOf(address),
        pool.drawState(),
        pool.sharesOf(address).catch(() => null),
        pool.pendingPrizeOf(address).catch(() => null),
      ]);

      setMusdcBalance(formatUnits(musdc, DECIMALS));
      setDrawState(Number(state));

      let confHandle = null;
      try {
        if (typeof confidentialToken.confidentialBalanceOf === "function") {
          confHandle = await confidentialToken.confidentialBalanceOf(address);
        } else if (typeof confidentialToken.balanceOf === "function") {
          confHandle = await confidentialToken.balanceOf(address);
        }
      } catch {
        confHandle = null;
      }

      const sh = shares != null ? shares.toString() : null;
      const ph = prize != null ? prize.toString() : null;
      const ch = confHandle != null ? confHandle.toString() : null;

      if (sh !== sharesRef.current) setPoolDisplay("🔒 Encrypted");
      if (ph !== prizeRef.current) setPrizeDisplay("🔒 Encrypted");
      if (ch !== confRef.current) {
        setConfWalletDisplay("🔒 Encrypted");
        setConfMasked(true);
      }

      sharesRef.current = sh;
      prizeRef.current = ph;
      confRef.current = ch;
      setSharesHandle(sh);
      setPrizeHandle(ph);
      setConfBalHandle(ch);

      // Verify active pool membership
      let depositor = false;
      try {
        if (typeof pool.getDepositors === "function") {
          const list = await pool.getDepositors();
          depositor = list.some(
            (d) => d.toLowerCase() === address.toLowerCase()
          );
        }
      } catch (err) {
        console.warn("Could not fetch depositor list:", err);
        depositor = false;
      }
      setIsDepositor(depositor);

      setHasPendingPrizeHint(Boolean(ph && !isEmptyHandle(ph)));

      // RPC log optimization: Query with deployment start block
      const events = await queryFilterChunked(
        pool,
        pool.filters.DrawFinalized(),
        {
          fromBlock: Number(
            addresses.nullYieldBlock || addresses.startBlock || 0
          ),
        }
      );

      const wins = events
        .filter((e) => e.args?.winner?.toLowerCase() === address.toLowerCase())
        .map((e) => ({
          drawId: Number(e.args.drawId),
          winner: e.args.winner,
          prize: formatUnits(e.args.prizeAwarded ?? 0, DECIMALS),
          blockNumber: e.blockNumber,
          txHash: e.transactionHash,
        }))
        .sort((a, b) => b.drawId - a.drawId);

      setMyWins(wins);

      for (const w of wins) {
        await maybeEmailWinner({
          connectedAddress: address,
          winner: w.winner,
          drawId: w.drawId,
          prizeAmount: w.prize,
        });
      }
    } catch (err) {
      console.error("Account load error:", err);
    } finally {
      setRefreshing(false);
    }
  }, [address]);

  useEffect(() => {
    if (!isConnected) return;
    loadData();
    const id = setInterval(loadData, 20000);
    return () => clearInterval(id);
  }, [isConnected, loadData]);

  const handleDecrypt = async (which) => {
    if (!sdkReady) return toast.warning("FHE SDK not ready");

    if (which === "pool" && !isDepositor) {
      setPoolDisplay("0 cUSDC");
      toast.info("This wallet has no deposit in the pool.");
      return;
    }

    const map = {
      pool: {
        handle: sharesHandle,
        contract: addresses.nullYield,
        set: setPoolDisplay,
        label: "deposit",
      },
      prize: {
        handle: prizeHandle,
        contract: addresses.nullYield,
        set: setPrizeDisplay,
        label: "prize",
      },
      conf: {
        handle: confBalHandle,
        contract: addresses.confidentialToken,
        set: setConfWalletDisplay,
        label: "cUSDC wallet",
      },
    };
    const cfg = map[which];
    if (!cfg) return;

    if (isEmptyHandle(cfg.handle)) {
      cfg.set("0 cUSDC");
      if (which === "conf") setConfMasked(false);
      toast.info(`No ${cfg.label} balance to decrypt`);
      return;
    }

    setLoad(`decrypt-${which}`, true);
    try {
      toast.info("Sign EIP-712 to decrypt…");
      const clear = await decryptHandle(cfg.handle, cfg.contract);
      const display = formatCusdc(clear);
      cfg.set(display);
      if (which === "conf") setConfMasked(false);
      toast.success(`Decrypted ${cfg.label}: ${display}`);
    } catch (err) {
      console.error(err);
      const msg = err?.message || "";

      if (
        msg.includes("not authorized") ||
        msg.includes("not authorised") ||
        msg.includes("ACL") ||
        msg.includes("user decrypt handle") ||
        msg.includes("SenderNotAllowed")
      ) {
        cfg.set("0 cUSDC");
        if (which === "conf") setConfMasked(false);
        if (which === "pool") {
          toast.info("No pool deposit for this wallet — nothing to decrypt.");
        } else if (which === "prize") {
          toast.info("No pending prize for this wallet.");
        } else {
          toast.info(`No readable ${cfg.label}.`);
        }
      } else if (msg.includes("rejected") || err.code === 4001) {
        toast.warning("Signature rejected");
      } else if (msg.includes("no value") || msg.includes("allow")) {
        cfg.set("0 cUSDC");
        if (which === "conf") setConfMasked(false);
        toast.info(`No readable ${cfg.label} (0 or no access)`);
      } else {
        toast.error(msg || "Decryption failed");
      }
    } finally {
      setLoad(`decrypt-${which}`, false);
    }
  };

  const handleClaim = async () => {
    if (!walletClient) return toast.warning("Wallet not connected");
    setLoad("claim", true);
    try {
      const signer = await getSigner();
      if (!signer) throw new Error("Signer unavailable");

      const pool = new Contract(addresses.nullYield, NullYieldABI, signer);
      toast.info("Claiming pending prize → your cUSDC wallet…");
      const tx = await pool.claim();
      await tx.wait();
      toast.success("Claimed! Decrypt “Wallet cUSDC” to see winnings.");
      setPrizeDisplay("🔒 Encrypted");
      setConfWalletDisplay("🔒 Encrypted");
      setConfMasked(true);
      await loadData();
    } catch (err) {
      toast.error(err.reason || err.shortMessage || "Claim failed");
    } finally {
      setLoad("claim", false);
    }
  };

  const handleWithdraw = async () => {
    if (drawState !== 0) return toast.warning("Locked during draw");
    setLoad("withdraw", true);
    try {
      const signer = await getSigner();
      if (!signer) throw new Error("Signer unavailable");

      const pool = new Contract(addresses.nullYield, NullYieldABI, signer);
      const tx = await pool.withdraw();
      await tx.wait();
      toast.success("Principal withdrawn to cUSDC wallet");
      setPoolDisplay("🔒 Encrypted");
      setConfWalletDisplay("🔒 Encrypted");
      setConfMasked(true);
      await loadData();
    } catch (err) {
      toast.error(err.reason || err.shortMessage || "Withdraw failed");
    } finally {
      setLoad("withdraw", false);
    }
  };

  const handleSubscribe = (e) => {
    e.preventDefault();
    if (!address) return toast.warning("Connect wallet first");
    if (!email.includes("@")) return toast.warning("Enter a valid email");
    setNotifyEmail(address, email);
    setEmailSaved(true);
    toast.success("Subscribed! You'll be emailed when this wallet wins.");
  };

  const handleUnsubscribe = () => {
    if (!address) return;
    clearNotifyEmail(address);
    setEmail("");
    setEmailSaved(false);
    toast.info("Unsubscribed from win notifications");
  };

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  if (!isConnected) {
    return (
      <main className="pt-32 pb-20 px-6 min-h-screen">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md mx-auto card text-center py-16 relative overflow-hidden"
        >
          <div className="absolute inset-0 bg-radial-glow opacity-20 pointer-events-none" />
          <div className="relative">
            <div className="w-16 h-16 rounded-2xl bg-accent-500/10 border border-accent-500/20 mx-auto mb-6 flex items-center justify-center">
              <Wallet className="w-8 h-8 text-accent-400" />
            </div>
            <h2 className="font-display font-bold text-2xl mb-3">
              Connect your wallet
            </h2>
            <p className="text-text-secondary text-sm mb-8 max-w-xs mx-auto leading-relaxed">
              Access your encrypted balances, claim prizes, and manage your
              deposits privately.
            </p>
            <div className="flex justify-center">
              <ConnectButton />
            </div>
          </div>
        </motion.div>
      </main>
    );
  }

  const shortAddr = `${address.slice(0, 6)}…${address.slice(-4)}`;

  return (
    <main className="pt-32 pb-24 px-6 min-h-screen">
      <div className="max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-500/10 border border-accent-500/20 mb-4">
            <Sparkles className="w-3.5 h-3.5 text-accent-400" />
            <span className="text-[11px] font-mono font-bold text-accent-400 uppercase tracking-widest">
              My Account
            </span>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h1 className="font-display font-extrabold text-4xl md:text-5xl tracking-tight">
                <span className="gradient-text">Dashboard</span>
              </h1>
              <p className="text-text-secondary text-sm mt-2">
                Private balances · Claim winnings · Manage subscriptions
              </p>
            </div>
            <button
              type="button"
              onClick={loadData}
              disabled={refreshing}
              className="btn-secondary px-4 py-3 shrink-0 group"
              title="Refresh data"
            >
              <RefreshCw
                className={`w-5 h-5 transition-transform ${
                  refreshing ? "animate-spin" : "group-hover:rotate-90"
                }`}
              />
            </button>
          </div>
        </motion.div>

        {/* ── WALLET IDENTITY CARD ── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.05 }}
          className="card mb-6 relative overflow-hidden border-accent-500/20"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-accent-500/5 via-transparent to-transparent pointer-events-none" />
          <div className="relative flex flex-col md:flex-row md:items-center gap-4 justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center shrink-0 shadow-lg shadow-accent-500/20">
                <Wallet className="w-6 h-6 text-bg-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-mono uppercase text-text-muted tracking-widest mb-0.5">
                  Connected wallet
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-text-primary">
                    {shortAddr}
                  </span>
                  <button
                    type="button"
                    onClick={copyAddress}
                    className="p-1.5 rounded-md hover:bg-bg-tertiary text-text-muted hover:text-accent-400 transition-colors"
                    title="Copy address"
                  >
                    {copied ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {emailSaved ? (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase px-3 py-1.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/30">
                  <Bell className="w-3 h-3" /> Alerts on ({email})
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase px-3 py-1.5 rounded-full bg-bg-tertiary text-text-muted border border-border">
                  <BellOff className="w-3 h-3" /> No alerts
                </span>
              )}
              <span
                className={`inline-flex items-center gap-1.5 text-[11px] font-mono uppercase px-3 py-1.5 rounded-full border ${
                  drawState === 0
                    ? "bg-green-500/10 text-green-400 border-green-500/30"
                    : "bg-yellow-500/10 text-yellow-400 border-yellow-500/30"
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    drawState === 0 ? "bg-green-400" : "bg-yellow-400 animate-pulse"
                  }`}
                />
                {drawState === 0 ? "Pool open" : "Draw in progress"}
              </span>
            </div>
          </div>
        </motion.div>

        {/* ── BALANCE OVERVIEW GRID ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid md:grid-cols-2 gap-4 mb-6"
        >
          {/* Plaintext mUSDC */}
          <div className="card group relative overflow-hidden">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-accent-500/10">
                  <Coins className="w-4 h-4 text-accent-400" />
                </div>
                <span className="text-xs font-mono uppercase text-text-muted tracking-wider">
                  Plaintext mUSDC
                </span>
              </div>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-bg-tertiary text-text-muted border border-border">
                Public
              </span>
            </div>
            <div className="font-display font-extrabold text-4xl gradient-text mb-1">
              {Number(musdcBalance).toLocaleString(undefined, {
                maximumFractionDigits: 2,
              })}
            </div>
            <div className="text-xs text-text-muted font-mono mb-4">mUSDC</div>
            <Link
              to="/faucet"
              className="text-xs text-accent-400 inline-flex items-center gap-1 hover:gap-2 transition-all font-semibold"
            >
              Claim / wrap on Faucet
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {/* Wallet cUSDC (Confidential) */}
          <div className="card relative overflow-hidden border-accent-500/20">
            <div className="absolute inset-0 bg-gradient-to-br from-accent-500/5 to-transparent pointer-events-none" />
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-accent-500/10">
                    <Lock className="w-4 h-4 text-accent-400" />
                  </div>
                  <span className="text-xs font-mono uppercase text-text-muted tracking-wider">
                    Wallet cUSDC
                  </span>
                </div>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-accent-500/10 text-accent-400 border border-accent-500/30">
                  Confidential
                </span>
              </div>

              <div className="font-display font-extrabold text-4xl gradient-text tracking-wider mb-1 min-h-[48px] flex items-center">
                {confMasked || confWalletDisplay === "🔒 Encrypted"
                  ? "•••• ••••"
                  : confWalletDisplay}
              </div>
              <div className="text-xs text-text-muted font-mono mb-4">
                ERC-7984 encrypted balance
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  title={confMasked ? "Show hidden" : "Hide value"}
                  onClick={() => setConfMasked((m) => !m)}
                  className="p-2 rounded-lg border border-border hover:border-accent-500 text-accent-400 transition-colors"
                >
                  {confMasked ? (
                    <Eye className="w-4 h-4" />
                  ) : (
                    <EyeOff className="w-4 h-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => handleDecrypt("conf")}
                  disabled={loading["decrypt-conf"] || !sdkReady}
                  className="btn-secondary px-3 py-2 text-sm flex-1"
                >
                  {loading["decrypt-conf"] ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <span className="inline-flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5" /> Decrypt with signature
                    </span>
                  )}
                </button>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── INFO CALLOUT ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="card mb-6 border-accent-500/20 bg-accent-500/5 flex gap-3 text-sm text-text-secondary"
        >
          <Info className="w-5 h-5 text-accent-400 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <p className="text-text-primary font-semibold mb-1">
              Where is my prize?
            </p>
            <p>
              <strong className="text-text-primary">Pool deposit</strong> = principal only.{" "}
              <strong className="text-text-primary">Pending prize</strong> = winnings not yet claimed.{" "}
              <strong className="text-text-primary">Claim</strong> moves prize into your{" "}
              <strong className="text-text-primary">wallet cUSDC</strong>. After claim, pending prize correctly
              shows <strong className="text-text-primary">0</strong>.
            </p>
          </div>
        </motion.div>

        {/* ── POOL + ACTIONS GRID ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="grid md:grid-cols-2 gap-4 mb-6"
        >
          {/* Encrypted balances (pool + prize) with integrated ACL filters */}
          <div className="card space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-accent-500/10">
                <ShieldCheck className="w-4 h-4 text-accent-400" />
              </div>
              <h2 className="font-display font-semibold text-lg">
                Pool balances
              </h2>
            </div>
            <p className="text-xs text-text-muted -mt-2">
              Encrypted onchain · reveal privately per signature
            </p>

            <DecryptRow
              label="Pool deposit (principal)"
              value={isDepositor ? poolDisplay : "0 cUSDC"}
              onDecrypt={() => handleDecrypt("pool")}
              loading={loading["decrypt-pool"]}
              disabled={!sdkReady || !isDepositor}
              hint={!isDepositor ? "No deposit in pool" : undefined}
            />
            <DecryptRow
              label="Pending prize (unclaimed)"
              value={prizeDisplay}
              onDecrypt={() => handleDecrypt("prize")}
              loading={loading["decrypt-prize"]}
              disabled={!sdkReady || !hasPendingPrizeHint}
              hint={!hasPendingPrizeHint ? "No prize available" : undefined}
            />
          </div>

          {/* Actions column */}
          <div className="space-y-4">
            {/* Claim */}
            <div className="card border-accent-500/30 bg-gradient-to-br from-accent-500/10 to-transparent">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-accent-500/20">
                  <Trophy className="w-4 h-4 text-accent-400" />
                </div>
                <h2 className="font-display font-semibold text-lg">
                  Claim winnings
                </h2>
              </div>
              <p className="text-sm text-text-secondary mb-4 leading-relaxed">
                Move pending prize into your confidential cUSDC wallet.
              </p>
              <button
                type="button"
                onClick={handleClaim}
                disabled={loading.claim}
                className="btn-primary w-full"
              >
                {loading.claim ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Claiming…
                  </>
                ) : (
                  <>
                    <Trophy className="w-4 h-4" /> Claim pending prize
                  </>
                )}
              </button>
            </div>

            {/* Withdraw */}
            <div className="card border-red-500/20 bg-red-500/5">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-red-500/10">
                  <ArrowUpFromLine className="w-4 h-4 text-red-400" />
                </div>
                <h2 className="font-display font-semibold text-lg text-red-400">
                  Withdraw principal
                </h2>
              </div>
              <p className="text-sm text-text-secondary mb-4 leading-relaxed">
                Exit the pool; principal returns as cUSDC. No loss.
              </p>
              <button
                type="button"
                onClick={handleWithdraw}
                disabled={loading.withdraw || drawState !== 0}
                className="btn-secondary w-full border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
              >
                {loading.withdraw ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Withdrawing…
                  </>
                ) : drawState !== 0 ? (
                  <>
                    <Lock className="w-4 h-4" /> Locked during draw
                  </>
                ) : (
                  <>
                    <ArrowUpFromLine className="w-4 h-4" /> Withdraw full principal
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>

        {/* ── EMAIL SUBSCRIPTION ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="card mb-6"
        >
          <div className="flex items-start gap-4">
            <div className="p-2.5 rounded-xl bg-accent-500/10 shrink-0">
              <Mail className="w-5 h-5 text-accent-400" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h2 className="font-display font-semibold text-lg">
                  Win notifications
                </h2>
                {emailSaved && (
                  <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 border border-green-500/30">
                    Active for this wallet
                  </span>
                )}
              </div>
              <p className="text-sm text-text-secondary mb-4 leading-relaxed">
                Optional. Saved <strong className="text-text-primary">only in your browser</strong> for this specific wallet ({shortAddr}). We'll email
                you when this wallet wins a finalized draw.
              </p>
              <form
                onSubmit={handleSubscribe}
                className="flex flex-col sm:flex-row gap-2"
              >
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  className="input-field flex-1"
                />
                <button type="submit" className="btn-primary sm:w-36">
                  {emailSaved ? "Update" : "Subscribe"}
                </button>
                {emailSaved && (
                  <button
                    type="button"
                    onClick={handleUnsubscribe}
                    className="btn-secondary sm:w-32 border-red-500/30 text-red-400 hover:bg-red-500/10"
                  >
                    <X className="w-4 h-4" /> Off
                  </button>
                )}
              </form>
            </div>
          </div>
        </motion.div>

        {/* ── WINS HISTORY ── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="card"
        >
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-accent-500/10">
                <History className="w-6 h-6 text-accent-400" />
              </div>
              <div>
                <h2 className="font-display font-bold text-2xl">Your wins</h2>
                <p className="text-xs text-text-muted">
                  Finalized wins for this wallet · live onchain events
                </p>
              </div>
            </div>
            {myWins.length > 0 && (
              <div className="text-right shrink-0">
                <div className="text-[10px] font-mono uppercase text-text-muted tracking-widest">
                  Total wins
                </div>
                <div className="font-display font-bold text-2xl text-accent-400">
                  {myWins.length}
                </div>
              </div>
            )}
          </div>

          {myWins.length === 0 ? (
            <div className="text-center py-16 text-text-secondary border border-dashed border-border rounded-xl bg-bg-primary/40">
              <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-semibold text-text-primary mb-1">
                No wins yet
              </p>
              <p className="text-sm">
                Keep your deposit in the pool — every draw is a new chance.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {myWins.map((w, i) => (
                  <motion.div
                    key={`${w.drawId}-${w.txHash}`}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.04, 0.3) }}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-border bg-bg-tertiary hover:border-accent-500/40 hover:bg-bg-tertiary/80 transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center font-display font-bold text-bg-primary shadow-md shadow-accent-500/20 shrink-0">
                        #{w.drawId}
                      </div>
                      <div>
                        <div className="text-[10px] text-text-muted font-mono uppercase tracking-widest mb-0.5">
                          Draw win
                        </div>
                        <div className="font-semibold flex items-center gap-2 text-sm">
                          <span className="text-text-primary">Winner</span>
                          <span className="px-2 py-0.5 rounded-md bg-green-500/15 text-green-400 text-[10px] font-bold border border-green-500/30">
                            YOU
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="sm:text-right pl-16 sm:pl-0">
                      <div className="text-[10px] text-text-muted font-mono uppercase tracking-widest mb-0.5">
                        Prize awarded
                      </div>
                      <div className="font-display font-bold text-xl text-accent-400 group-hover:scale-105 transition-transform origin-right">
                        {Number(w.prize).toLocaleString()} cUSDC
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
  );
};

// ─── DECRYPT ROW COMPONENT WITH INTEGRATED HINT/DISABLE HOOKS ───
function DecryptRow({ label, value, onDecrypt, loading, disabled, hint }) {
  const isEncrypted = value === "🔒 Encrypted";
  return (
    <div className="flex items-center justify-between gap-3 p-4 rounded-xl bg-bg-tertiary border border-border hover:border-accent-500/40 transition-colors group">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] text-text-muted font-mono uppercase tracking-widest mb-1">
          {label}
        </div>
        <div
          className={`font-mono font-semibold truncate ${
            isEncrypted ? "text-text-muted" : "text-accent-400"
          }`}
        >
          {value}
        </div>
        {hint && (
          <div className="text-[10px] text-text-muted mt-1 font-sans">
            {hint}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onDecrypt}
        disabled={loading || disabled}
        title={disabled && hint ? hint : "Decrypt with EIP-712"}
        className="btn-secondary px-3 py-2 text-sm shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" /> Decrypt
          </span>
        )}
      </button>
    </div>
  );
}

export default Account;