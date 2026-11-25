# Life Admin AI — Solana Commitment & Accountability dApp

**Life Admin AI** is a Solana-powered Web3 dApp that adds real economic accountability to personal commitments and recurring deadlines. Users stake SOL and mint an on-chain commitment NFT backed by immutable IPFS metadata. Completing the commitment and submitting proof before verification unlocks a SOL stake refund; missing the deadline or failing verification forfeits the stake.

---

## Key Features

- **Real SOL Staking & NFT Contracts:** Transfers staked SOL to the verifier/escrow address and mints a commitment NFT with IPFS metadata (`type: "commitment_v1"`).
- **Wallet-Authenticated Backend (`Ed25519` + HMAC Sessions):** Challenge-response signature verification (`POST /api/auth/challenge` → `POST /api/auth/verify`) issues short-lived Bearer tokens scoped to the connected wallet.
- **Server-Side IPFS Pinning Proxy:** Metadata and proof payloads are pinned via `POST /api/ipfs/pin` so `PINATA_JWT` never ships in the frontend bundle.
- **On-Chain Verification:** Backend tracking (`POST /api/track`), proof recovery (`POST /api/proof`), and refund approvals (`POST /api/approve`) verify SOL transfers and NFT ownership on Solana.
- **Verifier Dashboard:** Dedicated admin review UI for inspecting proof metadata and executing SOL refunds or stake forfeitures.
- **Automated Email & iCal Reminders:** Confirmation emails with `.ics` calendar events on creation plus background deadline reminder checks (`30` min urgency window, `2` hour notification cooldown).

---

## Tech Stack

- **Frontend:** React 19, Vite 7, Tailwind CSS 4, Framer Motion, React Three Fiber / Three.js (`React.lazy` code-split)
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
│   ├── app.js            # Express app factory, routes, rate limits, security headers
│   ├── auth.js           # Ed25519 challenge-verify & HMAC Bearer token validation
│   ├── config.js         # Env loading, CORS origins, verifier/escrow inspection
│   ├── db.js             # Write-through cached, queued atomic JSON storage
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

