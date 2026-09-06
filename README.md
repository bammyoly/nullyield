# NullYield

> **Confidential no-loss prize savings** on Ethereum Sepolia — powered by **Zama fhEVM** and **ERC-7984**.

Deposit encrypted. Keep balances private. Win prizes selected **onchain** by **FHE randomness weighted by deposit size**. Withdraw your principal anytime — no loss.

Only **you** can decrypt **your own** balance and winnings (EIP-712).

| | |
|---|---|
| **🌐 Live dApp** | https://nullyield.vercel.app |
| **🎥 Demo (≤3 min)** | https://youtu.be/ViR2LoghEOM |
| **🐦 X thread** | https://x.com/Bamie99/status/2096313311465775195?s=20
| **💻 GitHub** | https://github.com/bammyoly/nullyield |
| **Network** | Ethereum Sepolia |

---

## ⚡ For users

1. Open **https://nullyield.vercel.app** → connect wallet on **Sepolia** (need a little Sepolia ETH for gas).
2. **`/faucet`** → Claim **1,000 mUSDC** (once / 24h per wallet) → **Wrap** to confidential **cUSDC**.
3. **`/pool`** → Decrypt cUSDC (EIP-712) → **Approve Null Pool operator** → **Deposit encrypted cUSDC**.
4. **`/draws`** → public countdown + history; owner runs **Trigger → Reveal → Finalize**.
5. **`/account`** → Decrypt pending prize → **Claim** → Decrypt wallet cUSDC → optional **Withdraw** (full principal).

**Important Note to Zama Judges.** 
Private key to Owner/operator wallet  have been provided in the "Feedback on the Bounty Track" form to access operator controls


---

## 📑 Table of contents

1. [The problem NullYield solves](#1-the-problem-nullyield-solves)
2. [High-level architecture](#2-high-level-architecture)
3. [Smart contract system](#3-smart-contract-system)
4. [FHE draw mechanics (provably fair)](#4-fhe-draw-mechanics-provably-fair)
5. [Confidentiality design & leakage analysis](#5-confidentiality-design--leakage-analysis)
6. [App flow (end-to-end)](#6-app-flow-end-to-end)
7. [Frontend structure](#7-frontend-structure)
8. [Zama SDK integration](#8-zama-sdk-integration)
9. [Yield source (mock → production)](#9-yield-source-mock--production)
10. [Notifications](#10-notifications)
11. [Getting started (local + deploy)](#11-getting-started-local--deploy)
12. [How to try NullYield as a judge / user](#12-how-to-try-nullyield-as-a-judge--user)
13. [Error handling](#13-error-handling)
14. [Project requirements — mapped to what shipped](#14-project-requirements--mapped-to-what-shipped)
15. [Roadmap](#15-roadmap)
16. [License & credits](#16-license--credits)

---

## 1. The problem NullYield solves

No-loss prize savings (PoolTogether-style) is a strong DeFi primitive: deposit into a shared pool, yield is awarded to one lucky depositor, **nobody loses principal**.

On public chains, prize pools still **leak wealth**:
- How much every user deposited  
- Exact odds per wallet  
- Every historical winner  

That exposes large savers and discourages participation.

**NullYield removes that trade-off:**

| Transparent pool | NullYield (FHE) |
|---|---|
| Anyone sees every deposit | 🔒 Individual balances encrypted (`euint64`) |
| Odds are publicly calculable | 🔒 Odds computed over ciphertexts |
| Winner identity always public mid-flow | 🔒 Prize is encrypted until winner claims |
| Principal can be entangled with yield | 🔒 Principal isolated — withdraw anytime when idle |

---

## 2. High-level architecture

```text
┌────────────────────────────────────────────────────────────┐
│                        NULLYIELD                           │
└────────────────────────────────────────────────────────────┘

  MockERC20 (mUSDC, faucet · 1,000 / 24h)
        │  approve + wrap()
        ▼
  ConfidentialToken  (ERC-7984 · cUSDC)  ── unwrap ──▶ finalizeUnwrap
        │  confidentialTransferFrom (operator)
        ▼
  NullYield
   ├── _shares[user]          euint64   (EIP-712 user-decrypt)
   ├── _pendingPrize[user]    euint64   (winner-only decrypt)
   ├── _totalShares           euint64   (public-decrypt once per draw)
   └── _prizeReserve          euint64   (owner may decrypt)
        ▲
  PrizeReserve (mock yield: fund → wrap → fundPrizeFromReserve)

  Frontend (React + Vite + Tailwind + RainbowKit + Wagmi + ethers v6)
    ├── @zama-fhe/relayer-sdk/web
    │     • encrypt (deposit / fundPrize / unwrap)
    │     • userDecrypt (EIP-712)
    │     • publicDecrypt (draw total + winner index)
    └── Multi-RPC FallbackProvider + nullYieldBlock log floor

  Admin flow (/draws · owner/keeper):
    Interval · Fund reserve · Trigger → Reveal → Finalize
```

**Design principles**

- Confidentiality by default (individual sizes never plaintext onchain)
- Mathematical fairness (`FHE.rem(rand, KMS-verified total)` + oblivious scan)
- Documented leakage (aggregate total, winner on finalize, participants)
- No-loss invariant (`withdraw` only moves `_shares`, never `_prizeReserve`)

---

## 3. Smart contract system

Solidity `^0.8.27` · OpenZeppelin · `@openzeppelin/confidential-contracts` · `@fhevm/solidity` (`ZamaEthereumConfig`).

| Contract | Role |
|----------|------|
| **`MockERC20.sol`** | Test stablecoin (mUSDC, 6 decimals). Faucet: **1,000 / wallet / 24h**. Owner mint for seeding. |
| **`ConfidentialToken.sol`** | ERC-7984 wrapper (**cUSDC**): `wrap`, async `unwrap` + `finalizeUnwrap`, operator ACL. |
| **`NullYield.sol`** | Core pool: encrypted shares + prizes, 3-step draw, no-loss withdraw. |
| **`PrizeReserve.sol`** | Mock yield: holds mUSDC, `distribute()` wraps + `fundPrizeFromReserve`. |

### Initial distribution (post-deploy)

| Holder | Amount | Purpose |
|--------|--------|---------|
| PrizeReserve | 990,000 mUSDC | ~9,900 draws @ 100 cUSDC |
| Operator / deployer | 10,000 mUSDC | Shield + test deposits |
| **Total** | **1,000,000 mUSDC** | Initial circulation |

Deploy script writes `deployment.json` and syncs **`frontend/src/contracts/`** with addresses, ABIs, and **`nullYieldBlock` / `startBlock`** for RPC-safe event scans.

---

## 4. FHE draw mechanics (provably fair)

**Zero offchain RNG. Zero plaintext balances in selection.**

Naïve `rand % POOL_CAP` + `min` **biases the last depositor** — rejected.

### 3-step KMS state machine

| Step | Function | Transition |
|------|----------|------------|
| **1** | `triggerDraw` | `IDLE → AWAITING_TOTAL_DECRYPTION`. Freezes pool. Snapshots `_totalShares` → `FHE.makePubliclyDecryptable`. |
| **2** | `revealTotalAndSelectWinner(drawId, clearTotal, proof)` | `AWAITING_TOTAL → AWAITING_WINNER`. `FHE.checkSignatures` verifies KMS total. `rand = FHE.rem(FHE.randEuint64(), clearTotal)`. Oblivious `_selectWinner` (`FHE.and/not/le/or/select`) — branchless, no early exit. |
| **3** | `finalizeDraw(drawId, clearWinnerIndex, proof)` | `AWAITING_WINNER → IDLE`. Credits `min(reserve, prizePerDraw)` to `_pendingPrize[winner]` + `FHE.allow(winner)`. |

$$\mathbb{P}(\text{win}_i) = \frac{\text{shares}_i}{\text{totalShares}}$$

**One draw at a time.** No queue. Late operator → timer stays “window open”. After finalize, a fresh `drawInterval` starts. UI shows **Pending finalization · Draw #N**.

Access: `onlyKeeperOrOwner`. Hackathon: deployer = owner = keeper. Production: dedicated keeper / automation.

---

## 5. Confidentiality design & leakage analysis

### Encrypted (never plaintext)

- Per-user deposits / `_shares` (`euint64`)
- Per-user `_pendingPrize` until claim
- Wallet **cUSDC** (`confidentialBalanceOf`)
- Scan cumulatives / comparisons (`ebool`, `FHE.select`)
- Prize reserve (owner ACL optional)

### Necessary public leakage

| Leak | Why |
|------|-----|
| Depositor addresses | Required to iterate the oblivious scan |
| Aggregate pool total **once per draw** | Unbiased modulus for `FHE.rem` |
| Winner address after finalize | Route prize (same as any lottery) |
| Draw timing / `drawId` / `prizePerDraw` | UX + protocol ops |
| That a user deposited/withdrew | Public txs — **amounts stay hidden** |

### Does **not** leak

Individual sizes · loser rankings · per-user odds · prize amount without winner decrypt.

---

## 6. App flow (end-to-end)

```text
1. Faucet   → claim 1,000 mUSDC (24h / wallet)
2. Wrap     → approve + ConfidentialToken.wrap → cUSDC
3. Pool     → EIP-712 decrypt cUSDC → setOperator(NullYield)
            → encrypt amount → NullYield.deposit(handle, proof)
4. Draws    → (owner) fund reserve + interval
            → triggerDraw → revealTotalAndSelectWinner → finalizeDraw
5. Account  → EIP-712 decrypt pending prize → claim → cUSDC wallet
6. Withdraw → NullYield.withdraw() when IDLE → cUSDC principal
7. Optional → unwrap → finalizeUnwrap → mUSDC
```

**No-loss:** `withdraw()` only moves `_shares[msg.sender]`. Never touches `_prizeReserve`. Blocked only while `drawState != IDLE`.

---

## 7. Frontend structure

**React + Vite + Tailwind + Framer Motion + RainbowKit + Wagmi + ethers v6 + `@zama-fhe/relayer-sdk/web`.**

```text
frontend/src/
├── components/     Navbar, Toaster
├── config/         wagmi (Sepolia)
├── contracts/      addresses.json (+ nullYieldBlock), ABIs
├── hooks/          useCountdown, useZamaEncrypt
├── lib/
│   ├── zamaEncrypt.js
│   ├── notifications.js      # EmailJS + VITE_APP_URL claim link
│   ├── getLogsChunked.js     # deploy-block floor + incremental cache
│   └── rpcProvider.js        # multi-RPC FallbackProvider (quorum: 1)
└── pages/
    ├── Home.jsx      Landing, live stats, FAQ
    ├── Faucet.jsx    Claim + wrap/unwrap
    ├── Pool.jsx      Operator approve + encrypted deposit
    ├── Draws.jsx     Countdown, history, owner panel
    └── Account.jsx   Decrypt, claim, withdraw, win alerts
```

**UX**

- Browse Home / Faucet / Draws history without wallet  
- Wallet required for encrypt / deposit / claim / withdraw  
- **MAX** on Pool decrypts-if-needed then fills  
- Owner-only operator panel; others see countdown + history  
- Multi-RPC read path (Alchemy → Ankr → 1RPC…) so free-tier outages don’t brick the demo  

---

## 8. Zama SDK integration

### Encrypt (deposit / fund / unwrap)

```text
createEncryptedInput(contract, user) → add64(amount) → encrypt()
→ deposit(handle, proof) | fundPrize | unwrap
```

### User decrypt (EIP-712)

```text
generateKeypair → createEIP712 → wallet signTypedData → userDecrypt
```

Used for `sharesOf`, `pendingPrizeOf`, wallet cUSDC, owner `prizeReserve`.

### Public decrypt (draw)

```text
publicDecrypt(pendingTotalSharesHandle)
→ revealTotalAndSelectWinner(drawId, clearTotal, proof)
```

Same pattern for winner index.

### RPC-friendly logs

`getLogsChunked` starts at `addresses.nullYieldBlock`, chunks ≤9,999 blocks, and caches so polls don’t re-scan history.

---

## 9. Yield source (mock → production)

**Hackathon mock**

1. PrizeReserve seeded with **990,000 mUSDC**  
2. `distribute()` wraps → `fundPrizeFromReserve`  
3. Prize = encrypted `min(reserve, prizePerDraw)` (default **100 cUSDC**)

**Operator direct fund:** `/draws` → encrypt → `NullYield.fundPrize(handle, proof)`.

**Production:** swap PrizeReserve for Aave / Compound / ERC-4626 harvest → wrap interest → same `fundPrizeFromReserve` interface. Pool math unchanged.

---

## 10. Notifications

Client-side only (no backend PII store):

We introduced a notification system that alerts users who optin whenever their wallet wins a draw.
Emails are tied to one wallet.

- **EmailJS** opt-in on **Account** (per-wallet localStorage)  
- Env: `VITE_EMAILJS_*`, `VITE_APP_URL`  
- Template CTA: `{{appUrl}}/account` → **Go to Dashboard & Claim**  
- Prize labeled **cUSDC**; branding **NullYield**

---

## 11. Local + deployment guide

```text
nullyield/
├── contract/     Hardhat + deploy + ABI sync
├── frontend/     React + Vite dApp
└── README.md
```

### Contracts

```bash
cd contract
npm install
cp .env.example .env   # PRIVATE_KEY, SEPOLIA_RPC_URL
npx hardhat compile
npx hardhat run scripts/deploy.js --network sepolia
```

Syncs `frontend/src/contracts/addresses.json` + ABIs + **`nullYieldBlock`**.

### Frontend

```bash
cd frontend
npm install
# .env
# VITE_WALLETCONNECT_PROJECT_ID=...
# VITE_SEPOLIA_RPC_URL=...          # Alchemy recommended
# VITE_SEPOLIA_RPC_URL_BACKUP=...   # Ankr with key
# VITE_RELAYER_URL=https://relayer.testnet.zama.org
# VITE_APP_URL=https://nullyield.vercel.app
# Optional EmailJS keys...
npm run dev
```

Connect Sepolia → `/faucet`.


---

## 12. How to try NullYield as a judge / user

### Prerequisites
- MetaMask / OKX Wallet / Rabby on **Sepolia**  (Zerion has issues)
- Small amount of **Sepolia ETH** (gas only)  
- Live app: https://nullyield.vercel.app  

### Steps

1. Connect wallet on Sepolia.  
2. **`/faucet`** → **Claim 1,000 mUSDC** (24h cooldown) → **Wrap** to **cUSDC**.  
3. **`/pool`** → **Decrypt** cUSDC (sign EIP-712) → **Approve Null Pool operator** → amount or **MAX** → **Deposit encrypted**.  
4. **`/draws`**  
   - Everyone: countdown, status, history  
   - Owner: **Fund reserve** → set interval (e.g. `300`) → **Trigger → Reveal → Finalize**  
5. **`/account`** → **Decrypt pending prize** → **Claim** → **Decrypt wallet cUSDC** → **view win history** **Withdraw principal** whenever pool is idle.  
6. .Optional: **`/faucet` Unwrap** tab → cUSDC back to mUSDC.

**For Zama Judges**
Private Key to operator/owner wallet already provided in the feedback form

---

## 13. Error handling

| Case | Handling |
|------|----------|
| Missing mUSDC approval | Auto `approve(MaxUint256)` before wrap |
| Missing pool operator | Explicit approve CTA on Pool |
| Insufficient cUSDC | Decrypted balance checked before deposit |
| Wrong network | Wagmi locked to Sepolia (11155111) |
| FHE SDK not ready | Buttons disabled + status |
| Draw in progress | Deposit/withdraw locked + banner |
| Faucet cooldown | `FaucetCooldownActive` → toast + 24h countdown |
| Contract errors | Mapped: `DrawNotDue`, `EmptyPool`, `NotAuthorizedKeeper`, `InvalidDrawState`, … |
| Free-tier RPC limits | Multi-RPC `FallbackProvider` + `nullYieldBlock` + chunked/cached logs |

---

## 14. Project requirements — mapped to what is shipped

### Submission checklist

| # | Requirement | Status | Where |
|---|-------------|--------|--------|
| 1 | Public live web dApp (wallet connect) | ✅ | https://nullyield.vercel.app |
| 2 | Full cycle: deposit → draw → claim → withdraw | ✅ | Faucet · Pool · Draws · Account · `NullYield.sol` |
| 3 | Encrypted balances (ERC-7984 / euint) | ✅ | `ConfidentialToken` + `_shares` / `_pendingPrize` |
| 4 | Onchain FHE winner select, deposit-weighted, no offchain RNG | ✅ | `FHE.randEuint64` + `FHE.rem` + oblivious `_selectWinner` |
| 5 | No-loss principal, withdraw anytime (when idle) | ✅ | `withdraw()` only `_shares` |
| 6 | Automated **or** documented keeper/admin flow | ✅ | `/draws` operator panel: Trigger → Reveal → Finalize |
| 7 | EIP-712 user decryption of balance & winnings | ✅ | `useZamaEncrypt.decryptHandle` |
| 8 | Faucet / clear test-token instructions | ✅ | `/faucet` 1,000 mUSDC / 24h + this README |
| 9 | Open-source public GitHub | ✅ | https://github.com/bammyoly/nullyield |

### Shiiped axes

| Axis | Coverage |
|------|----------|
| **Correctness** | Full E2E cycle; strict draw state machine; ACL for user decrypt |
| **Confidentiality** | Encrypted accounting; oblivious FHE scan; KMS-verified total; **documented leakage** |
| **UX** | Clear steps; pending-draw state; MAX-with-decrypt; owner-only controls; toasts |
| **Code quality** | Separation of concerns; NatSpec; custom errors; env-driven config |
| **Production-readiness** | Single active draw; no-loss onchain; ABI/address/block sync; multi-RPC reads; chunked logs |

---

## 15. Roadmap

- O(log n) encrypted segment tree (scale past `MAX_DEPOSITORS = 50`)  
- Multi-tier prizes (top-K)  
- Real yield adapter (Aave / ERC-4626)  
- Unattended backend keeper (Zama Node SDK)  
- Auto-finalize unwrap gateway callback  
- Multi-asset confidential pools  

---

## 16. License & credits

- **License:** Proprietary (All Rights Reserved - see [LICENSE.md](./LICENSE.md))
- **Built with:** [Zama](https://www.zama.org/) · [OpenZeppelin](https://www.openzeppelin.com/) confidential contracts · [RainbowKit](https://www.rainbowkit.com/) · [Wagmi](https://wagmi.sh/) · [ethers v6](https://docs.ethers.org/v6/)  
- **Inspired by:** [PoolTogether](https://pooltogether.com/) no-loss prize savings
---

**NullYield = private savings, public fairness.**  
Deposit encrypted. Win fairly. Withdraw anytime.
```
