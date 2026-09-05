import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useAccount, useWalletClient } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  Contract,
  formatUnits,
  parseUnits,
  BrowserProvider,
  JsonRpcProvider,
  MaxUint256,
} from "ethers";
import {
  Droplet,
  Coins,
  Clock,
  RefreshCw,
  Loader2,
  ShieldCheck,
  ArrowRight,
  Shield,
  Repeat,
} from "lucide-react";
import { Link } from "react-router-dom";

import addresses from "../contracts/addresses.json";
import RawMockERC20ABI from "../contracts/MockERC20.json";
import RawConfidentialTokenABI from "../contracts/ConfidentialToken.json";

import { useZamaEncrypt } from "../hooks/useZamaEncrypt";
import { useCountdown } from "../hooks/useCountdown";
import { toast } from "../components/Toaster";

// Safely resolve raw ABI array or Hardhat JSON artifact
const MockERC20ABI = Array.isArray(RawMockERC20ABI)
  ? RawMockERC20ABI
  : RawMockERC20ABI.abi;
const ConfidentialTokenABI = Array.isArray(RawConfidentialTokenABI)
  ? RawConfidentialTokenABI
  : RawConfidentialTokenABI.abi;

const FAUCET_AMOUNT_LABEL = "1,000";
const COOLDOWN_LABEL = "24 hours";
const DECIMALS = 6;

// Dedicated read RPC (Vercel env first, then reliable public fallback)
const READ_RPC =
  import.meta.env.VITE_SEPOLIA_RPC_URL ||
  "https://rpc.ankr.com/eth_sepolia";

const Faucet = () => {
  const { address, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const {
    encryptAmount,
    publicDecryptHandle,
    decryptHandle,
    sdkReady: fheReady,
  } = useZamaEncrypt();

  // Faucet state
  const [balance, setBalance] = useState("0");
  const [nextClaimTime, setNextClaimTime] = useState(0);
  const [claimLoading, setClaimLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Wrap / Unwrap state
  const [wrapTab, setWrapTab] = useState("wrap"); // "wrap" | "unwrap"
  const [wrapAmount, setWrapAmount] = useState("");
  const [unwrapAmount, setUnwrapAmount] = useState("");
  const [wrapLoading, setWrapLoading] = useState(false);
  const [unwrapLoading, setUnwrapLoading] = useState(false);

  const { format, isReady, remaining } = useCountdown(nextClaimTime);

  // Read-only provider (does not depend on wallet RPC)
  const getReadProvider = useCallback(() => {
    return new JsonRpcProvider(READ_RPC);
  }, []);

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
      const token = new Contract(addresses.mockERC20, MockERC20ABI, provider);

      const [bal, next] = await Promise.all([
        token.balanceOf(address),
        token.faucetAvailableAt(address),
      ]);

      setBalance(formatUnits(bal, DECIMALS));
      setNextClaimTime(Number(next));
    } catch (err) {
      console.error("Load error:", err);
      toast.error("Failed to load faucet data");
    } finally {
      setRefreshing(false);
    }
  }, [address, getReadProvider]);

  useEffect(() => {
    if (isConnected && address) loadData();
  }, [isConnected, address, loadData]);

  // ─── 1. Claim Faucet ────────────────────────────────────────────────────────
  const handleClaim = async () => {
    if (!isConnected) return toast.warning("Connect your wallet first");
    if (!walletClient) return toast.warning("Wallet not ready yet");
    if (!isReady) {
      return toast.warning(`Faucet locked. Try again in ${format()}`);
    }

    setClaimLoading(true);
    try {
      const signer = await getSigner();
      if (!signer) throw new Error("Signer unavailable");
      const token = new Contract(addresses.mockERC20, MockERC20ABI, signer);

      toast.info(`Claiming ${FAUCET_AMOUNT_LABEL} mUSDC...`);
      const tx = await token.faucet();
      await tx.wait();

      toast.success(
        `Claimed ${FAUCET_AMOUNT_LABEL} mUSDC! Next claim in 24 hours.`
      );
      await loadData();
    } catch (err) {
      console.error(err);
      const msg = err.reason || err.shortMessage || err.message || "";
      if (
        msg.includes("FaucetCooldownActive") ||
        msg.includes("cooldown") ||
        msg.toLowerCase().includes("faucet")
      ) {
        toast.error("This wallet already claimed within the last 24 hours.");
        await loadData();
      } else if (
        msg.includes("user rejected") ||
        err.code === "ACTION_REJECTED"
      ) {
        toast.warning("Transaction rejected");
      } else {
        toast.error(msg || "Faucet claim failed");
      }
    } finally {
      setClaimLoading(false);
    }
  };

  // ─── 2. Wrap (mUSDC -> cUSDC) ────────────────────────────────────────────────
  const handleWrap = async () => {
    if (!wrapAmount || Number(wrapAmount) <= 0) {
      return toast.warning("Enter a valid amount");
    }
    if (!walletClient) return toast.warning("Wallet not ready yet");

    setWrapLoading(true);
    try {
      const signer = await getSigner();
      if (!signer) throw new Error("Signer unavailable");

      const erc20 = new Contract(addresses.mockERC20, MockERC20ABI, signer);
      const confidentialToken = new Contract(
        addresses.confidentialToken,
        ConfidentialTokenABI,
        signer
      );
      const amount = parseUnits(wrapAmount, DECIMALS);

      // Approve underlying ERC-20
      const allowance = await erc20.allowance(
        address,
        addresses.confidentialToken
      );
      if (allowance < amount) {
        toast.info("Approving mUSDC spend...");
        const txA = await erc20.approve(
          addresses.confidentialToken,
          MaxUint256
        );
        await txA.wait();
        toast.success("Approval confirmed");
      }

      toast.info("Wrapping mUSDC → encrypted cUSDC...");
      const tx = await confidentialToken.wrap(address, amount);
      await tx.wait();

      toast.success(`Wrapped ${wrapAmount} mUSDC → cUSDC 🔒`);
      setWrapAmount("");
      await loadData();
    } catch (err) {
      console.error("Wrap error:", err);
      toast.error(
        err.reason || err.shortMessage || err.message || "Wrap failed"
      );
    } finally {
      setWrapLoading(false);
    }
  };

  // ─── Unwrap: cUSDC → mUSDC (request + finalize) ─────────────────────
  const handleUnwrap = async () => {
    if (!unwrapAmount || Number(unwrapAmount) <= 0) {
      return toast.warning("Enter a valid amount");
    }
    if (!fheReady) return toast.warning("FHE SDK initializing...");
    if (!walletClient) return toast.warning("Wallet not ready yet");

    setUnwrapLoading(true);
    try {
      const signer = await getSigner();
      if (!signer) throw new Error("Signer unavailable");

      const confidentialToken = new Contract(
        addresses.confidentialToken,
        ConfidentialTokenABI,
        signer
      );

      toast.info("Encrypting unwrap amount…");
      const { handle, proof } = await encryptAmount(
        unwrapAmount,
        addresses.confidentialToken
      );

      // Disambiguate overload — externalEuint64 + inputProof
      const unwrapFn = confidentialToken.getFunction(
        "unwrap(address,address,bytes32,bytes)"
      );

      toast.info("Submitting unwrap request…");
      const tx = await unwrapFn(address, address, handle, proof);
      const receipt = await tx.wait();

      // Parse UnwrapRequested for requestId
      let unwrapRequestId = null;
      for (const log of receipt.logs) {
        try {
          const parsed = confidentialToken.interface.parseLog({
            topics: log.topics,
            data: log.data,
          });
          if (parsed?.name === "UnwrapRequested") {
            unwrapRequestId = parsed.args.unwrapRequestId;
            break;
          }
        } catch {
          /* skip */
        }
      }

      if (!unwrapRequestId) {
        toast.warning(
          "Unwrap requested — open the tx on the explorer if mUSDC doesn’t arrive (requestId missing from receipt)."
        );
        setUnwrapAmount("");
        await loadData();
        return;
      }

      toast.info("Fetching encrypted unwrap amount…");
      const encAmount = await confidentialToken.unwrapAmount(unwrapRequestId);

      toast.info("Decrypting via Zama (for finalizeUnwrap)…");
      let clearValue;
      let decryptionProof = "0x";

      try {
        const pub = await publicDecryptHandle(encAmount);
        clearValue = pub.clearValue;
        decryptionProof = pub.proof && pub.proof !== "0x" ? pub.proof : "0x";
      } catch {
        clearValue = await decryptHandle(
          encAmount,
          addresses.confidentialToken
        );
      }

      const clearU64 = BigInt(clearValue);
      if (clearU64 > 0xffffffffffffffffn) {
        throw new Error("Amount exceeds uint64");
      }

      toast.info("Finalizing unwrap → mUSDC…");
      const tx2 = await confidentialToken.finalizeUnwrap(
        unwrapRequestId,
        clearU64,
        decryptionProof
      );
      await tx2.wait();

      toast.success(`Unwrapped ${unwrapAmount} → mUSDC`);
      setUnwrapAmount("");
      await loadData();
    } catch (err) {
      console.error("Unwrap error:", err);
      const msg = err.reason || err.shortMessage || err.message || "";
      if (msg.includes("ambiguous function")) {
        toast.error("ABI overload — use unwrap(address,address,bytes32,bytes)");
      } else if (
        msg.includes("ResolverNotFound") ||
        msg.includes("ZamaProtocol")
      ) {
        toast.error("FHE gateway/resolver issue on this network.");
      } else if (msg.includes("InvalidKMSSignatures")) {
        toast.error("Invalid decryption proof — wait and retry finalize.");
      } else {
        toast.error(msg || "Unwrap failed");
      }
    } finally {
      setUnwrapLoading(false);
    }
  };

  return (
    <main className="pt-32 pb-24 px-6 min-h-screen">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-accent-500/10 border border-accent-500/20 mb-6 backdrop-blur-md">
            <Droplet className="w-4 h-4 text-accent-400" />
            <span className="text-xs font-mono font-bold text-accent-400 uppercase tracking-widest">
              Funding Hub
            </span>
          </div>
          <h1 className="font-display font-extrabold text-5xl md:text-6xl mb-6 tracking-tight">
            Claim & <span className="gradient-text">Shield Tokens</span>
          </h1>
          <p className="text-text-secondary text-lg max-w-xl mx-auto leading-relaxed">
            Claim testnet mUSDC and wrap it into encrypted cUSDC to prepare for
            the NullYield Pool.
          </p>
        </motion.div>

        {!isConnected ? (
          <ConnectPromptPage />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="space-y-6"
          >
            {/* Balance Overview */}
            <div className="card relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-r from-accent-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                <div>
                  <div className="text-sm font-mono font-semibold text-text-muted uppercase tracking-widest mb-2 flex items-center gap-2">
                    <Coins className="w-4 h-4 text-accent-400" />
                    Plaintext Balance
                  </div>
                  <div className="flex items-baseline gap-3">
                    <span className="font-display font-extrabold text-5xl text-text-primary tracking-tight">
                      {Number(balance).toLocaleString(undefined, {
                        maximumFractionDigits: 2,
                      })}
                    </span>
                    <span className="font-mono text-xl text-accent-500 font-bold">
                      mUSDC
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={loadData}
                  disabled={refreshing}
                  className="btn-secondary px-4 py-4 rounded-xl shrink-0"
                  title="Refresh Balance"
                >
                  <RefreshCw
                    className={`w-5 h-5 ${
                      refreshing ? "animate-spin text-accent-400" : ""
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Side-by-Side Grid */}
            <div className="grid md:grid-cols-2 gap-6">
              {/* 1. Claim Faucet Card */}
              <div className="card flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 rounded-xl bg-gradient-to-br from-accent-400/20 to-accent-600/20 border border-accent-500/30">
                      <Droplet className="w-6 h-6 text-accent-400" />
                    </div>
                    <div>
                      <h2 className="font-display font-bold text-2xl text-text-primary">
                        Claim Faucet
                      </h2>
                      <p className="text-sm text-text-muted mt-1">
                        {FAUCET_AMOUNT_LABEL} mUSDC · {COOLDOWN_LABEL} limit
                      </p>
                    </div>
                  </div>

                  <div className="mb-6 p-4 rounded-xl bg-bg-primary/50 border border-border space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-medium text-text-secondary">
                        <Clock className="w-4 h-4" />
                        Status
                      </div>
                      <div
                        className={`font-mono text-sm font-bold px-3 py-1 rounded-lg ${
                          isReady
                            ? "bg-green-500/10 text-green-400 border border-green-500/20"
                            : "bg-yellow-500/10 text-yellow-400 border border-yellow-500/20"
                        }`}
                      >
                        {isReady ? "Ready to claim" : `Cooldown · ${format()}`}
                      </div>
                    </div>

                    {!isReady && remaining > 0 && (
                      <div className="pt-2 border-t border-border">
                        <div className="flex justify-between text-xs text-text-muted mb-2 font-mono">
                          <span>24h timer</span>
                          <span>{format()}</span>
                        </div>
                        <div className="h-2 rounded-full bg-bg-tertiary overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-accent-600 to-accent-400 transition-all duration-1000"
                            style={{
                              width: `${Math.max(
                                2,
                                Math.min(100, 100 - (remaining / 86400) * 100)
                              )}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <button
                    type="button"
                    onClick={handleClaim}
                    disabled={claimLoading || !isReady}
                    className="btn-primary w-full"
                  >
                    {claimLoading ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" /> Claiming...
                      </>
                    ) : !isReady ? (
                      <>
                        <Clock className="w-5 h-5" /> Available in {format()}
                      </>
                    ) : (
                      <>
                        <Droplet className="w-5 h-5" /> Claim{" "}
                        {FAUCET_AMOUNT_LABEL} mUSDC
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* 2. Wrap / Unwrap Card */}
              <div className="card flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-6 p-1 rounded-xl bg-bg-tertiary border border-border w-fit">
                    <button
                      type="button"
                      onClick={() => setWrapTab("wrap")}
                      className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                        wrapTab === "wrap"
                          ? "bg-accent-500 text-bg-primary"
                          : "text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      Wrap
                    </button>
                    <button
                      type="button"
                      onClick={() => setWrapTab("unwrap")}
                      className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                        wrapTab === "unwrap"
                          ? "bg-accent-500 text-bg-primary"
                          : "text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      Unwrap
                    </button>
                  </div>

                  {wrapTab === "wrap" ? (
                    <>
                      <h2 className="font-display font-bold text-2xl text-text-primary mb-1">
                        Shield Tokens
                      </h2>
                      <p className="text-sm text-text-muted mb-4">
                        Convert mUSDC to encrypted cUSDC (ERC-7984).
                      </p>

                      <div className="mb-4">
                        <div className="relative">
                          <input
                            type="number"
                            value={wrapAmount}
                            onChange={(e) => setWrapAmount(e.target.value)}
                            placeholder="0.0"
                            className="input-field pr-20"
                          />
                          <button
                            type="button"
                            onClick={() => setWrapAmount(balance)}
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-accent-400 hover:text-accent-300"
                          >
                            MAX
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <h2 className="font-display font-bold text-2xl text-text-primary mb-1">
                        Unshield Tokens
                      </h2>
                      <p className="text-sm text-text-muted mb-4">
                        Convert encrypted cUSDC back to mUSDC.
                      </p>

                      <div className="mb-4">
                        <input
                          type="number"
                          value={unwrapAmount}
                          onChange={(e) => setUnwrapAmount(e.target.value)}
                          placeholder="0.0"
                          className="input-field"
                        />
                      </div>
                    </>
                  )}
                </div>

                <div>
                  {wrapTab === "wrap" ? (
                    <button
                      type="button"
                      onClick={handleWrap}
                      disabled={wrapLoading}
                      className="btn-primary w-full"
                    >
                      {wrapLoading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" /> Wrapping...
                        </>
                      ) : (
                        <>
                          <Shield className="w-5 h-5" /> Wrap to cUSDC
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleUnwrap}
                      disabled={unwrapLoading || !fheReady}
                      className="btn-secondary w-full"
                    >
                      {unwrapLoading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />{" "}
                          Requesting...
                        </>
                      ) : (
                        <>
                          <Repeat className="w-5 h-5" /> Request Unwrap
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Footer Navigation CTA */}
            <div className="card bg-accent-500/5 border-accent-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="w-5 h-5 text-accent-400 shrink-0" />
                <span className="text-sm text-text-secondary">
                  Ready with encrypted cUSDC? Head over to the vault to deposit.
                </span>
              </div>
              <Link to="/pool" className="btn-primary shrink-0 py-2.5 px-5">
                Go to Vault <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </motion.div>
        )}
      </div>
    </main>
  );
};

const ConnectPromptPage = () => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    transition={{ duration: 0.5 }}
    className="card text-center py-20 max-w-xl mx-auto"
  >
    <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-accent-400 to-accent-600 mx-auto mb-8 flex items-center justify-center shadow-xl">
      <Droplet className="w-10 h-10 text-bg-primary" strokeWidth={2.5} />
    </div>
    <h2 className="font-display font-extrabold text-3xl md:text-4xl mb-4 text-text-primary">
      Wallet Required
    </h2>
    <p className="text-text-secondary text-lg mb-8 max-w-sm mx-auto">
      Connect a wallet to claim testnet mUSDC and manage token shielding.
    </p>
    <div className="flex justify-center">
      <ConnectButton />
    </div>
  </motion.div>
);

export default Faucet;