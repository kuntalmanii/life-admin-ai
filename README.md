# Life Admin AI — AI-Verified Solana Commitment & Accountability dApp

**Life Admin AI** combines **AI task structuring & proof verification** with **Solana SOL staking and NFT contracts** to solve everyday procrastination on critical "life admin" responsibilities (bills, filings, renewals, health appointments, and engineering deadlines).

---

## Problem Statement & Solution

### The Problem
People routinely miss high-stakes personal and administrative deadlines (paying utilities, tax filings, visa/passport renewals, medical checkups, or shipping deliverables) because traditional to-do apps and calendar reminders carry **zero financial consequence** and **no objective verification** of whether a task was actually finished.

### Our Solution — AI + On-Chain Accountability
1. **AI Goal Coach (`POST /api/ai/plan`):** Converts natural-language life-admin tasks into a categorized commitment (`Finance & Bills`, `Legal & Documents`, `Health & Fitness`, `Engineering & Delivery`, `Study & Career`), refines the goal, recommends an accountability SOL stake, and defines **verifiable proof criteria** before locking funds.
2. **Real SOL Staking & NFT Contracts:** Transfers staked SOL on Solana and mints an on-chain commitment NFT via Metaplex Umi containing immutable IPFS metadata (`type: "commitment_v1"`).
3. **Automated Reminders (Email + `.ics`):** Sends calendar invites upon staking and scheduled urgency alerts (`30`-minute cutoff window with `2`-hour cooldowns).
4. **AI Proof Verification Copilot (`POST /api/proof` & `POST /api/ai/verify-proof`):** Automatically evaluates submitted proof links/descriptions against the original goal, proof criteria, and deadline — computing a structured verdict (`LIKELY_VALID`, `NEEDS_REVIEW`, `INSUFFICIENT`), confidence percentage (`0–100%`), matched criteria, and red flags for the Verifier Dashboard.
5. **On-Chain Settlement:** Approved proofs release the SOL stake refund; missed deadlines or rejected proofs forfeit the stake.

---

## Key Features

- **AI Goal Coach & Structured Criteria:** Powered server-side by Google Gemini (`GEMINI_API_KEY`) with a deterministic local NLP/rubric engine fallback so planning and proof verification work reliably both with and without an external LLM key.
- **AI Proof Copilot Badges & On-Demand Audit:** Users receive immediate AI confidence feedback on proof submission, and verifiers see AI verdicts directly on queue cards and inside the Proof Details modal.
- **Real SOL Staking & Metaplex Umi NFTs:** Transfers staked SOL and mints lightweight commitment NFTs without legacy bundle bloat.
- **Wallet-Authenticated Backend (`Ed25519` + HMAC Sessions):** Challenge-response signature verification (`POST /api/auth/challenge` → `POST /api/auth/verify`) issues short-lived Bearer tokens scoped to the connected wallet.
- **Server-Side Security Proxies:** Pinata JWT (`POST /api/ipfs/pin`) and Gemini API keys (`POST /api/ai/*`) stay strictly on the server; tracking and proof recovery verify SOL transfers (`verifySolTransfer`) and NFT ownership (`verifyNftOwnership`) on-chain.
- **Persistent SQLite WAL Storage:** Built-in `node:sqlite` (`WAL` mode + serialized queues) with automatic one-time migration from `db.json`.

---

## Tech Stack

- **Frontend:** React 19, Vite 7, Tailwind CSS 4, Framer Motion, React Three Fiber / Three.js (`React.lazy` code-split)
- **AI Layer:** Server-side Gemini REST API (`gemini-2.5-flash`) + deterministic Life Admin NLP & proof scoring engine (`backend/ai.js`)
- **Solana & Storage:** `@solana/web3.js`, Metaplex Umi (`@metaplex-foundation/umi`, `@metaplex-foundation/mpl-token-metadata`), Solana Wallet Adapter (`SolflareWalletAdapter`), Pinata IPFS
- **Backend:** Node.js (built-in `node:sqlite` WAL storage + `node:crypto` Ed25519), Express 5, `nodemailer`
- **Testing & Quality:** Vitest, Testing Library (`jsdom`), Supertest, ESLint

---

## Project Structure

```text
├── src/
│   ├── components/       # UI views, forms, proof modal, verifier dashboard, toast
│   ├── hooks/            # Commitment state & accessible modal hooks
│   ├── services/         # Authenticated API client (challenge/sign/retry)
│   ├── ipfs/             # IPFS upload helpers
│   ├── solana/           # Singleton RPC connection, mint/stake creation, NFT fetch
│   └── utils/            # Sorting/formatting helpers and cached IPFS JSON fetcher
├── backend/
│   ├── ai.js             # AI Goal Coach & Proof Copilot (Gemini + deterministic fallback)
│   ├── app.js            # Express app factory, routes, rate limits, security headers
│   ├── auth.js           # Ed25519 challenge-verify & HMAC Bearer token validation
│   ├── config.js         # Env loading, CORS origins, verifier/escrow inspection
│   ├── db.js             # WAL SQLite (node:sqlite) + atomic JSON storage
│   ├── mailer.js         # Escaped HTML emails, CRLF-safe headers, iCal generator
│   ├── reminderJob.js    # Scheduled reminder checker
│   ├── solanaVerify.js   # On-chain SOL transfer & NFT ownership verification
│   └── scripts/          # Standalone wallet/email utility scripts
└── tests/                # Unit, component/a11y, reminder job, and API integration tests
```

---

## Getting Started

### 1. Install Dependencies

```bash
npm install --legacy-peer-deps
```

> `--legacy-peer-deps` is required due to upstream peer dependency ranges in Solana Wallet Adapter / Metaplex packages with React 19.

### 2. Configure Environment Variables

Copy both templates and fill in your credentials:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

- **Frontend (`.env`):**
  - `VITE_API_URL` — Backend URL (default `http://localhost:3001`)
  - `VITE_SOLANA_NETWORK` — Solana cluster (`testnet`)
  - `VITE_SOLANA_RPC_URL` — Optional custom Solana RPC endpoint (defaults to `clusterApiUrl(VITE_SOLANA_NETWORK)`)
  - `VITE_VERIFIER_WALLET` — Public key of the verifier wallet receiving stakes & reviewing proofs

- **Backend (`backend/.env`):**
  - `PINATA_JWT` — Pinata JWT used server-side by `POST /api/ipfs/pin`
  - `GEMINI_API_KEY` & `GEMINI_MODEL` — Optional Google Gemini API config for AI Goal Coach & Proof Copilot (uses deterministic rubric fallback if unset)
  - `AUTH_SECRET` — Long random secret used to sign Bearer session tokens (required in production so restarts do not invalidate sessions)
  - `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM` — SMTP settings for reminders
  - `APP_URL` & `ALLOWED_ORIGINS` — Frontend origin(s) permitted by CORS
  - `DEFAULT_VERIFIER`, `SOLANA_NETWORK`, `SOLANA_RPC_URL`, `ESCROW_KEYPAIR_PATH`
  - `DB_FILE` — Persistence path (default `./backend/db.sqlite` using built-in `node:sqlite` WAL mode with automatic one-time migration from `db.json`; `.json` paths also supported)
  - `ALLOW_SERVER_REFUND=false` — Leave `false` when refunds are signed in-browser by the connected verifier wallet
  - `ENABLE_TEST_EMAIL=false` — Keeps `/api/test-email` disabled in production

### 3. Run Locally

```bash
npm run dev
```

Starts both the Vite frontend (`http://localhost:5173`) and the Express backend (`http://localhost:3001`) concurrently.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Run Vite client and `--watch` Node backend together |
| `npm run client` | Start Vite frontend dev server only |
| `npm run server` | Start Express backend (`node --watch backend/index.js`) |
| `npm test` | Run full Vitest suite (unit, backend integration, component & a11y) |
| `npm run test:watch` | Run Vitest in watch mode |
| `npm run lint` | Run ESLint across `src/`, `backend/`, and `tests/` |
| `npm run build` | Build production frontend bundle to `dist/` |
| `npm run preview` | Preview built `dist/` bundle locally |

---

## Security & Operational Notes

- **Wallet Signatures & Ownership:** Creating/pinning commitments, viewing private tracked commitments, submitting proofs, and approving/rejecting tasks all require a valid wallet-signed Bearer token (`Authorization: Bearer <token>`).
- **Escrow Keypair Alignment:** If `escrow.json` does not match `DEFAULT_VERIFIER` (or `ALLOW_SERVER_REFUND` is `false`), server-side automatic refunds stay disabled and verifier approvals must be signed in the UI by the connected `DEFAULT_VERIFIER` wallet.
- **Production Readiness:** Before deploying to Mainnet, configure a persistent `AUTH_SECRET`, set a dedicated `SOLANA_RPC_URL` / `VITE_SOLANA_RPC_URL`, host `DB_FILE` (`db.sqlite`) on persistent storage (or swap to PostgreSQL for multi-instance serverless hosting), and consider migrating staking to an on-chain Anchor PDA escrow program.

UV7RR3

