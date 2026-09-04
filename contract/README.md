Here is the fully updated README with all renames applied and a new **Hackathon Requirements** section that explicitly maps every requirement to the implementation:

---

# 🔒 NullYield — Confidential No-Loss Prize Savings

> **No-loss prize savings powered by Fully Homomorphic Encryption (Zama fhEVM v0.9) and ERC-7984 confidential tokens.**

---

## Table of Contents

1. [Overview](#overview)
2. [Hackathon Requirements Checklist](#hackathon-requirements-checklist)
3. [Why Confidentiality Matters](#why-confidentiality-matters)
4. [Architecture](#architecture)
5. [Contract System](#contract-system)
6. [Core Flows](#core-flows)
7. [Draw Mechanics & Fairness](#draw-mechanics--fairness)
8. [Confidentiality Design & Leakage Analysis](#confidentiality-design--leakage-analysis)
9. [Mock Yield Source](#mock-yield-source)
10. [Getting Started](#getting-started)
11. [Deployment](#deployment)
12. [User Guide](#user-guide)
13. [Technical Details](#technical-details)
14. [Production Roadmap](#production-roadmap)
15. [License](#license)

---

## Overview

NullYield recreates the beloved **no-loss prize savings** mechanic (popularized by PoolTogether) with a critical upgrade: **full balance confidentiality via FHE**.

On a transparent chain, prize pools leak everything:
- How much every user has saved
- Each wallet's odds of winning
- Who won every draw

This exposes users' wealth, makes large depositors targets, and discourages participation.

**NullYield eliminates this trade-off.** Deposits and balances stay encrypted onchain. Draws remain provably fair and deposit-weighted. Only the winner learns the outcome. Your principal is always withdrawable — no loss, ever.

---

## Hackathon Requirements Checklist

> **Requirement:** *"Build a production-ready dApp that recreates the core PoolTogether mechanic — no-loss prize savings — with confidentiality powered by the Zama Protocol."*

| # | Requirement | How NullYield Meets It | Location |
|---|---|---|---|
| 1 | **Live web dApp with wallet connect** | Frontend deployed at a public URL; MetaMask wallet connect for all features | Frontend app |
| 2 | **Full cycle: deposit → draw → claim → withdraw** | All four operations are onchain smart contract calls with a complete end-to-end flow | `NullYield.sol`: `deposit()`, 3-step draw, `claim()`, `withdraw()` |
| 3 | **Encrypted individual balances (ERC-7984)** | `ConfidentialToken.sol` implements OpenZeppelin's `ERC7984ERC20Wrapper`; pool stores per-user shares as `euint64` ciphertexts — no plaintext balances ever touch chain state | `ConfidentialToken.sol`, `NullYield.sol` `_shares` mapping |
| 4 | **FHE randomness weighted by deposit size** | `FHE.randEuint64()` generates onchain randomness; `FHE.rem(rand, clearTotal)` maps it uniformly to `[0, totalShares)`; an oblivious linear scan over encrypted `_shares[]` selects the winner with probability exactly `shares_i / totalShares` — no offchain RNG, no plaintext balances | `NullYield.sol`: `revealTotalAndSelectWinner()`, `_selectWinner()` |
| 5 | **No-loss guarantee** | Principal (`_shares`) and prize yield (`_prizeReserve`) are strictly isolated state variables; `withdraw()` only moves `_shares[msg.sender]` and never touches `_prizeReserve` | `NullYield.sol`: `withdraw()` |
| 6 | **Automated or documented keeper draw flow** | Keeper/owner triggers a 3-step state machine: `triggerDraw()` → `revealTotalAndSelectWinner()` → `finalizeDraw()`. `PrizeReserve.sol` automates yield distribution on a timer | `NullYield.sol`, `PrizeReserve.sol` |
| 7 | **EIP-712 user decryption** | `FHE.allow(_shares[user], user)` and `FHE.allow(_pendingPrize[winner], winner)` grant per-user ACL; frontend uses `fhevmjs.reencrypt()` with EIP-712 signatures so only the connected wallet can decrypt its own balance and winnings | `NullYield.sol`: `deposit()`, `finalizeDraw()`; Frontend SDK |
| 8 | **Test token faucet** | `MockERC20.sol` includes a `faucet()` function dispensing 10,000 mUSDC per wallet with a 1-hour cooldown | `MockERC20.sol`: `faucet()` |

---

## Why Confidentiality Matters

| Transparent Pool (PoolTogether V4) | NullYield (FHE) |
|---|---|
| Anyone sees every deposit amount | 🔒 Individual balances encrypted |
| Odds are publicly calculable | 🔒 Odds computed over ciphertexts |
| Winner identity is public | 🔒 Only winner can decrypt prize |
| Large depositors are targets | 🔒 No observer knows who holds what |
| Wealth exposure discourages saving | 🔒 Private savings, public fairness |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                       NULLYIELD ECOSYSTEM                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐    shield     ┌──────────────────┐  confidential  │
│  │  MockERC20  │ ──────────→  │ ConfidentialToken │  TransferFrom  │
│  │  (mUSDC)    │  deposit()   │ (ERC-7984)       │ ────────────→  │
│  │  6 decimals │              │  cUSDC            │                │
│  └──────┬──────┘              └──────┬────────────┘                │
│         │                            │                              │
│         │  fund()                    │  confidentialTransferFrom    │
│         ▼                            │                              │
│  ┌──────────────┐                    ▼                              │
│  │ PrizeReserve │ ── shield + ──→ ┌──────────────┐                 │
│  │ (mock yield) │  fundPrizeFrom  │  NullYield   │                 │
│  │              │  Reserve()      │              │                 │
│  │ 10,000 mUSDC │                 │  _shares[]   │ ← encrypted     │
│  │ 100/draw     │                 │  _prizeRes.  │ ← encrypted     │
│  │ every 5 min  │                 │  _totalShares│ ← encrypted     │
│  └──────────────┘                 │              │                 │
│                                    │  3-Step Draw │                 │
│                                    │  State Machine│                │
│                                    └──────┬───────┘                 │
│                                           │                         │
│                                           ▼                         │
│                                    ┌──────────────┐                 │
│                                    │   Winner     │                 │
│                                    │  _pendingPrize│ ← encrypted    │
│                                    │   .claim()   │                 │
│                                    └──────────────┘                 │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Contract System

| Contract | File | Role |
|----------|------|------|
| **MockERC20** | `MockERC20.sol` | Plaintext ERC-20 test token with per-address faucet (10k tokens/hr) |
| **ConfidentialToken** | `ConfidentialToken.sol` | ERC-7984 confidential wrapper (cUSDC) — shields/unshields ERC-20 ↔ euint64 |
| **NullYield** | `NullYield.sol` | Core pool — encrypted deposits, 3-step FHE draw, no-loss withdraw |
| **PrizeReserve** | `PrizeReserve.sol` | Automated mock yield source — periodically tops up encrypted prize pool |

### Dependencies

| Library | Version | Purpose |
|---------|---------|---------|
| `@fhevm/solidity` | ^0.9.0 | FHE operations, `ZamaEthereumConfig`, encrypted types |
| `@openzeppelin/confidential-contracts` | ^0.1.0 | ERC-7984 interface and wrapper |
| `@openzeppelin/contracts` | ^5.1.0 | ERC20, Ownable2Step, ReentrancyGuard |

---

## Core Flows

### 1. Deposit Flow

```
User                     ConfidentialToken (ERC-7984)         NullYield
 │                                    │                            │
 │  1. approve(ConfToken, amount)     │                            │
 │ ──────────────────────────────────→│                            │
 │                                    │                            │
 │  2. deposit(amount, user)          │                            │
 │ ──────────────────────────────────→│                            │
 │    ERC-20 transferred in           │                            │
 │    Encrypted cUSDC balance minted  │                            │
 │                                    │                            │
 │  3. setOperator(NullYield, expiry) │                            │
 │ ──────────────────────────────────→│                            │
 │                                    │                            │
 │  4. deposit(encryptedAmount, proof)│                            │
 │ ──────────────────────────────────────────────────────────────→  │
 │                                    │  confidentialTransferFrom  │
 │                                    │←─────────────────────────  │
 │                                    │  encrypted shares updated  │
 │  ✅ Deposited! Balance encrypted   │                            │
```

**Key properties:**
- The plaintext amount is encrypted via `FHE.fromExternal()` before entering pool state
- Individual `_shares[user]` is `euint64` — no observer can read it
- `FHE.allow(_shares[user], user)` grants only the depositor EIP-712 decryption rights

### 2. Withdraw Flow (No-Loss Guarantee)

```
User                          NullYield              ConfidentialToken
 │                               │                            │
 │  1. withdraw()                │                            │
 │ ────────────────────────────→  │                            │
 │    _shares[user] → 0          │                            │
 │    _totalShares -= amount     │                            │
 │                               │  confidentialTransfer      │
 │                               │─────────────────────────→  │
 │                               │  encrypted cUSDC credited  │
 │                               │                            │
 │  2. withdraw(amount, user)    │                            │
 │ ────────────────────────────────────────────────────────→   │
 │    Unshield: encrypted → ERC-20                            │
 │  ✅ Full principal returned!                               │
```

**No-loss invariant:** `withdraw()` only ever moves `_shares[msg.sender]`. It never touches `_prizeReserve`. Principal and prizes are strictly isolated.

### 3. Draw Flow (3-Step State Machine)

```
Keeper/Owner         NullYield             KMS/Relayer          Winner
    │                   │                      │                  │
    │ triggerDraw()     │                      │                  │
    │ ───────────────→  │                      │                  │
    │  state=AWAITING   │                      │                  │
    │  _TOTAL_DECRYPTION│                      │                  │
    │  makePublicly     │                      │                  │
    │  Decryptable(     │                      │                  │
    │   _totalShares)   │                      │                  │
    │                   │                      │                  │
    │       [off-chain: publicDecrypt(_totalShares)]              │
    │                   │                      │                  │
    │ revealTotalAnd    │                      │                  │
    │ SelectWinner(     │                      │                  │
    │  drawId,          │                      │                  │
    │  clearTotal,      │                      │                  │
    │  proof)           │                      │                  │
    │ ───────────────→  │                      │                  │
    │  checkSignatures  │                      │                  │
    │  rand = rem(      │                      │                  │
    │   randEuint64(),  │                      │                  │
    │   clearTotal)     │                      │                  │
    │  _selectWinner()  │                      │                  │
    │  state=AWAITING   │                      │                  │
    │  _WINNER_DECRYPTION│                     │                  │
    │                   │                      │                  │
    │       [off-chain: publicDecrypt(winnerIndex)]               │
    │                   │                      │                  │
    │ finalizeDraw(     │                      │                  │
    │  drawId,          │                      │                  │
    │  clearWinnerIdx,  │                      │                  │
    │  proof)           │                      │                  │
    │ ───────────────→  │                      │                  │
    │  checkSignatures  │                      │                  │
    │  _pendingPrize    │                      │                  │
    │   [winner] +=     │                      │                  │
    │   prizeToAward    │                      │                  │
    │  state=IDLE       │                      │                  │
    │                   │                      │                  │
    │                   │         claim()       │                  │
    │                   │  ←───────────────────────────────────   │
    │                   │  confidentialTransfer → ConfidentialToken│
    │                   │                      │     unshield     │
    │                   │                      │  ←────────────   │
    │                   │                      │  ERC-20 prize!   │
```

---

## Draw Mechanics & Fairness

### Winner Selection Algorithm

The draw uses an **oblivious linear scan** over encrypted balances:

```
1. rand = FHE.randEuint64() % clearTotal    // uniform in [0, totalShares)
2. cumulative = 0
3. for each depositor i:
     cumulative += encrypted_shares[i]
     matched = AND(NOT(found), LE(rand, cumulative))
     winnerIndex = SELECT(matched, i, winnerIndex)
     found = OR(found, matched)
```

**Why this is fair:**
- `clearTotal` is **cryptographically authenticated** via KMS signatures — it cannot be manipulated
- `FHE.rem(rand, clearTotal)` produces a **mathematically exact uniform distribution** over `[0, totalShares)`
- Each depositor "owns" a contiguous range of the random space proportional to their deposit
- Probability of winning = `deposit_i / totalShares` — exactly proportional

**Why this is confidential:**
- Every comparison (`FHE.le`, `FHE.and`, `FHE.or`, `FHE.select`) operates over ciphertexts
- No early exit — all N iterations execute regardless of when the winner is found
- No data-dependent gas or control flow that could leak which depositor matched

### Why Not `FHE.min(rand, POOL_CAP)`?

Earlier versions drew over a large public constant and clamped with `FHE.min`. This creates a **catastrophic bias**: if `POOL_CAP = 50T` and `totalShares = 3,000`, the last depositor wins ~99.9999% of the time because `FHE.min` collapses nearly all random values to the upper bound. The 3-step KMS-verified approach eliminates this entirely.

---

## Confidentiality Design & Leakage Analysis

### What Stays Encrypted 🔒

| Data | Type | Visibility |
|------|------|-----------|
| Individual deposit amounts | `euint64` | Only the depositor (EIP-712) |
| Per-user share balances | `euint64` | Only the depositor (EIP-712) |
| Per-user pending prizes | `euint64` | Only the winner (EIP-712) |
| Total shares (during normal ops) | `euint64` | Encrypted; revealed only during draw |
| Prize reserve balance | `euint64` | Encrypted |
| Random draw threshold | `euint64` | Never revealed |
| Cumulative sums during scan | `euint64` | Never revealed |
| Comparison results during scan | `ebool` | Never revealed |

### What Is Public (Necessary Leakage)

| Data | Why It's Public | Impact |
|------|----------------|--------|
| Depositor addresses | Required for draw iteration | Observers know WHO participates, not HOW MUCH |
| Total pool size (once per draw) | Required for unbiased `FHE.rem` modulus | Same leakage as any transparent pool; individual balances remain hidden |
| Winner address (after draw) | Required to route the prize | Unavoidable — same as any lottery |
| Draw timing | Onchain transactions are public | No privacy impact |
| Number of depositors | Observable from address array | Minimal — bounded by `MAX_DEPOSITORS = 50` |

### Leakage Summary

> An observer learns: (1) which addresses participate, (2) the total pool size at draw time, and (3) who won each draw.
>
> An observer does NOT learn: (1) any individual's deposit size, (2) any individual's odds, (3) the relative ranking of depositors, or (4) the prize amount won.

---

## Mock Yield Source

### How It Works Now

The `PrizeReserve` contract simulates yield:
1. Admin funds it with plaintext ERC-20 via `fund()`
2. A keeper calls `distribute()` every `distributionInterval` (5 min for demo)
3. `distribute()` shields ERC-20 → ConfidentialToken (cUSDC), then injects encrypted tokens into NullYield's `_prizeReserve`

### How a Real Yield Source Would Plug In

Replace `PrizeReserve.fund()` + `distribute()` with a yield-harvesting hook:

```solidity
// Example: Aave integration
function harvestAndDistribute() external {
    uint256 currentATokenBalance = aToken.balanceOf(address(this));
    uint256 yield = currentATokenBalance - principalDeposited;
    
    // Redeem aToken → underlying ERC-20
    aavePool.withdraw(address(underlying), yield, address(this));
    
    // Shield and distribute (same as mock)
    confidentialToken.deposit(yield, address(this));
    nullYield.fundPrizeFromReserve(uint64(yield));
}
```

The interface is identical — only the source of plaintext ERC-20 changes.

---

## Getting Started

### Prerequisites

- Node.js v18+
- MetaMask wallet
- Zama devnet ETH (for gas) — get from [Zama Faucet](https://faucet.zama.ai)

### Installation

```bash
git clone https://github.com/your-repo/nullyield.git
cd nullyield
npm install
```

### Packages

| Package | Purpose |
|---------|---------|
| `@fhevm/solidity@^0.9.0` | FHE library, `ZamaEthereumConfig` |
| `@openzeppelin/confidential-contracts@^0.1.0` | ERC-7984 wrapper |
| `@openzeppelin/contracts@^5.1.0` | Base contracts |
| `fhevmjs@^0.6.0` | Client SDK for encryption/decryption |
| `hardhat@^2.22.0` | Compilation & deployment |
| `ethers@^6.13.0` | Ethereum interaction |

### Compile

```bash
npx hardhat compile
```

### Test

```bash
npx hardhat test
```

---

## Deployment

### Environment Variables

```env
PRIVATE_KEY=your_deployer_private_key
ZAMA_DEVNET_RPC_URL=https://devnet.zama.ai
```

### Deploy All Contracts

```bash
npx hardhat run scripts/deploy.js --network zamaDevnet
```

### Deployment Order

1. `MockERC20` — test token
2. `ConfidentialToken` — ERC-7984 wrapper (takes MockERC20 address)
3. `NullYield` — core pool (takes ConfidentialToken address)
4. `PrizeReserve` — yield source (takes all three addresses)
5. Wire: `NullYield.setPrizeReserve(PrizeReserve.address)`

### Post-Deploy Configuration

```javascript
// Set draw interval to 5 minutes for demo
await nullYield.setDrawInterval(300);

// Seed prize reserve with 10,000 tokens
await mockERC20.mint(prizeReserve.address, 10_000e6);
```

---

## User Guide

### Step 1: Get Test Tokens
1. Connect MetaMask to Zama Devnet
2. Click **"Claim Faucet"** → receive 10,000 mUSDC
3. Cooldown: 1 hour between claims

### Step 2: Shield Tokens
1. Approve ConfidentialToken to spend your mUSDC
2. Call `confidentialToken.deposit(amount, yourAddress)`
3. Your mUSDC is now encrypted as cUSDC

### Step 3: Deposit into Pool
1. Set NullYield as operator on ConfidentialToken
2. Call `nullYield.deposit(encryptedAmount, proof)`
3. Your balance is encrypted — nobody can see it

### Step 4: View Your Balance
1. Call `nullYield.sharesOf(yourAddress)` → get ciphertext handle
2. Use Zama SDK + EIP-712 signature to re-encrypt for your eyes only
3. Decrypt client-side

### Step 5: Prize Draw
1. Wait for the draw timer to expire
2. Keeper triggers the 3-step draw flow
3. Winner is selected via FHE-weighted randomness over encrypted balances

### Step 6: Claim Winnings
1. Decrypt your `_pendingPrize` via EIP-712
2. Call `nullYield.claim()`
3. Encrypted prize transfers to your ConfidentialToken balance
4. Unshield to mUSDC

### Step 7: Withdraw Principal
1. Call `nullYield.withdraw()` at any time
2. Full principal returned — no loss, no lock-up

---

## Technical Details

### FHE Operations Used

| Operation | Where | Purpose |
|-----------|-------|---------|
| `FHE.fromExternal()` | `deposit()` | Import user-encrypted input |
| `FHE.asEuint64()` | Constructor, resets | Create encrypted constants |
| `FHE.add()` / `FHE.sub()` | Accounting | Encrypted balance arithmetic |
| `FHE.min()` | `deposit()`, `finalizeDraw()` | Clamping deposits and prizes |
| `FHE.randEuint64()` | `revealTotalAndSelectWinner()` | Cryptographic onchain randomness |
| `FHE.rem()` | `revealTotalAndSelectWinner()` | Uniform modular reduction for weighted draw |
| `FHE.le()` | `_selectWinner()` | Encrypted comparison |
| `FHE.and()` / `FHE.or()` / `FHE.not()` | `_selectWinner()` | Encrypted boolean logic |
| `FHE.select()` | `_selectWinner()` | Branchless conditional assignment |
| `FHE.allow()` / `FHE.allowThis()` | Throughout | ACL management for EIP-712 decryption |
| `FHE.allowTransient()` | Transfers | One-time transfer permissions |
| `FHE.makePubliclyDecryptable()` | Draw steps 1 & 2 | Queue for KMS decryption |
| `FHE.checkSignatures()` | Draw steps 2 & 3 | Verify KMS proof |
| `FHE.toBytes32()` | Draw finalization | Handle serialization |

### Gas & Scale Limits

| Parameter | Value | Reason |
|-----------|-------|--------|
| `MAX_DEPOSITORS` | 50 | O(n) encrypted scan per draw |
| `MAX_DEPOSIT` | 1,000,000 USDC | euint64 range safety |
| `drawInterval` | 5 min (demo) | Fast iteration for judging |

### Error Handling

| Error | When | User Action |
|-------|------|-------------|
| `PoolFull` | 50 depositors reached | Wait for a withdrawal |
| `NotDepositor` | Withdraw with no deposit | Deposit first |
| `DrawNotDue` | Timer hasn't expired | Wait for countdown |
| `DrawInProgress` | Deposit/withdraw during draw | Wait for draw to finalize |
| `EmptyPool` | No depositors | Need ≥1 depositor |
| `InvalidDrawState` | Out-of-order draw calls | Follow 3-step sequence |
| `InsufficientReserve` | Prize reserve empty | Admin must fund |

---

## Production Roadmap

| Feature | Status | Notes |
|---------|--------|-------|
| Encrypted individual balances | ✅ Shipped | euint64 per user |
| KMS-verified unbiased draws | ✅ Shipped | 3-step state machine |
| No-loss withdraw | ✅ Shipped | Principal isolated from prizes |
| ERC-7984 integration | ✅ Shipped | ConfidentialToken (cUSDC) wrapper |
| Automated prize distribution | ✅ Shipped | PrizeReserve keeper |
| EIP-712 user decryption | ✅ Shipped | Client-side re-encryption |
| Real yield source (Aave/Compound) | 🔲 Planned | Same interface, different source |
| O(log n) encrypted segment tree | 🔲 Planned | Replace linear scan for scale |
| Multiple prize tiers | 🔲 Planned | Top N winners per draw |
| Time-weighted deposits | 🔲 Planned | Longer deposits → better odds |
| Fully private winner identity | 🔲 Planned | Encrypted prize routing |
| Chainlink Automation keeper | 🔲 Planned | Replace manual trigger |
| Multi-token pools | 🔲 Planned | Support multiple ERC-20s |

---

## License

BSD-3-Clause-Clear

---

## Acknowledgments

- [Zama](https://www.zama.org/) — fhEVM, FHE coprocessor, and KMS infrastructure
- [PoolTogether](https://pooltogether.com/) — Original no-loss prize savings concept
- [OpenZeppelin](https://openzeppelin.com/) — Confidential contracts and ERC-7984 standard

---

