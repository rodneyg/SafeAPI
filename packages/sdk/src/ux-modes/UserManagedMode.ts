import type { SafeAPIConfig, StorageAdapter, UserManagedOptions, KeyPair } from '../types';
import { Keys, KeyBackupOptions, KeyRecoveryOptions } from '../core/Keys';
import { DataCore } from '../core/Data';

/**
 * User-Managed UX Mode
 * 
 * Users generate, protect, and manage their own keys directly.
 * This mode provides maximum control but requires users to handle:
 * - Key generation and storage
 * - Backup and recovery
 * - Security best practices
 */
export class UserManagedMode {
  private keys: Keys;
  private data: DataCore;
  private storage: StorageAdapter;

  constructor(config: SafeAPIConfig & { uxMode: 'user-managed' }) {
    this.storage = config.storage;
    this.keys = new Keys({ keystore: config.crypto?.keystore || 'memory' });
    this.data = new DataCore(this.storage, { encryption: config.defaults?.encryption || 'document' });
  }

  async initialize(): Promise<{ keyPair: KeyPair; backupNeeded: boolean }> {
    const keyPair = await this.keys.ensure();
    return {
      keyPair,
      backupNeeded: true // Always recommend backup in user-managed mode
    };
  }

  async generateKeys(options?: UserManagedOptions): Promise<KeyPair> {
    await this.keys.rotate(); // Generate new keys
    const keyPair = await this.keys.ensure();
    
    if (options?.backupMethod) {
      console.log(`Consider backing up your keys using method: ${options.backupMethod}`);
    }
    
    return keyPair;
  }

  async backupKeys(options: KeyBackupOptions): Promise<{ backupData: any; success: boolean; instructions?: string }> {
    const result = await this.keys.backup(options);
    
    let instructions: string | undefined;
    if (result.success) {
      switch (options.method) {
        case 'file':
          instructions = 'Save the backup data to a secure file. Keep multiple copies in different locations.';
          break;
        case 'phrase':
          instructions = 'Your keys are encrypted with your passphrase. Remember this passphrase - it cannot be recovered.';
          break;
        case 'webauthn':
          instructions = 'Your keys are protected by your device\'s security features.';
          break;
      }
    }
    
    return { ...result, instructions };
  }

  async restoreKeys(options: KeyRecoveryOptions): Promise<{ success: boolean; keyPair?: KeyPair; message?: string }> {
    const result = await this.keys.restore(options);
    
    let message: string | undefined;
    if (result.success) {
      message = 'Keys restored successfully. You can now access your encrypted data.';
    } else {
      message = 'Key restoration failed. Please check your backup data and try again.';
    }
    
    return { ...result, message };
  }

  async exportKeys(format: 'armored' | 'json' = 'json'): Promise<string> {
    return this.keys.export(format);
  }

  async importKeys(keyData: string, format: 'armored' | 'json' = 'json'): Promise<void> {
    await this.keys.import(keyData, format);
  }

  // Data operations with user-controlled encryption
  async createDocument<T>(collection: string, doc: T, options?: { 
    encryption?: 'none' | 'field' | 'document';
    fields?: (keyof T)[];
  }): Promise<string> {
    return this.data.create({
      collection,
      doc,
      policy: {
        encryption: options?.encryption || 'document',
        fields: options?.fields
      }
    });
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

  async queryDocuments<T>(collection: string, options?: {
    where?: any[];
    orderBy?: any;
    limit?: number;
  }): Promise<T[]> {
    return this.data.query<T>({
      collection,
      where: options?.where,
      orderBy: options?.orderBy,
      limit: options?.limit
    });
  }
}