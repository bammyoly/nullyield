# NullYield

> **a Confidential no-loss prize savings protocol** on Ethereum Sepolia, powered by **Zama fhEVM** and **ERC-7984**.

Deposit encrypted, keep balances private, win prizes selected onchain by **FHE randomness weighted by deposit size**, and withdraw your principal at any time. Only **you** can decrypt **your own** balance and winnings.

**🌐 Live dApp:** [Insert Vercel / Netlify URL]  
**🎥 Demo video (≤3 min):** [Insert YouTube URL]  
**🐦 X (Twitter) thread:** [Insert link]  
**💻 GitHub:** [Insert repo URL]

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

No-loss prize savings (PoolTogether-style) is a strong DeFi primitive: everyone deposits into a shared pool, the pool earns yield, and that yield is periodically awarded to one lucky depositor. No one loses principal — losers just don’t win the prize.

The problem on public chains: **balances, odds and winners all leak**. Anyone can inspect exactly how much you saved, compute your winning probability, and see every historical winner. That exposes wealth, discourages participation, and makes large depositors phishing targets.

**NullYield removes that trade-off:**

- Individual deposits and shares are stored as **encrypted `euint64`** values (ERC-7984 confidential accounting).
- Winner selection runs **entirely onchain over ciphertexts** using Zama’s **FHE randomness** and an oblivious scan weighted by deposit size.
- Only the **user** can decrypt their **own** balance and pending prize via **EIP-712**.
- **Principal is always withdrawable** when the pool is idle.

---

## 2. High-level architecture

```text
┌────────────────────────────────────────────────────────────┐
│                        NULLYIELD                           │
└────────────────────────────────────────────────────────────┘

  MockERC20 (mUSDC, faucet · 1,000 / 24h)
        │  approve + wrap()
        ▼
  ConfidentialToken  (ERC-7984 · cUSDC)  ─── unwrap request ──▶ finalizeUnwrap
        │  confidentialTransferFrom (operator)
        ▼
  NullYield
   ├── _shares[user]          euint64   (EIP-712 user-decrypt)
   ├── _pendingPrize[user]    euint64   (winner-only decrypt)
   ├── _totalShares           euint64   (public-decrypt once per draw)
   └── _prizeReserve          euint64   (owner may decrypt)
        ▲
  PrizeReserve (mock yield: fund → wrap → fundPrizeFromReserve)

  Frontend (React + Vite + Tailwind + RainbowKit + Wagmi)
    ├── @zama-fhe/relayer-sdk/web
    │     • createEncryptedInput.add64.encrypt  (deposit / fundPrize / unwrap)
    │     • userDecrypt (EIP-712)               (shares, pending prize, wallet cUSDC, reserve)
    │     • publicDecrypt                       (draw total, winner index)
    └── ethers v6 (contract calls, event scans from nullYieldBlock)

  Admin flow (deployer / owner wallet, on /draws):
    Interval config · Fund reserve · Trigger → Reveal → Finalize
    (Automation is optional roadmap; hackathon uses the documented admin flow.)
```

**Design principles**

- **Confidentiality by default** (individual sizes never plaintext).
- **Mathematical fairness** (`FHE.rem(rand, verifiedTotal)`, oblivious scan).
- **Documented leakage** (aggregate total per draw, winner address on finalize, participation addresses).
- **No-loss invariant** (`withdraw` only touches `_shares`, never `_prizeReserve`).

---

## 3. Smart contract system

Solidity `^0.8.27`, OpenZeppelin + `@openzeppelin/confidential-contracts`, `@fhevm/solidity` (`ZamaEthereumConfig`).

| Contract | Role |
|----------|------|
| **`MockERC20.sol`** | Plaintext stablecoin (mUSDC, 6 decimals). **Public faucet: 1,000 mUSDC per wallet per 24h**. Owner mint for seeding. |
| **`ConfidentialToken.sol`** | ERC-7984 confidential wrapper (cUSDC): `wrap`, async `unwrap` + `finalizeUnwrap`, confidential transfers, operator ACL. |
| **`NullYield.sol`** | Encrypted per-user shares + pending prizes, 3-step draw state machine, owner/keeper draw controls, no-loss withdraw. |
| **`PrizeReserve.sol`** | Mock yield source: holds mUSDC, `distribute()` wraps + `fundPrizeFromReserve`. In production, replace with Aave / Compound / ERC-4626 harvest. |

### Initial token distribution (post-deploy)

| Holder | Amount | Purpose |
|--------|--------|---------|
| PrizeReserve | 990,000 mUSDC | Funds ~9,900 automated 100 cUSDC prize draws |
| Operator / deployer | 10,000 mUSDC | Shield + test deposits |
| **Total** | **1,000,000 mUSDC** | Initial circulation |

Deploy script writes `deployment.json` and syncs **`frontend/src/contracts/`** with:

- Addresses (`mockERC20`, `confidentialToken`, `nullYield`, `prizeReserve`)
- Clean ABIs
- **Deployment block numbers** (`nullYieldBlock`, `startBlock`) — used to bound event scans on free-tier RPCs

---

## 4. FHE draw mechanics (provably fair)

**Zero offchain RNG. Zero plaintext balances in selection.**

Naïve approach `rand % POOL_CAP` + `min` biases the last index. **Rejected.**

### 3-step KMS state machine

| Step | Function | State transition |
|------|----------|------------------|
| 1 | `triggerDraw` | `IDLE → AWAITING_TOTAL_DECRYPTION`. Increments `drawId`. Freezes pool. Snapshots `_totalShares` → `FHE.makePubliclyDecryptable`. |
| 2 | `revealTotalAndSelectWinner(drawId, clearTotal, proof)` | `AWAITING_TOTAL → AWAITING_WINNER`. `FHE.checkSignatures` verifies KMS proof for `clearTotal`. `rand = FHE.rem(FHE.randEuint64(), clearTotal)`. Oblivious `_selectWinner` runs `FHE.and / FHE.not / FHE.le / FHE.or / FHE.select` — branchless, no early exit. Winner index → `makePubliclyDecryptable`. |
| 3 | `finalizeDraw(drawId, clearWinnerIndex, proof)` | `AWAITING_WINNER → IDLE`. Verifies KMS proof. `prize = min(reserve, prizePerDraw)` encrypted. Credits `_pendingPrize[winner]`, `FHE.allow(winner)`. Resets `nextDrawTime`. |

**Probability of winning** = `shares_i / totalShares` — exactly deposit-weighted.

### One draw at a time

The contract does **not** queue overlapping draws.  
If the operator is late, the timer stays at “Draw window open”. On finalize, a fresh `drawInterval` starts.

### Access

`onlyKeeperOrOwner` on all three steps. Hackathon deployment uses **deployer = owner = keeper**; production would use a dedicated hot keeper key or unattended automation.

---

## 5. Confidentiality design & leakage analysis

### Encrypted onchain (never plaintext)

- Per-user **deposit / shares** (`euint64`)
- Per-user **pending prizes** until claim
- **Wallet cUSDC** balances (ERC-7984 `confidentialBalanceOf`)
- **Running sums** and comparisons during winner scan (`ebool`, `FHE.select`)
- **Prize reserve** (owner may user-decrypt via ACL)

### Necessary / documented leakage

| Leak | Why it must be public |
|------|------------------------|
| **Depositor addresses** | Contract enumerates them during oblivious scan |
| **Aggregate pool total, once per draw** | Plaintext divisor for `FHE.rem(rand, clearTotal)` → unbiased weighted odds |
| **Winner address** after `finalizeDraw` | Route encrypted prize to a real recipient (same leakage as any lottery) |
| **Draw timing, drawId, configured `prizePerDraw`** | Protocol operation, UX countdowns |
| Fact **that** a user deposited / withdrew | Public tx graph. **Amounts stay hidden.** |

### Does **not** leak

- Individual deposit sizes  
- Any loser’s balance or relative ranking  
- Any user’s odds  
- Actual awarded amount without the winner’s decryption  

**Only the user** (or, for the reserve, the owner) can decrypt via **EIP-712 + Zama relayer**.

---

## 6. App flow (end-to-end)

```text
1. Faucet   → claim 1,000 mUSDC (24h per wallet)
2. Wrap     → approve + ConfidentialToken.wrap → confidential cUSDC
3. Pool     → EIP-712 decrypt wallet cUSDC (for MAX confidence)
            → setOperator(NullYield)
            → encrypt amount client-side (Zama SDK)
            → NullYield.deposit(handle, proof)  ← _shares[user] updates encrypted
4. Draws    → (owner) fund reserve + set interval
            → triggerDraw · revealTotalAndSelectWinner · finalizeDraw
5. Account  → EIP-712 decrypt _pendingPrize (winner-only)
            → NullYield.claim() → confidential transfer to wallet cUSDC
            → EIP-712 decrypt wallet cUSDC → see winnings landed
6. Withdraw → NullYield.withdraw() (only when IDLE) → cUSDC returned
7. Optional → ConfidentialToken.unwrap request → finalizeUnwrap → mUSDC back
```

**No-loss guarantee:** `withdraw()` only moves `_shares[msg.sender]`. It never touches `_prizeReserve`. It is blocked only while `drawState != IDLE` (bounded operator window).

---

## 7. Frontend structure

Stack: **React + Vite + Tailwind CSS + Framer Motion + RainbowKit + Wagmi + ethers v6 + Zama relayer SDK**.

```text
frontend/src/
├── components/
│   ├── Navbar.jsx           # context-aware nav (marketing vs app)
│   └── Toaster.jsx          # toast system
├── config/
│   └── wagmi.js             # RainbowKit / Wagmi (Sepolia)
├── contracts/               # synced by deploy script
│   ├── addresses.json       # + nullYieldBlock scan floor
│   ├── MockERC20.json
│   ├── ConfidentialToken.json
│   ├── NullYield.json
│   └── PrizeReserve.json
├── hooks/
│   ├── useCountdown.js
│   └── useZamaEncrypt.js    # encrypt / userDecrypt / publicDecrypt
├── lib/
│   ├── zamaEncrypt.js       # @zama-fhe/relayer-sdk/web wrapper
│   ├── notifications.js     # EmailJS win alerts (VITE_APP_URL)
│   └── getLogsChunked.js    # chunked eth_getLogs from deploy block
└── pages/
    ├── Home.jsx             # landing, How it works, FAQs, live stats
    ├── Faucet.jsx           # 1,000 mUSDC / 24h claim + wrap/unwrap
    ├── Pool.jsx             # Null Vault + decrypt cUSDC + deposit
    ├── Account.jsx          # decrypt shares/prize/wallet + claim + withdraw + wins
    └── Draws.jsx            # countdown + history · owner operator panel
```

**UX principles**

- Wallet **not required** to browse Home, Faucet, Draws public view.
- Wallet required to encrypt / deposit / claim / withdraw.
- Amount **MAX** on Pool decrypts-if-needed then fills.
- Operator panel is **owner/keeper-only**; non-owners only see countdown + history.
- Draws in progress show **“Pending finalization · Draw #N”**.

---

## 8. Zama SDK integration

Package: **`@zama-fhe/relayer-sdk/web`** (browser).

### Encrypt (deposit / fund / unwrap)

```text
const input = instance.createEncryptedInput(contractAddress, userAddress);
input.add64(parsedAmount);
const { handles, inputProof } = await input.encrypt();
// → deposit(handle, inputProof) | fundPrize | unwrap
```

### User decrypt (EIP-712)

```text
const kp = instance.generateKeypair();
const eip712 = instance.createEIP712(kp.publicKey, [contract], startTs, days);
const signature = await walletClient.signTypedData(...);
const result = await instance.userDecrypt(pairs, kp.privateKey, kp.publicKey, sig, ...);
```

Used for `sharesOf`, `pendingPrizeOf`, wallet cUSDC (`confidentialBalanceOf`), and (owner) `prizeReserve`.

### Public decrypt (draw operator)

```text
const { clearValue, proof } = await publicDecryptHandle(pendingTotalSharesHandle);
await pool.revealTotalAndSelectWinner(drawId, clearValue, proof);
```

Same shape for `pendingWinnerIndexHandle`.

### RPC-friendly log scans

`getLogsChunked.js` reads `addresses.nullYieldBlock` / `startBlock` and chunks `queryFilter` to ≤9,999 blocks — safe on public Sepolia RPCs.

---

## 9. Yield source (mock → production)

**Hackathon (mock):**

1. Deploy seeds **PrizeReserve** with 990,000 mUSDC.
2. Keeper/owner calls `distribute()` → wraps mUSDC → cUSDC → `NullYield.fundPrizeFromReserve(amount)`.
3. Draw prize = `min(reserve, prizePerDraw)` (encrypted, default 100 cUSDC).

**Operator direct fund:** From `/draws`, encrypt amount client-side → `NullYield.fundPrize(handle, proof)`.

**Production:** Replace `PrizeReserve` with an Aave / Compound / ERC-4626 adapter. Harvest interest → shield via `ConfidentialToken.wrap` → `fundPrizeFromReserve`. **Pool math stays identical.**

---

## 10. Notifications

Client-side, **no custom backend**:

- **EmailJS** for opt-in winner emails. User stores email on **Account** (localStorage, per-wallet).  
  Env: `VITE_EMAILJS_SERVICE_ID`, `VITE_EMAILJS_TEMPLATE_ID`, `VITE_EMAILJS_PUBLIC_KEY`, `VITE_APP_URL`.
- Template CTA: `{{appUrl}}/account` → **Go to Dashboard & Claim** (clickable).
- Branding: **NullYield**, prize in **cUSDC**.

Notifications are opt-in. NullYield never collects PII by default.

---

## 11. Getting started (local + deploy)

### Repo layout

```text
nullyield/
├── contract/       # Hardhat: contracts + deploy + ABI sync
├── frontend/       # React + Vite dApp
└── README.md       # this file
```

### Contracts

```bash
cd contract
npm install
cp .env.example .env         # PRIVATE_KEY, SEPOLIA_RPC_URL
npx hardhat compile
npx hardhat run scripts/deploy.js --network sepolia
```

After deploy, `frontend/src/contracts/addresses.json` + ABIs are auto-populated (including **`nullYieldBlock`** for log scans).

### Frontend

```bash
cd frontend
npm install
# .env
# VITE_WALLETCONNECT_PROJECT_ID=...
# VITE_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com
# VITE_RELAYER_URL=https://relayer.testnet.zama.org
# VITE_APP_URL=https://your-app.vercel.app
# Optional EmailJS:
# VITE_EMAILJS_SERVICE_ID=...
# VITE_EMAILJS_TEMPLATE_ID=...
# VITE_EMAILJS_PUBLIC_KEY=...
npm run dev
```

Open the printed URL, connect wallet (Sepolia), go to `/faucet`.

---

## 12. How to try NullYield as a judge / user

1. Connect wallet on **Sepolia**.
2. **/faucet** → **Claim 1,000 mUSDC** (24h per wallet).
3. Same page → **Wrap** into confidential **cUSDC**.
4. **/pool** → **Decrypt cUSDC** (EIP-712) → **Approve Null Pool operator** → amount or **MAX** → **Deposit encrypted**.
5. **/draws** (owner wallet for demo) → **Fund reserve** → set interval (e.g. `300`) → **Trigger → Reveal → Finalize**.  
   Non-owners see countdown, status, and history only.
6. **/account** → **Decrypt pending prize** → **Claim** → **Decrypt wallet cUSDC** to see the win land.
7. **/account** → **Withdraw principal** any time the pool is idle.

Everything runs on Sepolia against addresses in `frontend/src/contracts/addresses.json`.

---

## 13. Error handling

| Case | Handling |
|------|----------|
| Missing mUSDC approval | Auto-request `approve(MaxUint256)` before wrap |
| Missing pool operator | Explicit “Approve Null Pool operator” CTA on Pool |
| Insufficient cUSDC for deposit | Decrypted balance checked before deposit |
| Wrong network | Wagmi restricts to Sepolia (chainId 11155111) |
| FHE SDK not ready | Buttons disabled + status on Pool / Draws |
| Draw in progress | Deposits & withdrawals disabled with banner |
| Faucet cooldown (24h) | `FaucetCooldownActive` → toast + countdown |
| Custom contract errors | Maps `DrawNotDue`, `EmptyPool`, `NotAuthorizedKeeper`, `InvalidDrawState`, `IndexOutOfBounds`, etc. |
| Free-tier RPC block-range limits | `queryFilterChunked` + `nullYieldBlock` floor |

---

## 14. Project requirements — mapped to what is shipped

### Submission requirements

| # | Requirement | Status | Where |
|---|-------------|--------|--------|
| 1 | Publicly accessible web dApp on Sepolia | ✅ | Live URL at top |
| 2 | Full onchain cycle: deposit → draw → claim → withdraw | ✅ | Faucet, Pool, Draws, Account + `NullYield.sol` |
| 3 | Balances encrypted (ERC-7984 / encrypted integers) | ✅ | `ConfidentialToken` + `NullYield` `_shares` / `_pendingPrize` (`euint64`) |
| 4 | Onchain FHE winner selection, weighted, over encrypted balances, no offchain RNG | ✅ | `revealTotalAndSelectWinner` — `FHE.randEuint64` + `FHE.rem` + oblivious `_selectWinner` |
| 5 | No-loss principal, withdrawable anytime | ✅ | `withdraw` only touches `_shares`; blocked only during draw |
| 6 | Automate draws **or** documented keeper/admin flow | ✅ | Owner-gated operator panel on `/draws`: Trigger → Reveal → Finalize |
| 7 | EIP-712 user decryption of pool balance and winnings | ✅ | `useZamaEncrypt.decryptHandle` on shares, prize, wallet cUSDC |
| 8 | Faucet or clear instructions for test tokens | ✅ | `/faucet` (1,000 mUSDC / 24h) + this README |
| 9 | Open source public GitHub | ✅ | Repo link at top |

### Judging axes

| Axis | Coverage |
|------|----------|
| **Correctness** | Full cycle works; state machine enforced; ACL for user decrypt |
| **Confidentiality design** | Encrypted per-user accounting; oblivious FHE scan; KMS-verified total; documented leakage |
| **UX** | Dark/gold UI; step ordering; pending-draw state; MAX-with-decrypt; owner-only operator panel |
| **Code quality** | Clear separation; NatSpec; custom errors; RPC-friendly scans; env-driven config |
| **Production-readiness** | Single-active-draw; no-loss onchain; deploy syncs addresses + ABIs + blocks |

---

## 15. Roadmap

- **Encrypted segment tree** for O(log n) draw selection (beyond `MAX_DEPOSITORS = 50`)
- **Multi-tier prizes** (top-K winners per draw)
- **Real yield source adapter** (Aave / ERC-4626)
- **Unattended keeper** (Zama Node SDK)
- **Auto-finalize gateway callback** for unwrap completion
- **Multi-asset confidential pools**

---

## 16. License & credits

- **License:** BSD-3-Clause-Clear  
- **Built with:** [Zama](https://www.zama.ai/) fhEVM · [OpenZeppelin](https://www.openzeppelin.com/) confidential contracts · [RainbowKit](https://www.rainbowkit.com/) · [Wagmi](https://wagmi.sh/) · [ethers v6](https://docs.ethers.org/v6/)  
- **Inspired by:** [PoolTogether](https://pooltogether.com/) no-loss prize savings  

---

**NullYield = private savings, public fairness.**  
Deposit encrypted. Win fairly. Withdraw anytime.
```

---
