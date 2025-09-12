# SafeAPI UX Modes Guide

SafeAPI supports four distinct UX modes that apps can adopt, depending on how much control versus convenience they want to offer users. This guide shows how each mode maps to hosted API endpoints and SDK calls.

## Overview of UX Modes

| Mode | User Control | Integration Complexity | Crypto UX | Cloud Dependency | Best For |
|------|-------------|----------------------|-----------|------------------|----------|
| User-Managed | Maximum | High | Full | Optional | Privacy apps, crypto-savvy users |
| Shared Responsibility | High | Medium | Some | Required | Business apps, compliance needs |
| Developer-Managed | Medium | Low | Hidden | Recommended | Most business applications |
| API-Managed | Low | Minimal | None | Required | Simple apps, rapid prototyping |

## 1. User-Managed Mode

**Philosophy**: Users generate, protect, and manage their own keys directly.

### Key Features
- ✅ Complete user control over cryptographic operations
- ✅ Local key generation and storage
- ✅ User-initiated backup and recovery
- ✅ No mandatory cloud dependencies
- ✅ Maximum privacy and security

### API Mapping

| Operation | SDK Call | Hosted API | Notes |
|-----------|----------|------------|-------|
| Initialize | `UserManagedMode.initialize()` | None | Local key generation |
| Generate Keys | `generateKeys()` | None | Client-side only |
| Backup Keys | `backupKeys({ method: 'phrase', passphrase })` | None | Local encryption |
| Restore Keys | `restoreKeys({ method: 'phrase', passphrase, backupData })` | None | Local decryption |
| Create Document | `createDocument(collection, doc, options)` | None | Local encryption |
| Share Document | `shareWith()` | `/v1/broker/*` | Optional for sharing |

### Example Implementation

```typescript
import { UserManagedMode, FilesAdapter } from '@safeapi/sdk';

const storage = new FilesAdapter();
const safeAPI = new UserManagedMode({
  storage,
  uxMode: 'user-managed',
  defaults: { encryption: 'document' }
});

// User generates their own keys
const { keyPair, backupNeeded } = await safeAPI.initialize();

// User backs up keys with their chosen passphrase
const backupResult = await safeAPI.backupKeys({
  method: 'phrase',
  passphrase: 'user-chosen-secure-passphrase',
  metadata: { location: 'home', device: 'laptop' }
});

// User creates encrypted documents
const docId = await safeAPI.createDocument('personal-notes', {
  title: 'My Private Note',
  content: 'Sensitive information',
  tags: ['private', 'important']
});

// User can export keys for manual backup
const exportedKeys = await safeAPI.exportKeys('json');
// User stores this securely (USB drive, paper wallet, etc.)
```

### Hosted API Usage
- **Required**: None for basic functionality
- **Optional**: `/v1/broker/*` endpoints for document sharing
- **Authentication**: Not required for local operations

---

## 2. Shared Responsibility Mode

**Philosophy**: Users set a passphrase, SafeAPI escrows the passphrase-protected private key, recovery is possible.

### Key Features
- ✅ User controls passphrase
- ✅ Encrypted key escrow in cloud
- ✅ Recovery through cloud service
- ✅ Automatic audit logging
- ✅ Balanced control and convenience

### API Mapping

| Operation | SDK Call | Hosted API | Notes |
|-----------|----------|------------|-------|
| Initialize | `SharedResponsibilityMode.initialize(userId, options)` | `/v1/keys/register` | Register public key |
| Set Passphrase | `setPassphrase(passphrase, options)` | `/v1/keys/escrow` | Escrow encrypted private key |
| Recover Keys | `recoverWithPassphrase(passphrase)` | `/v1/keys/recover` | Retrieve and decrypt |
| Create Document | `createDocument(collection, doc, options)` | `/v1/audit` | Optional audit logging |
| Update Escrow | `updateEscrow(options)` | `/v1/keys/escrow` | Update escrowed key |
| Check Status | `getEscrowStatus()` | `/v1/keys/recover` | Check escrow status |

### Example Implementation

```typescript
import { SharedResponsibilityMode, FilesAdapter } from '@safeapi/sdk';

const safeAPI = new SharedResponsibilityMode({
  storage: new FilesAdapter(),
  uxMode: 'shared-responsibility',
  cloud: {
    endpoint: 'https://api.safeapi.dev',
    apiKey: process.env.SAFEAPI_KEY,
    projectId: 'my-project'
  }
});

// Initialize with user ID and passphrase
const { keyPair, escrowStatus, recoveryEnabled } = await safeAPI.initialize('user123', {
  passphrase: 'user-secure-passphrase',
  enableRecovery: true,
  escrowMetadata: { 
    deviceType: 'mobile',
    location: 'US'
  }
});

// Create document with audit logging
const { id, auditId } = await safeAPI.createDocument('medical-records', {
  patientId: 'P12345',
  diagnosis: 'Annual checkup',
  doctorNotes: 'Patient in good health'
}, { 
  encryption: 'document',
  auditEnabled: true 
});

// Later: recover keys if user forgets device
const recoveryResult = await safeAPI.recoverWithPassphrase('user-secure-passphrase');
if (recoveryResult.success) {
  // User can access their data again
  const medicalRecord = await safeAPI.getDocument('medical-records', id);
}
```

### Hosted API Usage
- **Required**: 
  - `/v1/auth/token` - API key exchange
  - `/v1/keys/register` - Register user public key
  - `/v1/keys/escrow` - Store encrypted private key
  - `/v1/keys/recover` - Retrieve escrowed key
- **Optional**: 
  - `/v1/audit` - Audit logging
  - `/v1/broker/*` - Document sharing
- **Authentication**: Bearer token required for all cloud operations

---

## 3. Developer-Managed Mode

**Philosophy**: App developers integrate SafeAPI but hide most key management details from users.

### Key Features
- ✅ Automatic key management
- ✅ Background escrow and sync
- ✅ Simplified developer APIs
- ✅ Built-in sharing and audit
- ✅ Hidden crypto complexity

### API Mapping

| Operation | SDK Call | Hosted API | Notes |
|-----------|----------|------------|-------|
| Initialize | `DeveloperManagedMode.initialize(userId)` | `/v1/keys/register`, `/v1/keys/escrow` | Auto-register and escrow |
| Save Document | `save(collection, doc)` | `/v1/audit` | Auto-audit logging |
| Load Document | `load(collection, id)` | None | Local decryption |
| Share Document | `shareWith(collection, id, recipients)` | `/v1/broker/doc-key`, `/v1/broker/grant` | Auto-sharing setup |
| Revoke Access | `unshareWith(collection, id, userId)` | `/v1/broker/revoke`, `/v1/broker/rotate` | Secure revocation |
| Rotate Keys | `rotateKeys()` | `/v1/keys/register`, `/v1/keys/escrow` | Background rotation |
| Sync to Cloud | `syncToCloud()` | Custom endpoints | Background sync |
| Get Audit Trail | `getAuditTrail(options)` | `/v1/audit` | Compliance reporting |

### Example Implementation

```typescript
import { DeveloperManagedMode, FilesAdapter } from '@safeapi/sdk';

const safeAPI = new DeveloperManagedMode(
  {
    storage: new FilesAdapter(),
    uxMode: 'developer-managed',
    cloud: {
      endpoint: 'https://api.safeapi.dev',
      apiKey: process.env.SAFEAPI_KEY,
      projectId: 'my-project'
    }
  },
  {
    autoEscrow: true,      // Automatically escrow keys
    backgroundSync: true   // Enable background sync
  }
);

// Simple initialization - crypto is hidden
const { ready, features } = await safeAPI.initialize('user456');

// Simple document operations - no crypto exposed
const { id } = await safeAPI.save('user-profiles', {
  name: 'John Developer',
  email: 'john@example.com',
  preferences: { theme: 'dark', notifications: true }
});

// Load document - decryption is automatic
const profile = await safeAPI.load('user-profiles', id);

// Share with team members - crypto handled automatically
const shareResult = await safeAPI.shareWith('user-profiles', id, [
  { userId: 'colleague-123', permissions: 'read' },
  { userId: 'manager-456', permissions: 'write' }
]);

// Get audit trail for compliance
const auditEvents = await safeAPI.getAuditTrail({
  startDate: new Date('2024-01-01'),
  actions: ['document_saved', 'document_shared'],
  limit: 100
});

// Background operations happen automatically
await safeAPI.syncToCloud();  // Sync to cloud storage
await safeAPI.rotateKeys();   // Rotate keys periodically
```

### Hosted API Usage
- **Required**:
  - `/v1/auth/token` - API key exchange
  - `/v1/keys/register` - Auto-register keys
  - `/v1/keys/escrow` - Auto-escrow keys
- **Automatic**:
  - `/v1/broker/*` - Document sharing operations
  - `/v1/audit` - Audit logging
  - `/v1/usage` - Usage tracking
- **Authentication**: Bearer token automatically managed by SDK

---

## 4. API-Managed Mode

**Philosophy**: SafeAPI handles nearly all aspects transparently; the app exposes little or no crypto UX.

### Key Features
- ✅ Zero crypto UX
- ✅ Server-side key management
- ✅ Transparent encryption/decryption
- ✅ Automatic compliance
- ✅ Minimal configuration

### API Mapping

| Operation | SDK Call | Hosted API | Notes |
|-----------|----------|------------|-------|
| Initialize | `APIManagedMode.initialize(userId)` | `/v1/keys/register` | Server generates keys |
| Store Data | `store(collection, data)` | `/v1/data/store` | Server-side encryption |
| Retrieve Data | `retrieve(collection, id)` | `/v1/data/retrieve` | Server-side decryption |
| Update Data | `update(collection, id, data)` | `/v1/data/update` | Transparent updates |
| Delete Data | `delete(collection, id)` | `/v1/data/delete` | Secure deletion |
| List Data | `list(collection, options)` | `/v1/data/list` | Server-side queries |
| Share Data | `share(collection, id, recipients)` | `/v1/sharing/share` | Transparent sharing |
| Compliance Report | `getComplianceReport(options)` | `/v1/reports/generate` | Automatic compliance |
| Usage Metrics | `getUsageMetrics()` | `/v1/usage` | Real-time metrics |

### Example Implementation

```typescript
import { APIManagedMode, FilesAdapter } from '@safeapi/sdk';

const safeAPI = new APIManagedMode(
  {
    storage: new FilesAdapter(),
    uxMode: 'api-managed',
    cloud: {
      endpoint: 'https://api.safeapi.dev',
      apiKey: process.env.SAFEAPI_KEY,
      projectId: 'my-project'
    }
  },
  {
    transparentMode: true,    // Fully transparent operations
    serverSideKeys: true      // Server manages all keys
  }
);

// Ultra-simple initialization
const { ready, features } = await safeAPI.initialize('user789');

// Store data - encryption is completely transparent
const { id, encrypted } = await safeAPI.store('customer-data', {
  name: 'Alice Johnson',
  email: 'alice@example.com',
  personalInfo: {
    ssn: '123-45-6789',      // Automatically encrypted
    creditCard: '4111-1111-1111-1111'
  }
});

// Retrieve data - decryption is automatic
const customer = await safeAPI.retrieve('customer-data', id);
console.log(customer.name); // "Alice Johnson" - transparently decrypted

// Share data with zero crypto UX
const shareResult = await safeAPI.share('customer-data', id, [
  'support-team',
  'billing-system',
  'account-manager-bob'
]);

// Get compliance reports automatically
const report = await safeAPI.getComplianceReport({
  format: 'pdf',
  standards: ['SOC2', 'GDPR', 'CCPA'],
  dateRange: { 
    start: new Date('2024-01-01'), 
    end: new Date() 
  }
});

// Monitor usage automatically
const metrics = await safeAPI.getUsageMetrics();
console.log(`Storage used: ${metrics.storage.used}/${metrics.storage.limit} MB`);
```

### Hosted API Usage
- **Required**: All operations use hosted APIs
  - `/v1/auth/token` - API key exchange
  - `/v1/data/*` - All data operations
  - `/v1/sharing/*` - Sharing operations
  - `/v1/reports/*` - Compliance reporting
  - `/v1/usage` - Usage monitoring
- **Server-Side**: All encryption/decryption happens on server
- **Authentication**: Bearer token automatically managed

---

## Migration Between Modes

You can migrate between UX modes as your application requirements evolve:

### Common Migration Paths

1. **Prototype → Production**: API-Managed → Developer-Managed
2. **Adding Compliance**: Developer-Managed → Shared Responsibility  
3. **Privacy Focus**: Any Mode → User-Managed
4. **Simplification**: Any Mode → API-Managed

### Migration Example

```typescript
// Start with API-Managed for prototyping
const apiMode = new APIManagedMode(config);
await apiMode.initialize(userId);

// Later migrate to Developer-Managed for production
const devMode = new DeveloperManagedMode(config);
await devMode.initialize(userId);

// Export data from old mode
const data = await apiMode.list('documents');

// Import to new mode
for (const doc of data) {
  await devMode.save('documents', doc.data);
}
```

## Best Practices

### Choosing the Right Mode

1. **User-Managed**: Choose when privacy is paramount and users are comfortable with crypto operations
2. **Shared Responsibility**: Choose for business applications requiring compliance and recovery options
3. **Developer-Managed**: Choose for most production applications balancing ease and functionality
4. **API-Managed**: Choose for rapid prototyping or when crypto complexity must be completely hidden

### Security Considerations

- **User-Managed**: Users must understand backup/recovery responsibilities
- **Shared Responsibility**: Passphrase strength is critical for security
- **Developer-Managed**: Trust in SDK and cloud service key management
- **API-Managed**: Full trust in server-side security and key management

### Performance Considerations

- **Local Operations**: User-Managed fastest for local operations
- **Network Operations**: API-Managed may have latency but better caching
- **Hybrid Approach**: Developer-Managed and Shared Responsibility balance both

Choose the UX mode that best fits your application's security requirements, user technical sophistication, and compliance needs.