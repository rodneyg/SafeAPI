# SafeAPI Monorepo

Foundation scaffold for SafeAPI: TypeScript SDK + Firebase cloud service with key escrow, re-encryption broker, signed audit/consent, usage metering, Stripe billing, and admin dashboard. Includes Firebase and Supabase adapters. Runnable demos and tests.

## Stack
- Monorepo with pnpm workspaces
- TypeScript everywhere (ESM)
- SDK: browser, Node 20+, edge compatible. PGP via openpgp, AES-GCM via WebCrypto
- Cloud: Firebase Functions (HTTP), Firestore, Firebase Auth, Hosting, Scheduler
 - Billing: Internal metering only (no payments); configure limits in Firestore
- Dashboard: React + Vite, Firebase Auth UI, Chart.js
- Adapters: Firebase (Firestore) and Supabase (Postgres)
- Lint/test/build: eslint, prettier, vitest, tsup

## Quick Start (Local + Emulators)

## Common jobs

### Verify content between users

Register the sender's public key using `/v1/keys/register` and provision its private signing key on the server. Call `/v1/sign` with the exact UTF-8 payload (or `base64:<data>` for exact binary bytes), then give the returned base64 signature and the same payload to `/v1/verify`. The sender opts in by signing; no page content is fetched or canonicalized.

### Make stored app data private

Call `/v1/seal/encrypt` before storing a payload. Keep the returned `ciphertext`, `meta`, and `kref` together. Call `/v1/seal/decrypt` with those values when an authorized app needs the original base64 payload. The service holds the AES-GCM key behind the key reference.

### Share a temporary encrypted link

Call `/v1/seal/link/create` with a payload, optional `expiresAt`, and optional `maxOpens`. Share only the returned opaque `openUrl`; revoke it through `/v1/seal/link/revoke`. The open path requires an authenticated project token and enforces expiry and the open limit.

`/v1/broker/*` remains the access-control layer for document keys. The `/v1/keys/*` endpoints are optional legacy key-management endpoints. Do not put key material or payload secrets in URLs.

Prereqs
1) Install: `npm i -g firebase-tools pnpm`  2) Login: `firebase login`
3) Create Firebase project; enable Firestore (Native), Functions, Hosting, Auth (Email/Google), Cloud Scheduler
4) (No Stripe) Configure Firestore project limits manually

Link project
```
firebase use <your-project-id>
```

Set Functions config
```
cd packages/cloud/functions
firebase functions:config:set jwt.secret="$(openssl rand -hex 32)"
firebase functions:config:set signing.private="<ed25519-private-key-base64>"
# (Stripe removed) No payment configs needed
```

Install deps and build
```
pnpm i
pnpm build
```

Start emulators
```
pnpm dev:emulator
```

Deploy (staging)
```
pnpm deploy
```

Create project + API key (Firestore)
- `projects/{projectId}`: `{ plan: 'free', limits: { cloudCallsPerMin: 120, cloudCallsPerDay: 10000 } }`
- `apiKeys/{randomKey}`: `{ projectId: '<projectId>', active: true, createdAt: <serverTimestamp> }`

Token exchange
```
curl -X POST https://<region>-<project-id>.cloudfunctions.net/api/v1/auth/token \
  -H "x-api-key: <your-api-key>" -H "Content-Type: application/json"
```

SDK demos
```
pnpm demo:sdk:node
pnpm demo:web   # open http://localhost:5173
```

Usage via curl (emulator)
```
# Exchange token (replace project and region per emulator banner)
curl -s -X POST "http://localhost:5001/<project-id>/<region>/api/v1/auth/token" \
  -H "x-api-key: <your-api-key>" -H "Content-Type: application/json"

# export TOKEN from response
export TOKEN="<paste-jwt>"

# Generate usage events
for i in {1..5}; do
  curl -s -X POST "http://localhost:5001/<project-id>/<region>/api/v1/usage/event" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{ "feature":"cloud_call", "inc":1 }' >/dev/null
done

# Read usage counters
curl -s -X GET "http://localhost:5001/<project-id>/<region>/api/v1/usage" \
  -H "Authorization: Bearer $TOKEN"
```

Notes
- Integration tests that require emulators are skipped by default; enable via env flags later.
- Dashboard and Playground host under Firebase Hosting; `/api/*` rewrites to Functions.
