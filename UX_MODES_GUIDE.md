# SafeAPI capabilities by UX mode

This guide describes what the current SDK and hosted API can support. It does not treat planned server-side or recovery behavior as implemented.

## Current boundary

`SafeAPI` in `packages/sdk/src/core/SafeAPI.ts` provides local document, key, sharing, audit, consent, and export helpers. Configure `cloud.endpoint` and `cloud.apiKey` to use hosted operations; `init()` exchanges the API key for a project token. Cloud initialization errors are currently swallowed, so applications should verify cloud-dependent operations themselves.

The hosted API currently exposes token exchange, key registration and encrypted-key escrow/recovery, document-key references, grant/revoke/rotate markers, audit, consent, reports, usage, and admin limits. These are project-token scoped. The service does not yet associate user or document records with a project, and broker grant currently writes a placeholder rather than cryptographic wrapped key material. Do not use those endpoints as production authorization or key-distribution controls without addressing those gaps.

## Four UX modes

| Mode | Supported today | Gaps |
|---|---|---|
| User-managed | Generate a key pair with `api.keys.ensure()`, use local encrypted storage, and export data through `api.export`. Cloud is optional. | `keys.backup()` and `keys.restore()` are stubs. Key rotation only replaces the in-memory pair. |
| Shared responsibility | The primitives exist: encrypt a key locally with a passphrase, then call `/v1/keys/escrow`; `/v1/keys/recover` returns the encrypted blob. | No integrated SDK flow, user authentication, recovery verification, or escrow access isolation. Do not claim account recovery is production-ready. |
| Developer-managed | Use `SafeAPI` with configured storage and defaults to hide crypto plumbing behind `data.create/get/update`. Optional cloud helpers are available. | No mode-specific high-level facade, automatic key lifecycle, or working backup/recovery. |
| API-managed | Token exchange and hosted management endpoints are callable through the cloud client. | No server-side data encryption or transparent data CRUD endpoints exist. This mode is not implemented. |

## Minimal examples

### User-managed local storage

```ts
import { SafeAPI, FilesAdapter } from '@safeapi/sdk';

const api = new SafeAPI({
  storage: new FilesAdapter(),
  defaults: { encryption: 'document' },
});
await api.init();
const id = await api.data.create({ collection: 'notes', doc: { text: 'private' } });
const note = await api.data.get<{ text: string }>({ collection: 'notes', id });
```

### Developer-managed integration

Use the same `SafeAPI` facade with the app's storage adapter and a chosen encryption default. The SDK handles document encryption while application code uses `data.create`, `data.get`, `data.update`, and `data.delete`. This is developer-managed convenience over client-side encryption, not API-managed encryption.

### Shared responsibility primitives

Generate a key pair with `api.keys.ensure()`. A client may encrypt the private key with a user passphrase and submit only that encrypted value to `/v1/keys/escrow`; recovery retrieves the same encrypted value from `/v1/keys/recover`, after which the user decrypts locally. The current SDK does not provide this workflow as a supported high-level helper.

### API-managed

There is no valid end-to-end example yet. `/v1/data/*` endpoints are not implemented, so callers must not present the current hosted endpoints as transparent server-side storage or encryption.

## Capability test

`packages/sdk/test/ux-mode-capabilities.test.ts` checks the exported SDK surface and key backup/recovery stubs against these documented boundaries. Update this guide and test together when a mode gains working APIs.
