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
  DollarSign,
  PiggyBank,
} from "lucide-react";
import { FaGithub, FaXTwitter } from "react-icons/fa6";

import addresses from "../contracts/addresses.json";
import RawNullYieldABI from "../contracts/NullYield.json";

const NullYieldABI = Array.isArray(RawNullYieldABI)
  ? RawNullYieldABI
  : RawNullYieldABI.abi;

const READ_RPC =
  import.meta.env.VITE_SEPOLIA_RPC_URL ||
  "https://ethereum-sepolia-rpc.publicnode.com";

const EASE = [0.16, 1, 0.3, 1];

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, ease: EASE, delay: i * 0.08 },
  }),
};

// Pointer spotlight utility
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

// Trust markers
const TRUST_ITEMS = [
  { icon: <Shield className="w-4 h-4" />, text: "No-loss principal" },
  { icon: <Lock className="w-4 h-4" />, text: "FHE encrypted balances" },
  { icon: <Zap className="w-4 h-4" />, text: "Onchain deposit-weighted draws" },
  { icon: <Eye className="w-4 h-4" />, text: "EIP-712 user decryption" },
];

const Home = () => {
  const { isConnected } = useAccount();
  const location = useLocation();

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
// Scroll progress
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
// Continuous Scramble Text Effect
// ═══════════════════════════════════════════════════════════════

const ScrambleText = ({ text, className }) => {
  const [output, setOutput] = useState(text);
  const chars = "!<>-_\\/[]{}—=+*^?#________abcdefgh0123456789";

  useEffect(() => {
    let frame = 0;
    let isScrambling = true;
    let rafId;
    let timeoutId;

    const loop = () => {
      if (!isScrambling) return;

      const scrambled = text
        .split("")
        .map((char, i) => {
          if (char === " ") return " ";
          // Reveal letters progressively
          if (frame > i * 4 + 15) return text[i];
          return chars[Math.floor(Math.random() * chars.length)];
        })
        .join("");

      setOutput(scrambled);
      frame++;

      if (frame > text.length * 4 + 15) {
        isScrambling = false;
        setOutput(text);

        // How long "privately" stays clear before scrambling again
        timeoutId = setTimeout(() => {
          isScrambling = true;
          frame = 0;
          rafId = requestAnimationFrame(loop);
        }, 10000); // ← increase this
      } else {
        rafId = requestAnimationFrame(loop);
      }
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
    };
  }, [text]);

  return <span className={className}>{output}</span>;
};

// ═══════════════════════════════════════════════════════════════
// Hero — Left copy + Right animated vault
// ═══════════════════════════════════════════════════════════════

const HeroSection = ({ isConnected }) => {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const yParallax = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const opacity = useTransform(scrollYProgress, [0, 0.85], [1, 0]);

  const container = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1, delayChildren: 0.12 },
    },
  };
  const item = fadeUp;

  return (
    <section
      ref={ref}
      className="relative min-h-[88svh] md:min-h-[92vh] flex items-center px-5 sm:px-6 py-16 sm:py-20 overflow-hidden"
    >
      <div className="pointer-events-none absolute inset-0 bg-grid-pattern bg-[size:40px_40px] sm:bg-[size:60px_60px] opacity-40" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-mesh" />
      <motion.div
        aria-hidden
        animate={{ y: [0, -18, 0], x: [0, 12, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -top-24 -left-20 w-72 h-72 sm:w-[26rem] sm:h-[26rem] rounded-full bg-accent-500/10 blur-[90px]"
      />
      <motion.div
        aria-hidden
        animate={{ y: [0, 22, 0], x: [0, -14, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
        className="absolute bottom-0 -right-24 w-80 h-80 sm:w-[30rem] sm:h-[30rem] rounded-full bg-accent-400/10 blur-[100px]"
      />

      <motion.div
        style={{ y: yParallax, opacity }}
        className="relative w-full max-w-6xl mx-auto z-10"
      >
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-12 items-center">
          {/* LEFT: copy */}
          <motion.div
            variants={container}
            initial="hidden"
            animate="visible"
            className="text-center lg:text-left order-2 lg:order-1"
          >
            <motion.div variants={item} className="mb-5 sm:mb-6 flex justify-center lg:justify-start">
              <div className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-accent-500/10 border border-accent-500/30 backdrop-blur overflow-hidden shine">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="live-dot absolute inline-flex h-2 w-2 rounded-full bg-accent-400" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-accent-400" />
                </span>
                <Sparkles className="w-3.5 h-3.5 text-accent-400 shrink-0" />
                <span className="text-xs sm:text-sm font-mono font-medium text-accent-300">
                  Zama fhEVM · ERC-7984 · Sepolia
                </span>
              </div>
            </motion.div>

            <motion.h1
              variants={item}
              className="font-display font-extrabold text-[2.35rem] leading-[1.1] sm:text-5xl md:text-6xl lg:text-[3.4rem] xl:text-6xl tracking-tight mb-4 sm:mb-5 text-balance"
            >
              Save{" "}
              {/* Ghost word locks layout width so scramble never pushes "Win fairly" */}
              <span className="relative inline-grid align-baseline text-left">
                <span
                  className="invisible col-start-1 row-start-1 whitespace-nowrap"
                  aria-hidden
                >
                  privately
                </span>
                <span className="col-start-1 row-start-1 whitespace-nowrap">
                  <ScrambleText
                    text="privately"
                    className="text-text-muted tabular-nums"
                  />
                </span>
              </span>
              {" "}
              <span className="relative inline-block whitespace-nowrap">
                <span className="gradient-text-animated">Win fairly.</span>
                <motion.span
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 1, delay: 0.85, ease: "easeOut" }}
                  className="absolute -bottom-1 left-0 right-0 h-1 bg-gradient-to-r from-accent-400 to-accent-600 origin-left rounded-full"
                />
              </span>
            </motion.h1>

            <motion.p
              variants={item}
              className="text-base sm:text-lg text-text-secondary max-w-xl mx-auto lg:mx-0 mb-7 sm:mb-8 leading-relaxed text-pretty"
            >
              NullYield is a{" "}
              <span className="text-accent-400 font-semibold">
                confidential no-loss prize savings pool
              </span>
              . Deposit sizes stay encrypted onchain. Winners are chosen by{" "}
              <span className="font-semibold">FHE-weighted randomness</span>.
              Your principal is always yours to withdraw.
            </motion.p>

            <motion.div
              variants={item}
              className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center lg:justify-start gap-3 mb-8 sm:mb-10 w-full max-w-sm sm:max-w-none mx-auto lg:mx-0"
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

            <motion.div
              variants={item}
              className="flex flex-wrap items-center justify-center lg:justify-start gap-x-5 gap-y-2 text-text-muted text-xs sm:text-sm"
            >
              {TRUST_ITEMS.map((t, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="text-accent-500">{t.icon}</div>
                  <span className="font-medium whitespace-nowrap">{t.text}</span>
                </div>
              ))}
            </motion.div>
          </motion.div>

          {/* RIGHT: animated vault with money */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, x: 24 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ duration: 0.8, delay: 0.25, ease: EASE }}
            className="relative order-1 lg:order-2 flex justify-center lg:justify-end"
          >
            <EncryptedVaultVisual />
          </motion.div>
        </div>
      </motion.div>

      {/* scroll cue */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="hidden sm:flex absolute bottom-6 left-1/2 -translate-x-1/2 text-text-muted flex-col items-center gap-1"
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

// ═══════════════════════════════════════════════════════════════
// Animated Encrypted Vault with FLOATING MONEY
// ═══════════════════════════════════════════════════════════════

const EncryptedVaultVisual = () => {
  return (
    <div className="relative w-[min(100%,320px)] sm:w-[360px] md:w-[400px] aspect-square select-none">
      {/* soft glows */}
      <div className="absolute inset-[12%] rounded-full bg-accent-500/20 blur-3xl" />
      <motion.div
        aria-hidden
        animate={{ scale: [1, 1.08, 1], opacity: [0.35, 0.55, 0.35] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        className="absolute inset-[18%] rounded-full bg-accent-400/25 blur-2xl"
      />

      {/* outer orbit ring */}
      <motion.div
        aria-hidden
        className="absolute inset-0 rounded-full border border-accent-500/25"
        animate={{ rotate: 360 }}
        transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
      >
        <span className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-accent-400 shadow-[0_0_12px_rgba(240,180,41,0.8)]" />
        <span className="absolute bottom-[18%] right-[8%] w-1.5 h-1.5 rounded-full bg-accent-300/90" />
      </motion.div>

      {/* mid orbit ring counter */}
      <motion.div
        aria-hidden
        className="absolute inset-[10%] rounded-full border border-dashed border-accent-500/30"
        animate={{ rotate: -360 }}
        transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
      >
        <span className="absolute top-1/2 right-0 translate-x-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-accent-500 shadow-[0_0_10px_rgba(240,180,41,0.6)]" />
        <span className="absolute top-[12%] left-[20%] w-1 h-1 rounded-full bg-accent-400/80" />
      </motion.div>

      {/* inner pulse ring */}
      <motion.div
        aria-hidden
        className="absolute inset-[22%] rounded-full border border-accent-400/40"
        animate={{ scale: [1, 1.04, 1], opacity: [0.5, 0.9, 0.5] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* FLOATING MONEY - Coins going INTO vault */}
      {[
        { d: 0, delay: 0, x: -60, y: -90, rot: 0 },
        { d: 0, delay: 0.8, x: 70, y: -75, rot: 45 },
        { d: 0, delay: 1.6, x: -80, y: 60, rot: -30 },
        { d: 0, delay: 2.4, x: 65, y: 80, rot: 60 },
        { d: 0, delay: 3.2, x: -55, y: -50, rot: -45 },
      ].map((c, i) => (
        <motion.div
          key={`coin-${i}`}
          className="absolute top-1/2 left-1/2 z-30"
          initial={{ x: c.x, y: c.y, opacity: 0, scale: 0.6, rotate: c.rot }}
          animate={{
            x: [c.x, 0],
            y: [c.y, 0],
            opacity: [0, 1, 1, 0],
            scale: [0.6, 1, 1, 0.3],
            rotate: [c.rot, c.rot + 360],
          }}
          transition={{
            duration: 4,
            delay: c.delay,
            repeat: Infinity,
            ease: "easeInOut",
            times: [0, 0.15, 0.75, 1],
          }}
        >
          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br from-yellow-200 via-accent-400 to-accent-600 border border-yellow-100/50 flex items-center justify-center shadow-[0_0_12px_rgba(240,180,41,0.6)]">
            <DollarSign className="w-3.5 h-3.5 text-yellow-900" strokeWidth={3} />
          </div>
        </motion.div>
      ))}

      {/* Floating dollar signs (background) */}
      {[
        { x: "5%", y: "10%", d: 0 },
        { x: "88%", y: "12%", d: 1.2 },
        { x: "10%", y: "88%", d: 2 },
        { x: "85%", y: "82%", d: 2.8 },
      ].map((f, i) => (
        <motion.div
          key={`dollar-${i}`}
          style={{ left: f.x, top: f.y }}
          animate={{
            y: [0, -12, 0],
            opacity: [0.3, 0.7, 0.3],
          }}
          transition={{
            duration: 3.5,
            delay: f.d,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute z-10 text-accent-400/60"
        >
          <DollarSign className="w-4 h-4" />
        </motion.div>
      ))}

      {/* Ciphertext chips */}
      {[
        { t: "euint64", x: "2%", y: "22%", d: 0 },
        { t: "FHE.rem", x: "78%", y: "18%", d: 0.6 },
        { t: "0x9f…a2", x: "0%", y: "68%", d: 1.1 },
        { t: "ERC-7984", x: "72%", y: "72%", d: 1.7 },
      ].map((g) => (
        <motion.span
          key={g.t}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.25, 0.7, 0.25], y: [0, -10, 0] }}
          transition={{
            duration: 5.5,
            delay: g.d,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          style={{ left: g.x, top: g.y }}
          className="absolute z-20 font-mono text-[10px] sm:text-xs text-accent-400/80 px-2 py-0.5 rounded-md bg-bg-card/60 border border-accent-500/20 backdrop-blur-sm"
        >
          {g.t}
        </motion.span>
      ))}

      {/* MAIN VAULT (piggy bank badge) */}
      <div className="absolute inset-[26%] flex items-center justify-center z-20">
        <motion.div
          animate={{ y: [0, -6, 0] }}
          transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
          className="relative w-full h-full max-w-[200px] max-h-[200px]"
        >
          {/* gold plate */}
          <div className="absolute inset-0 rounded-[28%] bg-gradient-to-br from-accent-300 via-accent-500 to-accent-700 shadow-[0_0_50px_rgba(240,180,41,0.35),inset_0_1px_0_rgba(255,255,255,0.35)] border border-accent-200/30" />
          {/* inner dark well */}
          <div className="absolute inset-[12%] rounded-[24%] bg-gradient-to-b from-bg-tertiary to-bg-primary border border-accent-500/20 flex items-center justify-center overflow-hidden">
            
            {/* Central Lock + Piggy Bank Composite */}
            <motion.div
              animate={{ rotate: [0, -6, 6, 0], scale: [1, 1.04, 1] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
              className="relative"
            >
              <Lock
                className="w-14 h-14 sm:w-16 sm:h-16 text-accent-400 drop-shadow-[0_0_18px_rgba(240,180,41,0.55)]"
                strokeWidth={1.75}
              />
              <motion.span
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 2.4, repeat: Infinity }}
                className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-accent-500/20 border border-accent-400/50 flex items-center justify-center"
              >
                <PiggyBank className="w-3 h-3 text-accent-300" />
              </motion.span>
            </motion.div>

            {/* scan line */}
            <motion.div
              aria-hidden
              className="absolute left-[14%] right-[14%] h-px bg-gradient-to-r from-transparent via-accent-300 to-transparent opacity-70"
              animate={{ top: ["18%", "82%", "18%"] }}
              transition={{ duration: 4.8, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        </motion.div>
      </div>

      {/* Orbiting shield + lock */}
      <motion.div
        className="absolute inset-[6%]"
        animate={{ rotate: 360 }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      >
        <Lock className="absolute top-0 left-1/2 -translate-x-1/2 w-3.5 h-3.5 text-accent-400/70" />
      </motion.div>
      <motion.div
        className="absolute inset-[14%]"
        animate={{ rotate: -360 }}
        transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
      >
        <Shield className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3.5 h-3.5 text-accent-500/60" />
      </motion.div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// CountUp
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
// Live Stats Section
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
              className="group relative flex h-full flex-col justify-between overflow-hidden border border-border/50 bg-gradient-to-b from-bg-tertiary/60 to-bg-primary/20 p-5 transition-all duration-500 hover:border-accent-500/40 hover:from-bg-tertiary/90"
            >
              {/* Explorer-style hover orb */}
              <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-accent-500/20 blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              
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
// Features Section
// ═══════════════════════════════════════════════════════════════

const FeaturesSection = () => {
  const onMove = useSpotlight();
  const features = [
    {
      icon: <EyeOff className="w-6 h-6" />,
      title: "Encrypted balances by default",
      description:
        "Individual deposit amounts and pool shares are stored as encrypted values. Not even the pool owner or validators can read your balance.",
    },
    {
      icon: <ShieldCheck className="w-6 h-6" />,
      title: "True no-loss guarantee",
      description:
        "Your principal is stored in encrypted shares. Prizes come from a separate encrypted reserve. You can withdraw your full principal whenever the pool is idle.",
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
        "Prizes are credited as encrypted pending prize. Only the winner can decrypt and claim via EIP-712 signature — losers never learn how close they were.",
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
              className="group relative overflow-hidden border border-border/50 bg-gradient-to-b from-bg-tertiary/60 to-bg-primary/10 p-5 sm:p-6 md:p-8 transition-all duration-500 hover:border-accent-500/40 hover:from-bg-tertiary/90 cursor-default"
            >
              {/* Explorer-style hover orb */}
              <div className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-accent-500/20 blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
              
              <div className="flex gap-4 relative z-10">
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
// How It Works — With Animated Flow Arrows
// ═══════════════════════════════════════════════════════════════

const HowItWorksSection = () => {
  const onMove = useSpotlight();
  const steps = [
    {
      number: "01",
      title: "Claim & wrap",
      description:
        "Claim testnet mUSDC once every 24h, approve ConfidentialToken, then wrap into confidential cUSDC (ERC-7984).",
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 relative">
            {steps.map((step, i) => (
              <div key={step.number} className="relative">
                <motion.div
                  custom={i}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  onPointerMove={onMove}
                  whileHover={{ y: -6 }}
                  className="relative h-full"
                >
                  <div className="group relative h-full flex flex-col overflow-hidden border border-border/50 bg-gradient-to-b from-bg-tertiary/60 to-bg-primary/10 p-5 sm:p-6 md:p-8 transition-all duration-500 hover:border-accent-500/40 hover:from-bg-tertiary/90">
                    {/* Explorer-style hover orb */}
                    <div className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-accent-500/20 blur-2xl opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
                    
                    <div className="relative z-10 flex flex-col h-full">
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
                  </div>
                </motion.div>

                {/* ANIMATED ARROW BETWEEN STEPS */}
                {i < steps.length - 1 && (
                  <FlowArrow index={i} />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

// Animated flow arrow between steps
const FlowArrow = ({ index }) => {
  return (
    <>
      {/* Desktop: horizontal arrow */}
      <div className="hidden lg:flex absolute top-1/2 -right-4 -translate-y-1/2 z-20 items-center justify-center pointer-events-none">
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 + index * 0.2, duration: 0.5 }}
          className="relative w-8 h-8 rounded-full bg-bg-primary border border-accent-500/40 flex items-center justify-center shadow-[0_0_15px_rgba(240,180,41,0.3)]"
        >
          <motion.div
            animate={{ x: [-2, 2, -2] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <ArrowRight className="w-4 h-4 text-accent-400" strokeWidth={2.5} />
          </motion.div>
          <motion.div
            className="absolute inset-0 rounded-full border border-accent-400/60"
            animate={{ scale: [1, 1.5, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
          />
        </motion.div>
      </div>

      {/* Mobile/tablet: vertical arrow */}
      <div className="flex lg:hidden justify-center my-2 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 + index * 0.15, duration: 0.4 }}
          className="relative w-8 h-8 rounded-full bg-bg-primary border border-accent-500/40 flex items-center justify-center shadow-[0_0_12px_rgba(240,180,41,0.3)]"
        >
          <motion.div
            animate={{ y: [-2, 2, -2] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          >
            <ArrowRight className="w-4 h-4 text-accent-400 rotate-90" strokeWidth={2.5} />
          </motion.div>
        </motion.div>
      </div>
    </>
  );
};

// ═══════════════════════════════════════════════════════════════
// FAQ Section
// ═══════════════════════════════════════════════════════════════

const FAQ_ITEMS = [
  {
    q: "Is my principal ever at risk?",
    a: "No. Principal is stored as encrypted per-user shares (_shares). Prizes come from a separate encrypted reserve. Withdraw always returns your full principal when the pool is idle. This is NullYield's core no-loss invariant.",
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
    a: "Only Sepolia ETH for gas. All balances in the pool are testnet mUSDC / cUSDC. Use the faucet on /faucet to get started (one claim per wallet per 24h).",
  },
  {
    q: "What happens if a draw doesn't get triggered on time?",
    a: "The timer just stays at 'Draw window open'. NullYield never queues overlapping draws — the operator runs one draw end-to-end (Trigger → Reveal → Finalize), then a fresh interval starts. Deposits and withdrawals unlock immediately after finalize.",
  },
  {
    q: "Who runs the draws?",
    a: "Currently the pool owner runs draws from the operator panel on /draws. That satisfies the 'documented admin flow' requirement for the hackathon. An unattended keeper using the Zama Node SDK is on the roadmap.",
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
                className={`group relative overflow-hidden transition-colors duration-300 border border-border/50 bg-gradient-to-b from-bg-tertiary/60 to-bg-primary/10 hover:border-accent-500/40 hover:from-bg-tertiary/90 ${
                  isOpen
                    ? "border-accent-500/40 shadow-[0_0_25px_rgba(240,180,41,0.08)]"
                    : ""
                }`}
              >
                {/* Explorer-style hover orb */}
                <div className={`pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-accent-500/20 blur-2xl transition-opacity duration-500 ${isOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} />
                
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? -1 : i)}
                  className="w-full flex items-center justify-between gap-3 sm:gap-4 p-4 sm:p-5 text-left relative z-10"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <div
                      className={`p-2 rounded-lg shrink-0 transition-colors ${
                        isOpen
                          ? "bg-accent-500/20 text-accent-300"
                          : "bg-accent-500/10 text-accent-400 group-hover:bg-accent-500/20"
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
                      className="overflow-hidden relative z-10"
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
// CTA Section
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
          className="group relative overflow-hidden rounded-2xl sm:rounded-3xl border border-border/50 bg-gradient-to-b from-bg-tertiary/60 to-bg-primary/20 p-7 sm:p-10 md:p-14 text-center transition-all duration-500 hover:border-accent-500/40 hover:from-bg-tertiary/90"
        >
          {/* Explorer-style hover orb */}
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent-500/20 blur-[50px] opacity-0 transition-opacity duration-500 group-hover:opacity-100" />
          <div className="absolute inset-0 bg-radial-glow opacity-40 pointer-events-none" />
          <div className="pointer-events-none absolute inset-0 bg-grid-pattern bg-[size:40px_40px] opacity-30" />

          <div className="relative z-10">
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
// Section Header
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