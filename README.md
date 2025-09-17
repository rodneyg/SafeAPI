# SafeAPI Monorepo

Foundation scaffold for SafeAPI: TypeScript SDK + Firebase cloud service with key escrow, re-encryption broker, signed audit/consent, usage metering, Stripe billing, and admin dashboard. Includes Firebase and Supabase adapters. Runnable demos and tests.

## Three Common Jobs

SafeAPI v0.2 provides first-class endpoints for the most common cryptographic use cases:

### 1. Sign/Verify Content Between Users
Verify content authenticity when the sender participates:

```typescript
// Sign content
const signResponse = await fetch('/v1/sign', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ payload: 'Hello, trusted recipient!' })
});
const { signature, alg, signedAt } = await signResponse.json();

// Verify content
const verifyResponse = await fetch('/v1/verify', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    payload: 'Hello, trusted recipient!', 
    signature 
  })
});
const { valid, signer } = await verifyResponse.json();
```

### 2. Make Your App Secure (Encrypt Before Storing)
Encrypt payloads before storing them in your database:

```typescript
// Encrypt sensitive data
const encryptResponse = await fetch('/v1/seal/encrypt', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    payload: 'sensitive user data',
    recipients: ['user_123', 'user_456']
  })
});
const { ciphertext, kref } = await encryptResponse.json();

// Later, decrypt the data
const decryptResponse = await fetch('/v1/seal/decrypt', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ ciphertext, kref })
});
const { payload } = await decryptResponse.json();
```

### 3. Temporary Encrypted Links (Revocable/Expiring)
Create secure, temporary links with no secrets in URLs:

```typescript
// Create temporary link
const linkResponse = await fetch('/v1/seal/link/create', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    payload: 'temporary secret document',
    expiresAt: '2024-01-02T12:00:00.000Z',
    maxOpens: 5
  })
});
const { linkId, openUrl } = await linkResponse.json();

// Revoke the link when no longer needed
await fetch('/v1/seal/link/revoke', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ linkId })
});
```

## Key Concepts

- **Seal** = encrypt/decrypt payloads
- **Broker** = who can open (access control layer)  
- **Sign/Verify** = authorship when the sender opts in
- **No secrets in URLs** - all cryptographic material stays server-side

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
