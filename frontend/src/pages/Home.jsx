import { useState, useEffect, useCallback, useRef } from "react";
import {
  motion,
  AnimatePresence,
  useScroll,
  useTransform,
  useSpring,
  useMotionValue,
  animate,
} from "framer-motion";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Link, useLocation } from "react-router-dom";
import { Contract, JsonRpcProvider, formatUnits } from "ethers";
import {
  Lock,
  Zap,
  Shield,
  Trophy,
  ArrowRight,
  Sparkles,
  Eye,
  EyeOff,
  Coins,
  Users,
  TrendingUp,
  ChevronDown,
  ShieldCheck,
  HelpCircle,
  BookOpen,
  Droplet,
} from "lucide-react";

import addresses from "../contracts/addresses.json";
import RawNullYieldABI from "../contracts/NullYield.json";

const NullYieldABI = Array.isArray(RawNullYieldABI)
  ? RawNullYieldABI
  : RawNullYieldABI.abi;

const READ_RPC =
  import.meta.env.VITE_SEPOLIA_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";

// ── shared easing / variants ──────────────────────────────────
const EASE = [0.16, 1, 0.3, 1];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE, delay: i * 0.08 },
  }),
};

// ── pointer spotlight helper (senior-touch micro-interaction) ──
// Pointer-only so it never fires on touch devices.
const useSpotlight = () => {
  const onMove = useCallback((e) => {
    if (e.pointerType && e.pointerType !== "mouse") return;
    const el = e.currentTarget;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, []);
  return onMove;
};

const Home = () => {
  const { isConnected } = useAccount();
  const location = useLocation();

  // Smooth scroll to #hash targets
  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.replace("#", "");
    const t = setTimeout(() => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => clearTimeout(t);
  }, [location.hash, location.pathname]);

  return (
    <main className="pt-20 sm:pt-24 overflow-x-hidden">
      <ScrollProgress />
      <HeroSection isConnected={isConnected} />
      <StatsSection />
      <FeaturesSection />
      <HowItWorksSection />
      <FaqSection />
      <CTASection isConnected={isConnected} />
    </main>
  );
};

// ═══════════════════════════════════════════════════════════════
// Scroll progress bar
// ═══════════════════════════════════════════════════════════════

const ScrollProgress = () => {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });
  return (
    <motion.div
      style={{ scaleX }}
      className="fixed top-0 left-0 right-0 z-50 h-[3px] origin-left bg-gradient-to-r from-accent-300 via-accent-400 to-accent-600"
    />
  );
};

// ═══════════════════════════════════════════════════════════════
// Hero
// ═══════════════════════════════════════════════════════════════

const HeroSection = ({ isConnected }) => {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const yParallax = useTransform(scrollYProgress, [0, 1], [0, 140]);
  const opacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  const container = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.12, delayChildren: 0.15 },
    },
  };
  const item = fadeUp;

  return (
    <section
      ref={ref}
      className="relative min-h-[88svh] md:min-h-[94vh] flex items-center justify-center px-5 sm:px-6 py-16 sm:py-20"
    >
      {/* background layers */}
      <div className="pointer-events-none absolute inset-0 bg-grid-pattern bg-[size:40px_40px] sm:bg-[size:60px_60px] opacity-50" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-mesh" />

      <motion.div
        aria-hidden
        animate={{ y: [0, -20, 0], x: [0, 14, 0] }}
        transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-20 -left-24 w-72 h-72 sm:w-[28rem] sm:h-[28rem] rounded-full bg-accent-500/10 blur-[90px] sm:blur-[100px]"
      />
      <motion.div
        aria-hidden
        animate={{ y: [0, 24, 0], x: [0, -18, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-0 -right-32 w-80 h-80 sm:w-[32rem] sm:h-[32rem] rounded-full bg-accent-400/10 blur-[100px] sm:blur-[110px]"
      />
      <div className="pointer-events-none absolute inset-x-0 top-1/3 mx-auto h-64 w-64 md:h-96 md:w-96 rounded-full bg-accent-500/15 blur-[110px] sm:blur-[120px]" />

      {/* floating encrypted glyphs (desktop only) */}
      <FloatingGlyphs />

      <motion.div
        style={{ y: yParallax, opacity }}
        variants={container}
        initial="hidden"
        animate="visible"
        className="relative w-full max-w-6xl mx-auto text-center z-10"
      >
        <motion.div variants={item} className="mb-6 sm:mb-8">
          <div className="group relative inline-flex max-w-full items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-accent-500/10 border border-accent-500/30 backdrop-blur overflow-hidden shine">
            <span className="relative flex h-2 w-2 shrink-0">
              <span className="live-dot absolute inline-flex h-2 w-2 rounded-full bg-accent-400" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-400" />
            </span>
            <Sparkles className="w-3.5 h-3.5 text-accent-400 shrink-0" />
            <span className="text-xs sm:text-sm font-mono font-medium text-accent-300 truncate">
              Zama fhEVM · ERC-7984 · Sepolia
            </span>
          </div>
        </motion.div>

        <motion.h1
          variants={item}
          className="font-display font-extrabold text-[2.5rem] leading-[1.08] sm:text-6xl md:text-7xl lg:text-8xl sm:leading-[1.02] tracking-tight mb-5 sm:mb-6 text-balance"
        >
          Save privately.{" "}
          <span className="relative inline-block">
            <span className="gradient-text-animated">Win fairly.</span>
            <motion.span
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ duration: 1, delay: 0.9, ease: "easeOut" }}
              className="absolute -bottom-1.5 sm:-bottom-2 left-0 right-0 h-1 bg-gradient-to-r from-accent-400 to-accent-600 origin-left rounded-full"
            />
          </span>
        </motion.h1>

        <motion.p
          variants={item}
          className="text-base sm:text-lg md:text-xl text-text-secondary max-w-md sm:max-w-2xl md:max-w-3xl mx-auto mb-8 sm:mb-10 leading-relaxed text-pretty"
        >
          NullYield is a{" "}
          <span className="text-accent-400 font-semibold">
            confidential no-loss prize savings pool
          </span>
          . Your deposit size and pool balance stay encrypted onchain. Winners
          are picked by{" "}
          <span className="font-semibold">onchain FHE randomness</span> weighted
          by deposit size. Principal is always yours to withdraw.
        </motion.p>

        <motion.div
          variants={item}
          className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 mb-10 sm:mb-14 w-full max-w-sm sm:max-w-none mx-auto"
        >
          <Link
            to="/pool"
            className="btn-primary group text-base shine w-full sm:w-auto"
          >
            Enter the Vault
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>

          <Link
            to="/faucet"
            className="btn-secondary text-base w-full sm:w-auto"
          >
            <Droplet className="w-4 h-4" /> Get test tokens
          </Link>
        </motion.div>

        {/* Trust items — scrolling marquee */}
        <motion.div variants={item} className="relative mask-fade-x">
          <div className="flex w-max animate-marquee gap-x-6 sm:gap-x-8 hover:[animation-play-state:paused]">
            {[...TRUST_ITEMS, ...TRUST_ITEMS].map((t, i) => (
              <TrustItem key={i} icon={t.icon} text={t.text} />
            ))}
          </div>
        </motion.div>
      </motion.div>

      {/* scroll cue — hidden on small screens to avoid crowding */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.6 }}
        className="hidden sm:block absolute bottom-6 left-1/2 -translate-x-1/2 text-text-muted"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
          className="flex flex-col items-center gap-1"
        >
          <span className="text-[10px] uppercase tracking-[0.25em] font-mono">
            Scroll
          </span>
          <ChevronDown className="w-4 h-4" />
        </motion.div>
      </motion.div>
    </section>
  );
};

const TRUST_ITEMS = [
  { icon: <Shield className="w-4 h-4" />, text: "No-loss principal" },
  { icon: <Lock className="w-4 h-4" />, text: "FHE encrypted balances" },
  { icon: <Zap className="w-4 h-4" />, text: "Onchain deposit-weighted draws" },
  { icon: <Eye className="w-4 h-4" />, text: "EIP-712 user decryption" },
];

const TrustItem = ({ icon, text }) => (
  <div className="flex items-center gap-2 text-text-muted text-xs sm:text-sm whitespace-nowrap">
    <div className="text-accent-500">{icon}</div>
    <span className="font-medium">{text}</span>
    <span className="text-border-light px-1 sm:px-2">•</span>
  </div>
);

// floating ciphertext-style glyphs behind the hero
const FloatingGlyphs = () => {
  const glyphs = [
    { t: "euint64", x: "8%", y: "22%", d: 0, s: "text-sm" },
    { t: "0x9f…c4", x: "84%", y: "30%", d: 1.5, s: "text-xs" },
    { t: "FHE.rem()", x: "14%", y: "70%", d: 0.8, s: "text-sm" },
    { t: "encrypted", x: "78%", y: "68%", d: 2.2, s: "text-xs" },
    { t: "ERC-7984", x: "50%", y: "16%", d: 1.1, s: "text-xs" },
  ];
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 hidden md:block"
    >
      {glyphs.map((g) => (
        <motion.span
          key={g.t}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.5, 0], y: [0, -18, 0] }}
          transition={{
            duration: 7,
            delay: g.d,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{ left: g.x, top: g.y }}
          className={`absolute font-mono ${g.s} text-accent-500/30 select-none`}
        >
          {g.t}
        </motion.span>
      ))}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// Animated number
// ═══════════════════════════════════════════════════════════════

const CountUp = ({ value, className }) => {
  const ref = useRef(null);
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    const controls = animate(mv, value, {
      duration: 1.2,
      ease: EASE,
      onUpdate: (v) => setDisplay(Math.round(v).toLocaleString()),
    });
    return controls.stop;
  }, [value, mv]);

  return (
    <span ref={ref} className={className}>
      {display}
    </span>
  );
};

// ═══════════════════════════════════════════════════════════════
// Live stats (read-only RPC, no wallet needed)
// ═══════════════════════════════════════════════════════════════

const StatsSection = () => {
  const [depositors, setDepositors] = useState(null);
  const [drawsDone, setDrawsDone] = useState(null);
  const [prizePerDraw, setPrizePerDraw] = useState(null);
  const [loading, setLoading] = useState(true);
  const onMove = useSpotlight();

  const load = useCallback(async () => {
    try {
      const provider = new JsonRpcProvider(READ_RPC);
      const pool = new Contract(addresses.nullYield, NullYieldABI, provider);

      const [count, drawId, prize, state] = await Promise.all([
        pool.depositorCount(),
        pool.currentDrawId(),
        pool.prizePerDraw(),
        pool.drawState(),
      ]);

      const drawIdNum = Number(drawId);
      const finalized =
        Number(state) === 0 ? drawIdNum : Math.max(0, drawIdNum - 1);

      setDepositors(Number(count));
      setDrawsDone(finalized);
      setPrizePerDraw(Number(formatUnits(prize, 6)));
    } catch (err) {
      console.warn("Home stats load failed:", err.message);
      setDepositors(0);
      setDrawsDone(0);
      setPrizePerDraw(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, 20000);
    return () => clearInterval(id);
  }, [load]);

  const stats = [
    {
      label: "Total value pooled",
      encrypted: true,
      subvalue: "Encrypted onchain",
      icon: <Coins className="w-5 h-5" />,
    },
    {
      label: "Active depositors",
      number: depositors ?? 0,
      subvalue: "Unique wallets in the pool",
      icon: <Users className="w-5 h-5" />,
    },
    {
      label: "Prize per draw",
      number: prizePerDraw ?? 0,
      subvalue: "cUSDC (from encrypted reserve)",
      icon: <Trophy className="w-5 h-5" />,
    },
    {
      label: "Draws completed",
      number: drawsDone ?? 0,
      subvalue: "Finalized on Sepolia",
      icon: <TrendingUp className="w-5 h-5" />,
    },
  ];

  return (
    <section className="py-14 sm:py-20 px-5 sm:px-6 relative">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6 sm:mb-8 flex items-center justify-center gap-2 text-[11px] sm:text-xs font-mono text-text-muted text-center">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="live-dot absolute inline-flex h-2 w-2 rounded-full bg-accent-400" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-400" />
          </span>
          Live from Sepolia · refreshes every 20s
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              onPointerMove={onMove}
              whileHover={{ y: -6 }}
              className="card spotlight-card glow-border group relative overflow-hidden !p-4 sm:!p-6 md:!p-8"
            >
              <div className="relative">
                <div className="flex items-center justify-between mb-2.5 sm:mb-3">
                  <div className="p-2 rounded-lg bg-accent-500/10 text-accent-400 group-hover:bg-accent-500/20 transition-colors">
                    {stat.icon}
                  </div>
                </div>
                <div className="font-display font-extrabold text-2xl sm:text-3xl gradient-text mb-1 truncate">
                  {stat.encrypted ? (
                    <span className="inline-flex items-center gap-2">
                      <Lock className="w-6 h-6 text-accent-400 shrink-0" />
                    </span>
                  ) : loading ? (
                    <span className="inline-block h-7 sm:h-8 w-14 sm:w-16 rounded bg-accent-500/10 animate-pulse align-middle" />
                  ) : (
                    <CountUp value={stat.number} />
                  )}
                </div>
                <div className="text-xs sm:text-sm text-text-secondary leading-snug">
                  {stat.label}
                </div>
                <div className="text-[10px] sm:text-xs text-text-muted font-mono mt-1 leading-snug">
                  {stat.subvalue}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ═══════════════════════════════════════════════════════════════
// Features
// ═══════════════════════════════════════════════════════════════

const FeaturesSection = () => {
  const onMove = useSpotlight();
  const features = [
    {
      icon: <EyeOff className="w-6 h-6" />,
      title: "Encrypted balances by default",
      description:
        "Individual deposit amounts and pool shares are stored as encrypted euint64 values via ERC-7984. Not even the pool owner or validators can read your balance.",
    },
    {
      icon: <ShieldCheck className="w-6 h-6" />,
      title: "True no-loss guarantee",
      description:
        "Your principal is stored in encrypted _shares. Prizes come from a separate encrypted reserve. You can withdraw your full principal whenever the pool is idle.",
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: "Onchain FHE-weighted draws",
      description:
        "Winner selection uses FHE.randEuint64 + FHE.rem against a KMS-verified pool total, then an oblivious scan over encrypted shares. Weighted, unbiased, unmanipulable.",
    },
    {
      icon: <Trophy className="w-6 h-6" />,
      title: "Winner-only prize decryption",
      description:
        "Prizes are credited as encrypted _pendingPrize. Only the winner can decrypt and claim via EIP-712 signature — losers never learn how close they were.",
    },
  ];

  return (
    <section className="py-14 sm:py-20 px-5 sm:px-6 relative">
      <div className="max-w-6xl mx-auto">
        <SectionHeader
          eyebrow="Features"
          title={
            <>
              Privacy meets <span className="gradient-text">DeFi</span>
            </>
          }
          subtitle="Built on Zama's fhEVM and OpenZeppelin's ERC-7984, NullYield removes the privacy vs. transparency trade-off in onchain savings."
        />

        <div className="grid sm:grid-cols-2 gap-4 sm:gap-6">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              custom={i}
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              onPointerMove={onMove}
              whileHover={{ y: -6 }}
              className="card spotlight-card glow-border group cursor-default !p-5 sm:!p-6 md:!p-8"
            >
              <div className="flex gap-4">
                <div className="shrink-0">
                  <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-b from-accent-400 to-accent-600 flex items-center justify-center text-bg-primary group-hover:scale-110 group-hover:rotate-6 transition-transform shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
                    {feature.icon}
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="font-display font-semibold text-lg sm:text-xl mb-2 group-hover:text-accent-400 transition-colors">
                    {feature.title}
                  </h3>
                  <p className="text-sm sm:text-base text-text-secondary leading-relaxed">
                    {feature.description}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

// ═══════════════════════════════════════════════════════════════
// How it works
// ═══════════════════════════════════════════════════════════════

const HowItWorksSection = () => {
  const onMove = useSpotlight();
  const steps = [
    {
      number: "01",
      title: "Claim & wrap",
      description:
        "Claim testnet mUSDC once every hour, approve ConfidentialToken, then wrap into confidential cUSDC (ERC-7984).",
      to: "/faucet",
      cta: "Open faucet",
      icon: <Droplet className="w-5 h-5" />,
    },
    {
      number: "02",
      title: "Deposit encrypted",
      description:
        "Approve NullYield as an operator on cUSDC. The dApp encrypts your amount client-side using the Zama SDK before it hits the pool.",
      to: "/pool",
      cta: "Open vault",
      icon: <EyeOff className="w-5 h-5" />,
    },
    {
      number: "03",
      title: "Onchain FHE draw",
      description:
        "The operator runs a 3-step KMS-verified draw. FHE randomness selects a winner over encrypted shares, weighted by deposit size.",
      to: "/draws",
      cta: "See draws",
      icon: <Zap className="w-5 h-5" />,
    },
    {
      number: "04",
      title: "Claim & withdraw",
      description:
        "Winner decrypts their pending prize via EIP-712 and claims. Anyone can withdraw full principal when the pool is idle.",
      to: "/account",
      cta: "Go to dashboard",
      icon: <Trophy className="w-5 h-5" />,
    },
  ];

  return (
    <section
      id="how-it-works"
      className="py-14 sm:py-20 px-5 sm:px-6 relative scroll-mt-24"
    >
      <div className="max-w-6xl mx-auto">
        <SectionHeader
          eyebrow="Protocol flow"
          title={
            <>
              How <span className="gradient-text">NullYield</span> works
            </>
          }
          subtitle="Four confidential, fully-onchain steps from your first deposit to your first win."
        />

        <div className="relative">
          {/* animated connecting line */}
          <div className="hidden lg:block absolute top-16 left-[12.5%] right-[12.5%] h-px bg-border/60 overflow-hidden">
            <motion.div
              initial={{ x: "-100%" }}
              whileInView={{ x: "100%" }}
              viewport={{ once: true }}
              transition={{ duration: 2, ease: "easeInOut", delay: 0.4 }}
              className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-transparent via-accent-400 to-transparent"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
            {steps.map((step, i) => (
              <motion.div
                key={step.number}
                custom={i}
                variants={fadeUp}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
                onPointerMove={onMove}
                whileHover={{ y: -6 }}
                className="relative"
              >
                <div className="card spotlight-card glow-border h-full group flex flex-col !p-5 sm:!p-6 md:!p-8">
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <div className="font-display font-extrabold text-4xl sm:text-5xl gradient-text opacity-50 group-hover:opacity-100 transition-opacity">
                      {step.number}
                    </div>
                    <div className="w-10 h-10 rounded-xl bg-accent-500/10 text-accent-400 flex items-center justify-center group-hover:bg-accent-500/20 group-hover:scale-110 transition-all">
                      {step.icon}
                    </div>
                  </div>
                  <h3 className="font-display font-semibold text-lg sm:text-xl mb-2 sm:mb-3">
                    {step.title}
                  </h3>
                  <p className="text-text-secondary leading-relaxed text-sm mb-4 flex-1">
                    {step.description}
                  </p>
                  <Link
                    to={step.to}
                    className="text-sm font-semibold text-accent-400 hover:text-accent-300 inline-flex items-center gap-1 mt-auto group/link"
                  >
                    {step.cta}
                    <ArrowRight className="w-3.5 h-3.5 group-hover/link:translate-x-1 transition-transform" />
                  </Link>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

// ═══════════════════════════════════════════════════════════════
// FAQ
// ═══════════════════════════════════════════════════════════════

const FAQ_ITEMS = [
  {
    q: "Is my principal ever at risk?",
    a: "No. Principal is stored as encrypted per-user shares. Prizes come from a separate encrypted reserve. Withdraw always returns your full principal when the pool is idle. This is NullYield's core no-loss invariant.",
  },
  {
    q: "Who can see my deposit amount?",
    a: "Nobody. Amounts are encrypted client-side via the Zama SDK, stored as euint64, and never revealed. Only you can decrypt your own balance and pending prize via EIP-712.",
  },
  {
    q: "How are winners selected fairly?",
    a: "Onchain. Once per draw the pool total is decrypted through Zama's KMS with a signature check. We then compute FHE.rem(FHE.randEuint64(), clearTotal) and run an oblivious scan over encrypted shares. Odds equal each depositor's share / total — deposit-weighted and unmanipulable.",
  },
  {
    q: "What does NullYield leak?",
    a: "Only what's strictly necessary: depositor addresses (needed for the scan), the aggregate pool total once per draw (needed for unbiased math), and the winner address on finalize (needed to route the prize). Individual balances, losers' amounts, and per-user odds never leak.",
  },
  {
    q: "Do I need real ETH?",
    a: "Only Sepolia ETH for gas. All balances in the pool are testnet mUSDC / cUSDC. Use the faucet on /faucet to get started (one claim per wallet per 24hrs).",
  },
  {
    q: "What happens if a draw doesn't get triggered on time?",
    a: "The timer just stays at 'Draw window open'. NullYield never queues overlapping draws — the operator runs one draw end-to-end (Trigger → Reveal → Finalize), then a fresh interval starts. Deposits and withdrawals unlock immediately after finalize.",
  },
  {
    q: "Who runs the draws?",
    a: "Currently the pool owner runs draws from the operator panel. An unattended keeper that runs automatically using the Zama Node SDK is on the roadmap.",
  },
  {
    q: "Can I unwrap cUSDC back to mUSDC?",
    a: "Yes — ConfidentialToken.unwrap opens an unwrap request that is finalized by a gateway callback (finalizeUnwrap). Until the gateway settles, your value stays safely in confidential cUSDC.",
  },
];

const FaqSection = () => {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <section
      id="faqs"
      className="py-14 sm:py-20 px-5 sm:px-6 relative scroll-mt-24"
    >
      <div className="max-w-3xl mx-auto">
        <SectionHeader
          eyebrow="FAQ"
          title={
            <>
              Answers,{" "}
              <span className="gradient-text">without the fine print</span>
            </>
          }
          subtitle="Everything you need to know before your first encrypted deposit."
        />

        <div className="space-y-2.5 sm:space-y-3">
          {FAQ_ITEMS.map((item, i) => {
            const isOpen = openIndex === i;
            return (
              <motion.div
                key={item.q}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, delay: i * 0.05 }}
                className={`card p-0 overflow-hidden transition-colors ${
                  isOpen
                    ? "border-accent-500/40 shadow-[0_0_25px_rgba(240,180,41,0.08)]"
                    : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? -1 : i)}
                  className="w-full flex items-center justify-between gap-3 sm:gap-4 p-4 sm:p-5 text-left"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <div
                      className={`p-2 rounded-lg shrink-0 transition-colors ${
                        isOpen
                          ? "bg-accent-500/20 text-accent-300"
                          : "bg-accent-500/10 text-accent-400"
                      }`}
                    >
                      <HelpCircle className="w-4 h-4" />
                    </div>
                    <h3 className="font-display font-semibold text-sm sm:text-base md:text-lg">
                      {item.q}
                    </h3>
                  </div>
                  <ChevronDown
                    className={`w-5 h-5 text-text-muted shrink-0 transition-transform duration-300 ${
                      isOpen ? "rotate-180 text-accent-400" : ""
                    }`}
                  />
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="content"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 sm:px-5 pb-4 sm:pb-5 pt-0 text-text-secondary leading-relaxed text-sm">
                        <div className="pl-4 sm:pl-11 border-l border-accent-500/20 ml-1">
                          {item.a}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

// ═══════════════════════════════════════════════════════════════
// CTA
// ═══════════════════════════════════════════════════════════════

const CTASection = ({ isConnected }) => {
  const onMove = useSpotlight();
  return (
    <section className="py-14 sm:py-20 px-5 sm:px-6 relative">
      <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          onPointerMove={onMove}
          className="spotlight-card relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-br from-bg-card to-bg-tertiary border border-accent-500/20 p-7 sm:p-10 md:p-14 text-center"
        >
          <div className="absolute inset-0 bg-radial-glow opacity-40 pointer-events-none" />
          <div className="pointer-events-none absolute inset-0 bg-grid-pattern bg-[size:40px_40px] opacity-30" />

          <div className="relative">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
              className="inline-block mb-5 sm:mb-6"
            >
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-b from-accent-400 to-accent-600 flex items-center justify-center animate-pulse-glow shadow-[inset_0_1px_0_rgba(255,255,255,0.35)]">
                <Lock
                  className="w-7 h-7 sm:w-8 sm:h-8 text-bg-primary"
                  strokeWidth={2.5}
                />
              </div>
            </motion.div>

            <h2 className="font-display font-extrabold text-2xl sm:text-3xl md:text-5xl mb-3 sm:mb-4 text-balance">
              Ready to save{" "}
              <span className="gradient-text-animated">privately?</span>
            </h2>
            <p className="text-text-secondary text-base sm:text-lg mb-7 sm:mb-8 max-w-xl mx-auto text-pretty">
              Grab test mUSDC on the faucet, wrap it, deposit encrypted into the
              vault, and enter your first prize draw — no loss, no leaks.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 w-full max-w-sm sm:max-w-none mx-auto">
              <Link to="/pool" className="btn-primary group shine w-full sm:w-auto">
                Enter the Vault
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link to="/faucet" className="btn-secondary w-full sm:w-auto">
                <Droplet className="w-4 h-4" /> Get test tokens
              </Link>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};


// ═══════════════════════════════════════════════════════════════
// Shared header
// ═══════════════════════════════════════════════════════════════

const SectionHeader = ({ eyebrow, title, subtitle }) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true }}
    transition={{ duration: 0.5 }}
    className="text-center mb-10 sm:mb-14"
  >
    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-500/10 border border-accent-500/20 mb-4">
      <span className="text-xs font-mono text-accent-400 uppercase tracking-widest">
        {eyebrow}
      </span>
    </div>
    <h2 className="font-display font-extrabold text-3xl sm:text-4xl md:text-5xl mb-3 sm:mb-4 leading-tight text-balance">
      {title}
    </h2>
    <p className="text-text-secondary text-base sm:text-lg max-w-2xl mx-auto text-pretty">
      {subtitle}
    </p>
  </motion.div>
);

export default Home;