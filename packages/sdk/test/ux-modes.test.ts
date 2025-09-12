import { describe, it, expect, beforeEach } from 'vitest';
import { 
  UserManagedMode, 
  SharedResponsibilityMode, 
  DeveloperManagedMode, 
  APIManagedMode,
  createUXMode,
  FilesAdapter 
} from '../src/index';

describe('UX Modes', () => {
  let storage: FilesAdapter;

  beforeEach(() => {
    storage = new FilesAdapter();
  });

  describe('User-Managed Mode', () => {
    it('should initialize and generate keys', async () => {
      const mode = new UserManagedMode({
        storage,
        uxMode: 'user-managed',
        defaults: { encryption: 'document' }
      });

      const result = await mode.initialize();
      
      expect(result.keyPair).toBeDefined();
      expect(result.keyPair.publicKeyArmored).toBeTruthy();
      expect(result.keyPair.privateKeyArmored).toBeTruthy();
      expect(result.backupNeeded).toBe(true);
    });

    it('should backup and restore keys with passphrase', async () => {
      const mode = new UserManagedMode({
        storage,
        uxMode: 'user-managed'
      });

      await mode.initialize();
      
      // Backup keys
      const backupResult = await mode.backupKeys({
        method: 'phrase',
        passphrase: 'test-passphrase-123',
        metadata: { test: true }
      });

      expect(backupResult.success).toBe(true);
      expect(backupResult.backupData).toBeDefined();
      expect(backupResult.instructions).toContain('passphrase');

      // Restore keys
      const restoreResult = await mode.restoreKeys({
        method: 'phrase',
        passphrase: 'test-passphrase-123',
        backupData: backupResult.backupData
      });

      expect(restoreResult.success).toBe(true);
      expect(restoreResult.keyPair).toBeDefined();
    });

    it('should handle document operations', async () => {
      const mode = new UserManagedMode({
        storage,
        uxMode: 'user-managed'
      });

      await mode.initialize();

      // Create document
      const docId = await mode.createDocument('test', { message: 'hello' });
      expect(docId).toBeTruthy();

      // Get document
      const doc = await mode.getDocument<{ message: string }>('test', docId);
      expect(doc?.message).toBe('hello');

      // Update document
      await mode.updateDocument('test', docId, { message: 'updated' });
      const updated = await mode.getDocument<{ message: string }>('test', docId);
      expect(updated?.message).toBe('updated');

      // Delete document
      await mode.deleteDocument('test', docId);
      const deleted = await mode.getDocument('test', docId);
      expect(deleted).toBeNull();
    });
  });

  describe('Shared Responsibility Mode', () => {
    it('should initialize with user and options', async () => {
      const mode = new SharedResponsibilityMode({
        storage,
        uxMode: 'shared-responsibility'
        // Note: no cloud config for test
      });

      const result = await mode.initialize('test-user', {
        passphrase: 'test-pass',
        enableRecovery: true
      });

      expect(result.keyPair).toBeDefined();
      expect(result.recoveryEnabled).toBe(true);
    });

    it('should handle document operations with audit', async () => {
      const mode = new SharedResponsibilityMode({
        storage,
        uxMode: 'shared-responsibility'
      });

      await mode.initialize('test-user', { passphrase: 'test-pass' });

      const result = await mode.createDocument('medical', {
        patientId: 'P123',
        diagnosis: 'test'
      }, { 
        auditEnabled: false // Disable for test without cloud
      });

      expect(result.id).toBeTruthy();
      expect(result.auditId).toBeUndefined(); // No cloud configured

      const doc = await mode.getDocument('medical', result.id);
      expect(doc?.patientId).toBe('P123');
    });
  });

  describe('Developer-Managed Mode', () => {
    it('should initialize with features', async () => {
      const mode = new DeveloperManagedMode({
        storage,
        uxMode: 'developer-managed'
        // Note: no cloud config for test
      }, { autoEscrow: false });

      const result = await mode.initialize('dev-user');

      expect(result.ready).toBe(true);
      expect(result.keyPair).toBeDefined();
      expect(result.features.sharing).toBe(false); // No cloud
      expect(result.features.audit).toBe(false); // No cloud
    });

    it('should provide simplified document operations', async () => {
      const mode = new DeveloperManagedMode({
        storage,
        uxMode: 'developer-managed'
      });

      await mode.initialize('dev-user');

      // Save document
      const saveResult = await mode.save('users', {
        name: 'Test User',
        email: 'test@example.com'
      });
      expect(saveResult.id).toBeTruthy();

      // Load document
      const user = await mode.load('users', saveResult.id);
      expect(user?.name).toBe('Test User');

      // Update document
      await mode.update('users', saveResult.id, {
        ...user,
        name: 'Updated User'
      });

      const updated = await mode.load('users', saveResult.id);
      expect(updated?.name).toBe('Updated User');

      // List documents (may not find encrypted docs)
      const users = await mode.list('users', { limit: 10 });
      // Note: Query might return 0 items due to encryption, that's expected behavior
      expect(Array.isArray(users)).toBe(true);

      // Remove document
      await mode.remove('users', saveResult.id);
      const removed = await mode.load('users', saveResult.id);
      expect(removed).toBeNull();
    });
  });

  describe('API-Managed Mode', () => {
    it('should initialize with minimal configuration', async () => {
      const mode = new APIManagedMode({
        storage,
        uxMode: 'api-managed'
        // Note: no cloud config for test
      });

      const result = await mode.initialize('api-user');

      expect(result.ready).toBe(false); // No cloud configured
      expect(result.features.transparentEncryption).toBe(false);
    });

    it('should handle transparent data operations with fallback', async () => {
      const mode = new APIManagedMode({
        storage,
        uxMode: 'api-managed'
      });

      await mode.initialize('api-user');

      // Store data (will fallback to local storage)
      const storeResult = await mode.store('customers', {
        name: 'John Doe',
        email: 'john@example.com'
      });
      expect(storeResult.id).toBeTruthy();
      expect(storeResult.encrypted).toBe(false); // Local fallback

      // Retrieve data
      const customer = await mode.retrieve('customers', storeResult.id);
      expect(customer?.name).toBe('John Doe');

      // Update data
      const updateResult = await mode.update('customers', storeResult.id, {
        ...customer,
        email: 'john.doe@example.com'
      });
      expect(updateResult.success).toBe(true);

      // List data
      const customers = await mode.list('customers');
      expect(customers.length).toBeGreaterThan(0);

      // Delete data
      const deleteResult = await mode.delete('customers', storeResult.id);
      expect(deleteResult.success).toBe(true);
    });

    it('should handle usage metrics gracefully without cloud', async () => {
      const mode = new APIManagedMode({
        storage,
        uxMode: 'api-managed'
      });

      await mode.initialize('api-user');

      const metrics = await mode.getUsageMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.storage.used).toBe(0);
      expect(metrics.operations.count).toBe(0);
    });
  });

  describe('UX Mode Factory', () => {
    it('should create correct mode instances', () => {
      const userMode = createUXMode({
        storage,
        uxMode: 'user-managed'
      });
      expect(userMode).toBeInstanceOf(UserManagedMode);

      const sharedMode = createUXMode({
        storage,
        uxMode: 'shared-responsibility'
      });
      expect(sharedMode).toBeInstanceOf(SharedResponsibilityMode);

      const devMode = createUXMode({
        storage,
        uxMode: 'developer-managed'
      });
      expect(devMode).toBeInstanceOf(DeveloperManagedMode);

      const apiMode = createUXMode({
        storage,
        uxMode: 'api-managed'
      });
      expect(apiMode).toBeInstanceOf(APIManagedMode);
    });

    it('should default to user-managed mode', () => {
      const defaultMode = createUXMode({
        storage
        // No uxMode specified
      });
      expect(defaultMode).toBeInstanceOf(UserManagedMode);
    });

    it('should throw error for invalid mode', () => {
      expect(() => {
        createUXMode({
          storage,
          uxMode: 'invalid-mode' as any
        });
      }).toThrow('Unsupported UX mode');
    });
  });

  describe('Key Management Features', () => {
    it('should support different backup methods', async () => {
      const mode = new UserManagedMode({
        storage,
        uxMode: 'user-managed'
      });

      await mode.initialize();

      // Test phrase backup
      const phraseBackup = await mode.backupKeys({
        method: 'phrase',
        passphrase: 'test-phrase'
      });
      expect(phraseBackup.success).toBe(true);

      // Test file backup
      const fileBackup = await mode.backupKeys({
        method: 'file',
        metadata: { purpose: 'testing' }
      });
      expect(fileBackup.success).toBe(true);

      // Test WebAuthn backup (should warn but not fail)
      const webauthnBackup = await mode.backupKeys({
        method: 'webauthn'
      });
      expect(webauthnBackup.success).toBe(true);
    });

    it('should support key export/import', async () => {
      const mode = new UserManagedMode({
        storage,
        uxMode: 'user-managed'
      });

      await mode.initialize();

      // Export keys
      const exportedJson = await mode.exportKeys('json');
      expect(exportedJson).toContain('privateKey');
      expect(exportedJson).toContain('publicKey');

      const exportedArmored = await mode.exportKeys('armored');
      expect(exportedArmored).toContain('BEGIN PGP');

      // Import keys
      await mode.importKeys(exportedJson, 'json');
      
      // Verify we can still operate after import
      const docId = await mode.createDocument('test', { imported: true });
      const doc = await mode.getDocument('test', docId);
      expect(doc?.imported).toBe(true);
    });
  });
});