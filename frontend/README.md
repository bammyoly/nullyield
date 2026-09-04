# NullYield Frontend

The production web dApp for **NullYield** — a confidential no-loss prize savings protocol powered by Zama fhEVM, ERC-7984, and Fully Homomorphic Encryption.

Built with React, Vite, Tailwind CSS, Wagmi, RainbowKit, and Framer Motion.

**Live URL:** _[Insert Vercel/Netlify Link]_

---

## 🏗️ Architecture

| Layer | Stack |
|-------|-------|
| Framework | React 18 + Vite |
| Web3 | Wagmi v2 + RainbowKit + ethers.js v6 |
| FHE SDK | `@zama-fhe/relayer-sdk/web` (encrypt, user-decrypt, public-decrypt) |
| Styling | Tailwind CSS + custom dark/gold design system |
| Animations | Framer Motion |
| Notifications | EmailJS (win alerts) + custom Toast system |
| Contract Sync | ABIs + `addresses.json` auto-exported from Hardhat `deploy.js` |

---

## 📁 Key File Structure

```text
src/
├── components/          # Navbar, Toaster
├── config/              # Wagmi / RainbowKit network config
├── contracts/           # Auto-synced from Hardhat
│   ├── addresses.json   # Deployed addresses + block anchors
│   ├── MockERC20.json
│   ├── ConfidentialToken.json
│   ├── NullYield.json
│   └── PrizeReserve.json
├── hooks/
│   ├── useZamaEncrypt.js   # FHE encrypt / decrypt / publicDecrypt
│   └── useCountdown.js     # Draw & faucet timers
├── lib/
│   ├── zamaEncrypt.js      # Low-level Zama relayer helpers
│   ├── notifications.js    # EmailJS win alerts (VITE_APP_URL)
│   └── getLogsChunked.js   # RPC-friendly event scanning
└── pages/
    ├── Home.jsx            # Marketing landing + live stats
    ├── Faucet.jsx          # Claim mUSDC + wrap/unwrap cUSDC
    ├── Pool.jsx            # Operator approve + encrypted deposit
    ├── Draws.jsx           # 3-step draw UI + operator panel
    └── Account.jsx         # Decrypt balances, claim, withdraw, alerts
```

---

## 🔐 FHE Integration (Fully Wired)

The Zama Relayer SDK is fully integrated — no placeholders remain.

| Feature | File | Implementation |
|---------|------|----------------|
| **Encrypt deposit / fund / unwrap** | `useZamaEncrypt.encryptAmount` | `createEncryptedInput` → `add64` → `encrypt()` → handle + proof |
| **User decrypt (EIP-712)** | `useZamaEncrypt.decryptHandle` | Keypair + `createEIP712` → wallet `signTypedData` → `userDecrypt` |
| **Public decrypt (draw KMS)** | `useZamaEncrypt.publicDecryptHandle` | `publicDecrypt` for `makePubliclyDecryptable` handles (total shares, winner index) |
| **ACL-aware balance reads** | `Account.jsx`, `Pool.jsx` | `sharesOf` / `pendingPrizeOf` / `confidentialBalanceOf` → decrypt only if `FHE.allow` granted |
| **Log scan floor** | `Draws.jsx`, `Account.jsx` | `fromBlock = addresses.nullYieldBlock` to avoid RPC range limits |

---

## 🔄 User Flows Supported

1. **Claim** — `MockERC20.faucet()` → 1,000 mUSDC / 24h  
2. **Shield** — wrap mUSDC → encrypted cUSDC (ERC-7984)  
3. **Deposit** — encrypt amount client-side → `NullYield.deposit(handle, proof)`  
4. **Draw** — keeper 3-step: Trigger → Reveal total (KMS) → Finalize winner  
5. **Claim prize** — EIP-712 decrypt pending prize → `NullYield.claim()`  
6. **Withdraw** — full principal back as cUSDC (no-loss)  
7. **Unshield** — cUSDC → mUSDC via unwrap + finalizeUnwrap  

---

## ⚙️ Environment Variables

Create `frontend/.env` (see `.env.example`):

```env
# RPC
VITE_SEPOLIA_RPC_URL=https://ethereum-sepolia-rpc.publicnode.com

# WalletConnect
VITE_WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id

# Zama Relayer (defaults work on Sepolia testnet)
VITE_RELAYER_URL=https://relayer.testnet.zama.org

# App URL (used in EmailJS "Claim" button links)
VITE_APP_URL=https://your-production-app.vercel.app

# EmailJS win notifications
VITE_EMAILJS_SERVICE_ID=service_xxx
VITE_EMAILJS_TEMPLATE_ID=template_xxx
VITE_EMAILJS_PUBLIC_KEY=user_xxx
```

---

## 🚀 Running Locally

```bash
# 1. Install
cd frontend
npm install

# 2. Env
cp .env.example .env
# fill VITE_WALLETCONNECT_PROJECT_ID and optional EmailJS keys

# 3. Ensure contracts are deployed & ABIs synced
# (from monorepo root / contract folder)
# npx hardhat run scripts/deploy.js --network sepolia

# 4. Dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## 📦 Production Build

```bash
npm run build
npm run preview   # optional local preview of dist/
```

Deploy the `dist/` folder to Vercel, Netlify, or IPFS.

**Vercel tip:** set all `VITE_*` variables in Project → Settings → Environment Variables, then redeploy.

---

## 🔗 Contract Address Sync

After every Hardhat deploy, `scripts/deploy.js` writes:

- `frontend/src/contracts/addresses.json` — addresses + `nullYieldBlock` scan floor  
- `frontend/src/contracts/*.json` — ABIs for MockERC20, ConfidentialToken, NullYield, PrizeReserve  

No manual ABI copy is required.

---

## 🎨 Design System Notes

- Dark background (`#0B0C0E` / `#12141C`) with gold accent (`#F0B429`)
- `gradient-text` / `btn-primary` / `card` utility classes in `index.css`
- Framer Motion page transitions and micro-interactions
- RainbowKit themed to match NullYield gold palette

---

## 📚 Related Docs

- Protocol / contracts README (repo root)
- [Zama fhEVM docs](https://docs.zama.ai/)
- [OpenZeppelin Confidential Contracts (ERC-7984)](https://docs.openzeppelin.com/)

---

## License

BSD-3-Clause-Clear
```

---
