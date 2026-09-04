import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { useAccount, useWalletClient } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Contract, formatUnits, BrowserProvider } from "ethers";
import {
  Lock,
  Loader2,
  ShieldAlert,
  Eye,
  Sparkles,
  Shield,
  Coins,
} from "lucide-react";
import { Link } from "react-router-dom";

import addresses from "../contracts/addresses.json";
import RawConfidentialTokenABI from "../contracts/ConfidentialToken.json";
import RawNullYieldABI from "../contracts/NullYield.json";
import { useZamaEncrypt } from "../hooks/useZamaEncrypt";
import { toast } from "../components/Toaster";

const ConfidentialTokenABI = Array.isArray(RawConfidentialTokenABI)
  ? RawConfidentialTokenABI
  : RawConfidentialTokenABI.abi;
const NullYieldABI = Array.isArray(RawNullYieldABI)
  ? RawNullYieldABI
  : RawNullYieldABI.abi;

const DECIMALS = 6;
const EMPTY = "0x" + "0".repeat(64);
const DRAW_LABELS = ["Pool Open", "Draw Resolving", "Winner Selection"];

function isEmptyHandle(h) {
  if (h == null || h === "") return true;
  const s = String(h).toLowerCase().replace(/^0x/, "");
  return !s.length || /^0+$/.test(s);
}

const Pool = () => {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { encryptAmount, decryptHandle, sdkReady, sdkError } = useZamaEncrypt();

  const [depositAmount, setDepositAmount] = useState("");
  const [depositorCount, setDepositorCount] = useState(0);
  const [isOperator, setIsOperator] = useState(false);
  const [drawState, setDrawState] = useState(0);
  const [loading, setLoading] = useState({});

  // Wallet cUSDC (encrypted on ConfidentialToken)
  const [confHandle, setConfHandle] = useState(null);
  const [confDisplay, setConfDisplay] = useState("🔒 Encrypted");
  const [confClear, setConfClear] = useState(null); // string decimal for MAX
  const confHandleRef = useRef(null);

  const setLoad = (key, val) => setLoading((p) => ({ ...p, [key]: val }));

  const loadData = useCallback(async () => {
    if (!address || !walletClient) return;
    try {
      const provider = new BrowserProvider(walletClient.transport);
      const signer = await provider.getSigner();
      const confidentialToken = new Contract(addresses.confidentialToken, ConfidentialTokenABI, signer);
      const pool = new Contract(addresses.nullYield, NullYieldABI, signer);

      const [opStatus, count, state] = await Promise.all([
        confidentialToken.isOperator(address, addresses.nullYield).catch(() => false),
        pool.depositorCount(),
        pool.drawState(),
      ]);

      setIsOperator(Boolean(opStatus));
      setDepositorCount(Number(count));
      setDrawState(Number(state));

      let handle = null;
      try {
        if (typeof confidentialToken.confidentialBalanceOf === "function") {
          handle = await confidentialToken.confidentialBalanceOf(address);
        } else if (typeof confidentialToken.balanceOf === "function") {
          handle = await confidentialToken.balanceOf(address);
        }
      } catch {
        handle = null;
      }

      const h = handle != null ? handle.toString() : null;
      if (h !== confHandleRef.current) {
        setConfDisplay("🔒 Encrypted");
        setConfClear(null);
      }
      confHandleRef.current = h;
      setConfHandle(h);
    } catch (err) {
      console.error("Load error:", err);
    }
  }, [address, walletClient]);

  useEffect(() => {
    if (isConnected) loadData();
    const id = setInterval(loadData, 15000);
    return () => clearInterval(id);
  }, [isConnected, loadData]);

  const runDecryptConf = async () => {
    if (!sdkReady) {
      toast.warning("FHE SDK still loading");
      return null;
    }
    if (isEmptyHandle(confHandle)) {
      setConfDisplay("0 cUSDC");
      setConfClear("0");
      toast.info("No cUSDC in wallet — wrap on Faucet first");
      return "0";
    }

    setLoad("decrypt", true);
    try {
      toast.info("Sign EIP-712 to view wallet cUSDC…");
      const clear = await decryptHandle(confHandle, addresses.confidentialToken);
      const formatted = formatUnits(clear, DECIMALS);
      setConfClear(formatted);
      setConfDisplay(
        `${Number(formatted).toLocaleString(undefined, {
          maximumFractionDigits: 6,
        })} cUSDC`
      );
      toast.success("Balance decrypted");
      return formatted;
    } catch (err) {
      console.error(err);
      if (err.message?.includes("rejected") || err.code === 4001) {
        toast.warning("Signature rejected");
      } else {
        toast.error(err.message || "Decrypt failed");
      }
      return null;
    } finally {
      setLoad("decrypt", false);
    }
  };

  const handleMax = async () => {
    let clear = confClear;
    if (clear == null) {
      clear = await runDecryptConf();
    }
    if (clear == null) return;
    if (Number(clear) <= 0) {
      toast.info("Nothing to deposit — get cUSDC on Faucet");
      return;
    }
    setDepositAmount(clear);
  };

  const handleSetOperator = async () => {
    setLoad("operator", true);
    try {
      const provider = new BrowserProvider(walletClient.transport);
      const signer = await provider.getSigner();
      const confidentialToken = new Contract(addresses.confidentialToken, ConfidentialTokenABI, signer);
      const expiry = Math.min(
        Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60,
        0xffffffffffff
      );
      toast.info("Approving NullYield as operator…");
      const tx = await confidentialToken.setOperator(addresses.nullYield, expiry);
      await tx.wait();
      toast.success("Operator approved");
      await loadData();
    } catch (err) {
      toast.error(err.reason || err.shortMessage || "Operator setup failed");
    } finally {
      setLoad("operator", false);
    }
  };

  const handleDeposit = async () => {
    if (!depositAmount || Number(depositAmount) <= 0) {
      return toast.warning("Enter a valid amount");
    }
    if (!isOperator) return toast.warning("Approve operator first");
    if (drawState !== 0) return toast.warning("Pool locked during draw");
    if (!sdkReady) return toast.warning("FHE SDK initializing…");

    if (confClear != null && Number(depositAmount) > Number(confClear)) {
      return toast.warning("Amount exceeds decrypted cUSDC balance");
    }

    setLoad("deposit", true);
    try {
      toast.info("Encrypting deposit…");
      const { handle, proof } = await encryptAmount(
        depositAmount,
        addresses.nullYield
      );

      const provider = new BrowserProvider(walletClient.transport);
      const signer = await provider.getSigner();
      const pool = new Contract(addresses.nullYield, NullYieldABI, signer);

      const tx = await pool.deposit(handle, proof);
      await tx.wait();

      toast.success("Deposited — balance encrypted onchain 🔒");
      setDepositAmount("");
      setConfDisplay("🔒 Encrypted");
      setConfClear(null);
      await loadData();
    } catch (err) {
      toast.error(err.reason || err.shortMessage || err.message || "Deposit failed");
    } finally {
      setLoad("deposit", false);
    }
  };

  if (!isConnected) {
    return (
      <main className="pt-32 pb-24 px-6 min-h-screen">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <HeroHeader />
        </div>
        <div className="max-w-md mx-auto card text-center py-16">
          <Lock className="w-12 h-12 text-accent-400 mx-auto mb-4" />
          <h2 className="font-display font-bold text-2xl mb-3">Connect wallet</h2>
          <p className="text-text-secondary mb-6 text-sm">
            Connect to decrypt cUSDC and deposit into the confidential vault.
          </p>
          <div className="flex justify-center">
            <ConnectButton />
          </div>
        </div>
      </main>
    );
  }

  const canDeposit =
    isOperator && drawState === 0 && sdkReady && !loading.deposit;

  return (
    <main className="pt-32 pb-24 px-6 min-h-screen">
      <div className="max-w-2xl mx-auto">
        {/* Centered page intro */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <HeroHeader />
        </motion.div>

        {sdkError && (
          <div className="mb-6 p-4 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-300">
            FHE SDK: {sdkError}
          </div>
        )}

        {drawState !== 0 && (
          <div className="mb-6 p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/10 text-sm text-yellow-300 text-center">
            Draw in progress ({DRAW_LABELS[drawState]}). Deposits unlock when it
            finishes.
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="card relative overflow-hidden p-8 md:p-10 border-accent-500/20 shadow-2xl"
        >
          <div className="absolute inset-0 bg-radial-glow opacity-30 pointer-events-none" />

          <div className="relative">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-accent-400 to-accent-600 flex items-center justify-center mb-6 shadow-[0_0_40px_rgba(240,180,41,0.3)]">
              <Lock className="w-8 h-8 text-bg-primary" />
            </div>

            <h2 className="font-display font-extrabold text-3xl md:text-4xl text-center mb-2">
              The <span className="gradient-text">Null Vault</span>
            </h2>
            <p className="text-text-secondary text-center text-sm mb-8 max-w-md mx-auto">
              Deposit encrypted cUSDC. Odds stay private. Principal is always
              yours.
            </p>

            {/* Public stats */}
            <div className="flex justify-center gap-6 mb-8">
              <div className="text-center px-6 border-r border-border">
                <div className="text-3xl font-display font-bold text-accent-400">
                  {depositorCount}
                </div>
                <div className="text-xs text-text-muted uppercase tracking-wider font-mono">
                  Savers
                </div>
              </div>
              <div className="text-center px-6">
                <div
                  className={`text-xl font-display font-bold mt-1.5 ${
                    drawState === 0 ? "text-green-400" : "text-yellow-400"
                  }`}
                >
                  {DRAW_LABELS[drawState] ?? "—"}
                </div>
                <div className="text-xs text-text-muted uppercase tracking-wider font-mono mt-1.5">
                  Status
                </div>
              </div>
            </div>

            {/* Wallet cUSDC decrypt */}
            <div className="mb-6 p-4 rounded-2xl bg-bg-tertiary border border-border text-left">
              <div className="flex items-center justify-between gap-3 mb-1">
                <div className="flex items-center gap-2 text-xs text-text-muted font-mono uppercase tracking-wider">
                  <Coins className="w-3.5 h-3.5 text-accent-400" />
                  Wallet cUSDC
                </div>
                <button
                  type="button"
                  onClick={runDecryptConf}
                  disabled={loading.decrypt || !sdkReady}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  {loading.decrypt ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" /> Decrypt
                    </span>
                  )}
                </button>
              </div>
              <div className="font-mono font-bold text-lg text-accent-400">
                {confDisplay}
              </div>
              <p className="text-[11px] text-text-muted mt-2">
                Decrypt to confirm balance, then use MAX. Wrap mUSDC on{" "}
                <Link to="/faucet" className="text-accent-400 hover:underline">
                  Faucet
                </Link>{" "}
                first if this is 0.
              </p>
            </div>

            {/* Operator Setup */}
            {!isOperator && (
              <button
                type="button"
                onClick={handleSetOperator}
                disabled={loading.operator}
                className="btn-secondary w-full py-4 text-base mb-4 animate-pulse-glow"
              >
                {loading.operator ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <ShieldAlert className="w-5 h-5" /> Approve Null Pool operator
                  </>
                )}
              </button>
            )}

            {/* Amount + MAX input */}
            <div
              className={`bg-bg-tertiary border border-border p-4 rounded-2xl mb-6 text-left transition-opacity ${
                isOperator ? "opacity-100" : "opacity-50 pointer-events-none"
              }`}
            >
              <label className="text-xs text-text-muted font-mono uppercase tracking-wider mb-2 flex items-center justify-between">
                <span>Amount to deposit (cUSDC)</span>
                {isOperator && (
                  <button
                    type="button"
                    onClick={handleMax}
                    disabled={loading.decrypt || !sdkReady}
                    className="text-accent-400 font-bold hover:text-accent-300 disabled:opacity-40"
                  >
                    MAX
                  </button>
                )}
              </label>
              <input
                type="number"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="0.00"
                disabled={!isOperator}
                className="w-full bg-transparent text-3xl font-display font-bold outline-none placeholder:text-border disabled:cursor-not-allowed"
              />
            </div>

            <button
              type="button"
              onClick={handleDeposit}
              disabled={!canDeposit}
              className="btn-primary w-full py-4 text-lg"
            >
              {loading.deposit ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : !sdkReady ? (
                "Waiting for FHE…"
              ) : !isOperator ? (
                "Approve operator to deposit"
              ) : drawState !== 0 ? (
                "Pool locked"
              ) : (
                <>
                  <Lock className="w-5 h-5" /> Deposit encrypted
                </>
              )}
            </button>

            <div className="mt-6 pt-6 border-t border-border flex flex-col sm:flex-row justify-between gap-3 text-sm">
              <Link
                to="/faucet"
                className="text-text-muted hover:text-accent-400 transition-colors"
              >
                Need cUSDC? Faucet & wrap →
              </Link>
              <Link
                to="/account"
                className="text-text-muted hover:text-accent-400 transition-colors"
              >
                Dashboard (shares & prizes) →
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </main>
  );
};

function HeroHeader() {
  return (
    <>
      <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent-500/10 border border-accent-500/20 mb-6 backdrop-blur-md">
        <Sparkles className="w-4 h-4 text-accent-400" />
        <span className="text-xs font-mono font-bold text-accent-400 uppercase tracking-widest">
          Confidential vault
        </span>
      </div>
      <h1 className="font-display font-extrabold text-5xl md:text-6xl mb-6 tracking-tight">
        Save privately.{" "}
        <span className="gradient-text">Win fairly.</span>
      </h1>
      <p className="text-text-secondary text-lg max-w-xl mx-auto leading-relaxed mb-6">
        NullYield is a no-loss prize pool where deposit sizes stay encrypted
        onchain. Draws use FHE-weighted randomness — your principal is always
        withdrawable.
      </p>
      <div className="flex flex-wrap justify-center gap-3 text-xs font-mono text-text-muted">
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-border bg-bg-card">
          <Shield className="w-3 h-3 text-accent-400" /> No-loss principal
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-border bg-bg-card">
          <Lock className="w-3 h-3 text-accent-400" /> FHE balances
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-border bg-bg-card">
          <Eye className="w-3 h-3 text-accent-400" /> EIP-712 view only you
        </span>
      </div>
    </>
  );
}

export default Pool;