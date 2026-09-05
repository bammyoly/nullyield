import { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Menu, X, ArrowRight, AlertTriangle } from "lucide-react";

/** App shell routes — show Faucet / Pool / Draws */
const APP_PATHS = ["/faucet", "/pool", "/draws", "/account"];

const MARKETING_LINKS = [
  { name: "How it works", to: "/#how-it-works", hash: true },
  { name: "FAQs", to: "/#faqs", hash: true },
  {
    name: "GitHub",
    to: "https://github.com/bammyoly/nullyield",
    external: true,
  },
];

const APP_LINKS = [
  { name: "Faucet", to: "/faucet" },
  { name: "Pool", to: "/pool" },
  { name: "Draws", to: "/draws" },
  { name: "Account", to: "/account" },
];

const EASE = [0.16, 1, 0.3, 1];

/** Wraps RainbowKit's ConnectButton.Custom so the button never disappears
 *  and shows a clear "wrong network" state instead of hiding. */
const NetworkAwareConnectButton = ({ mobile }) => {
  return (
    <ConnectButton.Custom>
      {({
        account,
        chain,
        openAccountModal,
        openChainModal,
        openConnectModal,
        mounted,
      }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: { opacity: 0, pointerEvents: "none", userSelect: "none" },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <motion.button
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={openConnectModal}
                    type="button"
                    className={
                      mobile
                        ? "relative w-full overflow-hidden px-4 py-2.5 rounded-xl font-display font-semibold text-sm text-bg-primary bg-gradient-to-b from-accent-400 to-accent-600 shadow-[inset_0px_1px_1px_rgba(255,255,255,0.4),0px_4px_15px_rgba(240,180,41,0.2)]"
                        : "relative overflow-hidden px-4 py-2 rounded-xl font-display font-semibold text-sm text-bg-primary bg-gradient-to-b from-accent-400 to-accent-600 shadow-[inset_0px_1px_1px_rgba(255,255,255,0.4),0px_4px_15px_rgba(240,180,41,0.2)] hover:shadow-[inset_0px_1px_1px_rgba(255,255,255,0.4),0px_6px_22px_rgba(240,180,41,0.4)] transition-shadow"
                    }
                  >
                    Connect Wallet
                  </motion.button>
                );
              }

              if (chain.unsupported) {
                return (
                  <motion.button
                    animate={{
                      boxShadow: [
                        "0 0 0px rgba(239,68,68,0.0)",
                        "0 0 16px rgba(239,68,68,0.35)",
                        "0 0 0px rgba(239,68,68,0.0)",
                      ],
                    }}
                    transition={{ duration: 2, repeat: Infinity }}
                    onClick={openChainModal}
                    type="button"
                    className={
                      mobile
                        ? "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-display font-semibold text-sm bg-red-500/10 border border-red-500 text-red-400"
                        : "flex items-center gap-2 px-4 py-2 rounded-xl font-display font-semibold text-sm bg-red-500/10 border border-red-500 text-red-400 hover:bg-red-500/20 transition-colors"
                    }
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Wrong network, switch to Sepolia
                  </motion.button>
                );
              }

              return (
                <div className="flex items-center gap-1 p-1 rounded-full bg-bg-card border border-border hover:border-accent-500/40 transition-colors">
                  <button
                    onClick={openChainModal}
                    type="button"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-mono text-text-secondary hover:bg-bg-tertiary hover:text-accent-400 transition-colors"
                  >
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="absolute inline-flex h-1.5 w-1.5 rounded-full bg-accent-400 opacity-70 animate-ping" />
                      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-400" />
                    </span>
                    {chain.hasIcon && chain.iconUrl && (
                      <img
                        alt={chain.name ?? "Chain icon"}
                        src={chain.iconUrl}
                        className="w-3.5 h-3.5 rounded-full"
                      />
                    )}
                    {chain.name}
                  </button>
                  <button
                    onClick={openAccountModal}
                    type="button"
                    className="px-3 py-1.5 rounded-full bg-bg-tertiary text-xs font-mono text-text-primary hover:bg-accent-500/15 hover:text-accent-300 transition-colors"
                  >
                    {account.displayName}
                  </button>
                </div>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
};

const Navbar = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  const isHome = location.pathname === "/";
  const isApp = APP_PATHS.some(
    (p) => location.pathname === p || location.pathname.startsWith(p + "/")
  );

  const navLinks = isApp ? APP_LINKS : MARKETING_LINKS;

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname, location.hash]);

  // Lock body scroll when the mobile menu is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // Smooth-scroll to hash when landing on home with #section
  useEffect(() => {
    if (location.pathname !== "/" || !location.hash) return;
    const id = location.hash.replace("#", "");
    const el = document.getElementById(id);
    if (el) {
      const t = setTimeout(() => {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
      return () => clearTimeout(t);
    }
  }, [location.pathname, location.hash]);

  return (
    <>
      <motion.nav
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, ease: EASE }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          isScrolled ? "py-2.5" : "py-5"
        }`}
        style={
          isScrolled
            ? {
                backgroundColor: "rgba(10,10,15,0.72)",
                backdropFilter: "blur(16px)",
                WebkitBackdropFilter: "blur(16px)",
                borderBottom: "1px solid rgba(39,39,42,0.6)",
                boxShadow:
                  "0 8px 30px rgba(0,0,0,0.35), 0 1px 0 rgba(240,180,41,0.06)",
              }
            : { backgroundColor: "transparent" }
        }
      >
        {/* subtle gradient hairline that fades in on scroll */}
        <div
          aria-hidden
          className="pointer-events-none absolute bottom-0 inset-x-0 h-px transition-opacity duration-500"
          style={{
            opacity: isScrolled ? 1 : 0,
            background:
              "linear-gradient(to right, transparent, rgba(240,180,41,0.5), transparent)",
          }}
        />

        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-3 items-center gap-4">
          {/* 1. Left: Logo */}
          <div className="flex items-center justify-start">
            <Link to="/" className="group flex items-center gap-2.5 shrink-0">
              <motion.div
                whileHover={{ rotate: -10, scale: 1.1 }}
                transition={{ type: "spring", stiffness: 400 }}
                className="relative flex items-center justify-center"
              >
                <div className="absolute inset-0 bg-accent-500 blur-lg opacity-40 group-hover:opacity-70 transition-opacity rounded-xl" />
                <img
                  src="/logo.png"
                  alt="NullYield Logo"
                  className="relative w-10 h-10 object-contain drop-shadow-md"
                />
              </motion.div>
              <div className="flex flex-col leading-none">
                <span className="font-display font-bold text-xl tracking-tight">
                  Null<span className="gradient-text">Yield</span>
                </span>
              </div>
            </Link>
          </div>

          {/* 2. Middle: Desktop Nav Links (Perfectly Centered) */}
          <div className="hidden md:flex items-center justify-center">
            <div className="flex items-center gap-1 p-1 rounded-full border border-border/60 bg-bg-card/40 backdrop-blur-md">
              {navLinks.map((link) => (
                <NavLink
                  key={link.name}
                  link={link}
                  pathname={location.pathname}
                  hash={location.hash}
                />
              ))}
            </div>
          </div>

          {/* 3. Right: Actions */}
          <div className="flex items-center justify-end gap-2 sm:gap-3">
            {/* Get Started — compact & secondary dark style to distinguish from Connect Wallet */}
            {isHome && (
              <Link
                to="/faucet"
                className="hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-display font-semibold text-xs
                           bg-bg-tertiary border border-border-light text-text-primary
                           hover:border-accent-500 hover:text-accent-400 hover:bg-accent-500/10
                           hover:-translate-y-0.5 transition-all shadow-sm group"
              >
                Get Started
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>
            )}

            {/* Desktop connect button */}
            <div className="hidden md:block">
              <NetworkAwareConnectButton />
            </div>

            {/* Mobile: compact connect button, sits left of the toggle */}
            <div className="md:hidden scale-90 origin-right">
              <NetworkAwareConnectButton />
            </div>

            {/* Mobile toggle */}
            <button
              type="button"
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 rounded-lg bg-bg-card border border-border hover:border-accent-500 hover:text-accent-400 transition-colors"
              aria-label="Toggle menu"
              aria-expanded={mobileOpen}
            >
              <AnimatePresence mode="wait">
                {mobileOpen ? (
                  <motion.div
                    key="close"
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 90, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <X className="w-5 h-5" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="menu"
                    initial={{ rotate: 90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: -90, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Menu className="w-5 h-5" />
                  </motion.div>
                )}
              </AnimatePresence>
            </button>
          </div>
        </div>
      </motion.nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* dimmed backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-30 md:hidden bg-bg-primary/60 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, y: -16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="fixed top-[68px] left-3 right-3 z-40 md:hidden rounded-2xl border border-border shadow-2xl overflow-hidden"
              style={{
                backgroundColor: "rgba(18,18,26,0.92)",
                backdropFilter: "blur(20px)",
                WebkitBackdropFilter: "blur(20px)",
              }}
            >
              <motion.div
                className="p-4 flex flex-col gap-1.5"
                initial="hidden"
                animate="visible"
                variants={{
                  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
                }}
              >
                {navLinks.map((link) => (
                  <motion.div
                    key={link.name}
                    variants={{
                      hidden: { opacity: 0, x: -16 },
                      visible: { opacity: 1, x: 0 },
                    }}
                  >
                    <NavLink
                      link={link}
                      pathname={location.pathname}
                      hash={location.hash}
                      mobile
                    />
                  </motion.div>
                ))}

                {isHome && (
                  <motion.div
                    variants={{
                      hidden: { opacity: 0, x: -16 },
                      visible: { opacity: 1, x: 0 },
                    }}
                  >
                    <Link
                      to="/faucet"
                      className="mt-2 flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-display font-semibold text-sm
                                 text-bg-primary bg-gradient-to-b from-accent-400 to-accent-600
                                 shadow-[inset_0px_1px_1px_rgba(255,255,255,0.4),0px_4px_15px_rgba(240,180,41,0.2)]"
                    >
                      Get Started
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </motion.div>
                )}
              </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

const NavLink = ({ link, pathname, hash = "", mobile }) => {
  const baseClasses = mobile
    ? "px-4 py-3 rounded-xl text-base"
    : "px-4 py-2 rounded-full text-sm";

  if (link.external) {
    return (
      <a
        href={link.to}
        target="_blank"
        rel="noopener noreferrer"
        className={`${baseClasses} block font-medium text-text-secondary hover:text-accent-400 hover:bg-bg-card/70 transition-all`}
      >
        {link.name}
      </a>
    );
  }

  // Hash links on home (How it works / FAQs)
  if (link.hash) {
    const targetHash = link.to.includes("#")
      ? `#${link.to.split("#")[1]}`
      : "";
    const isActive = pathname === "/" && hash === targetHash;

    const scrollToHash = (e) => {
      if (pathname === "/") {
        e.preventDefault();
        const id = targetHash.replace("#", "");
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          window.history.replaceState(null, "", targetHash);
        }
      }
    };

    return (
      <Link
        to={link.to}
        onClick={scrollToHash}
        className={`${baseClasses} block font-medium transition-colors relative ${
          isActive
            ? "text-accent-400"
            : "text-text-secondary hover:text-accent-400"
        }`}
      >
        {isActive && (
          <motion.div
            layoutId={mobile ? "activeNavMobile" : "activeNav"}
            className="absolute inset-0 rounded-full bg-accent-500/10 border border-accent-500/30"
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
          />
        )}
        <span className="relative z-10">{link.name}</span>
      </Link>
    );
  }

  const isActive = pathname === link.to;

  return (
    <Link
      to={link.to}
      className={`${baseClasses} block font-medium transition-colors relative ${
        isActive
          ? "text-accent-400"
          : "text-text-secondary hover:text-accent-400"
      }`}
    >
      {isActive && (
        <motion.div
          layoutId={mobile ? "activeNavMobile" : "activeNav"}
          className="absolute inset-0 rounded-full bg-accent-500/10 border border-accent-500/30"
          transition={{ type: "spring", stiffness: 380, damping: 30 }}
        />
      )}
      <span className="relative z-10">{link.name}</span>
    </Link>
  );
};

export default Navbar

