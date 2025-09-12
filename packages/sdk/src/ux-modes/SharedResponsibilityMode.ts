import type { SafeAPIConfig, StorageAdapter, SharedResponsibilityOptions, KeyPair } from '../types';
import { Keys, KeyBackupOptions, KeyRecoveryOptions } from '../core/Keys';
import { DataCore } from '../core/Data';
import { CloudClient } from '../cloud/client';

/**
 * Shared Responsibility UX Mode
 * 
 * Users set a passphrase, SafeAPI escrows the passphrase-protected private key.
 * Recovery is possible through the cloud service.
 * 
 * Shared responsibilities:
 * - User: Manages passphrase, consents to escrow
 * - SafeAPI: Stores encrypted keys, handles recovery
 */
export class SharedResponsibilityMode {
  private keys: Keys;
  private data: DataCore;
  private storage: StorageAdapter;
  private cloud?: CloudClient;
  private userId?: string;

  constructor(config: SafeAPIConfig & { uxMode: 'shared-responsibility' }) {
    this.storage = config.storage;
    this.keys = new Keys({ keystore: config.crypto?.keystore || 'memory' });
    this.data = new DataCore(this.storage, { encryption: config.defaults?.encryption || 'document' });
    
    if (config.cloud) {
      this.cloud = new CloudClient({ 
        endpoint: config.cloud.endpoint, 
        apiKey: config.cloud.apiKey 
      });
    }
  }

  async initialize(userId: string, options: SharedResponsibilityOptions): Promise<{
    keyPair: KeyPair;
    escrowStatus: 'pending' | 'completed' | 'failed';
    recoveryEnabled: boolean;
  }> {
    this.userId = userId;
    const keyPair = await this.keys.ensure();
    
    // Register public key with cloud
    if (this.cloud) {
      try {
        await this.cloud.exchangeToken();
        await this.cloud.post('/v1/keys/register', {
          userId,
          publicKeyArmored: keyPair.publicKeyArmored
        });
      } catch (error) {
        console.warn('Failed to register public key:', error);
      }
    }

    // Attempt to escrow private key if passphrase provided
    let escrowStatus: 'pending' | 'completed' | 'failed' = 'pending';
    if (options.enableRecovery !== false) {
      escrowStatus = await this.escrowPrivateKey(options);
    }

    return {
      keyPair,
      escrowStatus,
      recoveryEnabled: options.enableRecovery !== false
    };
  }

  async setPassphrase(
    newPassphrase: string, 
    options?: { escrowMetadata?: Record<string, any> }
  ): Promise<{ success: boolean; escrowStatus: 'completed' | 'failed' }> {
    if (!this.userId) throw new Error('User ID not set. Call initialize() first.');

    const backupOptions: KeyBackupOptions = {
      method: 'phrase',
      passphrase: newPassphrase,
      metadata: options?.escrowMetadata
    };

    const backupResult = await this.keys.backup(backupOptions);
    
    if (!backupResult.success) {
      return { success: false, escrowStatus: 'failed' };
    }

    // Escrow the encrypted private key
    const escrowStatus = await this.escrowEncryptedKey(backupResult.backupData);
    
    return {
      success: escrowStatus === 'completed',
      escrowStatus
    };
  }

  async recoverWithPassphrase(passphrase: string): Promise<{
    success: boolean;
    keyPair?: KeyPair;
    message: string;
  }> {
    if (!this.userId) throw new Error('User ID not set. Call initialize() first.');
    if (!this.cloud) throw new Error('Cloud service not configured');

    try {
      // Retrieve encrypted private key from escrow
      await this.cloud.exchangeToken();
      const response = await this.cloud.post<{ encPrivKey: any }>('/v1/keys/recover', {
        userId: this.userId
      });

      if (!response.encPrivKey) {
        return {
          success: false,
          message: 'No escrowed key found for this user'
        };
      }

      // Attempt to decrypt with passphrase
      const recoveryOptions: KeyRecoveryOptions = {
        method: 'phrase',
        passphrase,
        backupData: response.encPrivKey
      };

      const result = await this.keys.restore(recoveryOptions);
      
      return {
        success: result.success,
        keyPair: result.keyPair,
        message: result.success 
          ? 'Keys recovered successfully from escrow'
          : 'Failed to decrypt escrowed key. Check your passphrase.'
      };
    } catch (error) {
      return {
        success: false,
        message: `Recovery failed: ${error}`
      };
    }
  }

  async updateEscrow(options: SharedResponsibilityOptions): Promise<{
    success: boolean;
    escrowStatus: 'completed' | 'failed';
  }> {
    const escrowStatus = await this.escrowPrivateKey(options);
    return {
      success: escrowStatus === 'completed',
      escrowStatus
    };
  }

  async getEscrowStatus(): Promise<{
    hasEscrowedKey: boolean;
    escrowDate?: number;
    metadata?: Record<string, any>;
  }> {
    if (!this.userId || !this.cloud) {
      return { hasEscrowedKey: false };
    }

    try {
      await this.cloud.exchangeToken();
      const response = await this.cloud.post<{ encPrivKey: any }>('/v1/keys/recover', {
        userId: this.userId
      });

      return {
        hasEscrowedKey: !!response.encPrivKey,
        escrowDate: response.encPrivKey?.createdAt,
        metadata: response.encPrivKey?.metadata
      };
    } catch (error) {
      console.warn('Failed to check escrow status:', error);
      return { hasEscrowedKey: false };
    }
  }

  private async escrowPrivateKey(options: SharedResponsibilityOptions): Promise<'completed' | 'failed'> {
    if (!this.cloud) return 'failed';

    try {
      const backupOptions: KeyBackupOptions = {
        method: 'phrase',
        passphrase: options.passphrase,
        metadata: options.escrowMetadata
      };

      const backupResult = await this.keys.backup(backupOptions);
      
      if (!backupResult.success) return 'failed';

      return this.escrowEncryptedKey(backupResult.backupData);
    } catch (error) {
      console.error('Escrow failed:', error);
      return 'failed';
    }
  }

  private async escrowEncryptedKey(encryptedKeyData: any): Promise<'completed' | 'failed'> {
    if (!this.cloud || !this.userId) return 'failed';

    try {
      await this.cloud.exchangeToken();
      await this.cloud.post('/v1/keys/escrow', {
        userId: this.userId,
        encPrivKey: encryptedKeyData
      });
      return 'completed';
    } catch (error) {
      console.error('Failed to escrow key:', error);
      return 'failed';
    }
  }

  // Data operations with automatic audit logging
  async createDocument<T>(collection: string, doc: T, options?: {
    encryption?: 'none' | 'field' | 'document';
    shareable?: boolean;
    auditEnabled?: boolean;
  }): Promise<{ id: string; auditId?: string }> {
    const id = await this.data.create({
      collection,
      doc,
      policy: {
        encryption: options?.encryption || 'document',
        shareable: options?.shareable
      }
    });

    let auditId: string | undefined;
    if (options?.auditEnabled && this.cloud) {
      try {
        const auditResponse = await this.cloud.post<{ id: string }>('/v1/audit', {
          action: 'document_created',
          collection,
          documentId: id,
          userId: this.userId,
          timestamp: Date.now()
        });
        auditId = auditResponse.id;
      } catch (error) {
        console.warn('Audit logging failed:', error);
      }
    }

    return { id, auditId };
  }

  async getDocument<T>(collection: string, id: string): Promise<T | null> {
    return this.data.get<T>({ collection, id });
  }

  async updateDocument<T>(collection: string, id: string, doc: T): Promise<void> {
    return this.data.update({ collection, id, doc });
  }

  async deleteDocument(collection: string, id: string): Promise<void> {
    return this.data.delete({ collection, id });
  }
}