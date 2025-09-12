import type { SafeAPIConfig, StorageAdapter, DeveloperManagedOptions, KeyPair } from '../types';
import { Keys } from '../core/Keys';
import { DataCore } from '../core/Data';
import { ShareCore } from '../core/Share';
import { AuditCore } from '../core/Audit';
import { CloudClient } from '../cloud/client';

/**
 * Developer-Managed UX Mode
 * 
 * App developers integrate SafeAPI but hide most key management details from users.
 * Keys are stored via SDK + escrow behind the scenes.
 * 
 * Developer responsibilities:
 * - Integration and configuration
 * - User authentication and authorization
 * - UX design and error handling
 * 
 * SafeAPI responsibilities:
 * - Automatic key management
 * - Background escrow and sync
 * - Secure sharing workflows
 */
export class DeveloperManagedMode {
  private keys: Keys;
  private data: DataCore;
  private share: ShareCore;
  private audit: AuditCore;
  private storage: StorageAdapter;
  private cloud?: CloudClient;
  private userId?: string;
  private options: DeveloperManagedOptions;

  constructor(config: SafeAPIConfig & { uxMode: 'developer-managed' }, options: DeveloperManagedOptions = {}) {
    this.storage = config.storage;
    this.options = options;
    this.keys = new Keys({ keystore: config.crypto?.keystore || 'indexeddb' });
    this.data = new DataCore(this.storage, { encryption: config.defaults?.encryption || 'document' });
    
    if (config.cloud) {
      this.cloud = new CloudClient({ 
        endpoint: config.cloud.endpoint, 
        apiKey: config.cloud.apiKey 
      });
      this.share = new ShareCore(this.cloud);
      this.audit = new AuditCore(this.cloud);
    } else {
      this.share = new ShareCore();
      this.audit = new AuditCore();
    }
  }

  async initialize(userId: string): Promise<{
    ready: boolean;
    keyPair: KeyPair;
    features: {
      sharing: boolean;
      audit: boolean;
      escrow: boolean;
    };
  }> {
    this.userId = userId;
    const keyPair = await this.keys.ensure();
    
    let features = {
      sharing: false,
      audit: false,
      escrow: false
    };

    if (this.cloud) {
      try {
        await this.cloud.exchangeToken();
        
        // Register public key
        await this.cloud.post('/v1/keys/register', {
          userId,
          publicKeyArmored: keyPair.publicKeyArmored
        });
        
        features.sharing = true;
        features.audit = true;

        // Auto-escrow if enabled
        if (this.options.autoEscrow) {
          await this.performAutoEscrow(keyPair);
          features.escrow = true;
        }
      } catch (error) {
        console.warn('Cloud features initialization failed:', error);
      }
    }

    return {
      ready: true,
      keyPair,
      features
    };
  }

  // Simplified document operations
  async save<T>(collection: string, doc: T): Promise<{ id: string; shared?: boolean }> {
    const id = await this.data.create({ collection, doc });
    
    // Auto-audit if enabled
    if (this.cloud) {
      this.audit.log({
        action: 'document_saved',
        collection,
        documentId: id,
        userId: this.userId,
        timestamp: Date.now()
      }).catch(error => console.warn('Audit failed:', error));
    }

    return { id };
  }

  async load<T>(collection: string, id: string): Promise<T | null> {
    return this.data.get<T>({ collection, id });
  }

  async update<T>(collection: string, id: string, doc: T): Promise<void> {
    await this.data.update({ collection, id, doc });
    
    // Auto-audit if enabled
    if (this.cloud) {
      this.audit.log({
        action: 'document_updated',
        collection,
        documentId: id,
        userId: this.userId,
        timestamp: Date.now()
      }).catch(error => console.warn('Audit failed:', error));
    }
  }

  async remove(collection: string, id: string): Promise<void> {
    await this.data.delete({ collection, id });
    
    // Auto-audit if enabled
    if (this.cloud) {
      this.audit.log({
        action: 'document_deleted',
        collection,
        documentId: id,
        userId: this.userId,
        timestamp: Date.now()
      }).catch(error => console.warn('Audit failed:', error));
    }
  }

  async list<T>(collection: string, options?: {
    limit?: number;
    orderBy?: any;
    where?: any[];
  }): Promise<T[]> {
    return this.data.query<T>({
      collection,
      limit: options?.limit,
      orderBy: options?.orderBy,
      where: options?.where
    });
  }

  // Simplified sharing
  async shareWith(collection: string, id: string, recipients: Array<{
    userId: string;
    email?: string;
    permissions?: 'read' | 'write';
  }>): Promise<{ success: boolean; sharedWith: string[] }> {
    try {
      await this.share.grant({
        collection,
        id,
        recipients: recipients.map(r => ({ userId: r.userId, email: r.email }))
      });

      // Audit the sharing action
      if (this.cloud) {
        this.audit.log({
          action: 'document_shared',
          collection,
          documentId: id,
          userId: this.userId,
          recipients: recipients.map(r => r.userId),
          timestamp: Date.now()
        }).catch(error => console.warn('Audit failed:', error));
      }

      return {
        success: true,
        sharedWith: recipients.map(r => r.userId)
      };
    } catch (error) {
      console.error('Sharing failed:', error);
      return {
        success: false,
        sharedWith: []
      };
    }
  }

  async unshareWith(collection: string, id: string, userId: string): Promise<{ success: boolean }> {
    try {
      await this.share.revoke({ collection, id, userId });

      // Audit the unsharing action
      if (this.cloud) {
        this.audit.log({
          action: 'document_unshared',
          collection,
          documentId: id,
          userId: this.userId,
          revokedFrom: userId,
          timestamp: Date.now()
        }).catch(error => console.warn('Audit failed:', error));
      }

      return { success: true };
    } catch (error) {
      console.error('Unsharing failed:', error);
      return { success: false };
    }
  }

  // Background operations
  async syncToCloud(): Promise<{ success: boolean; syncedItems: number }> {
    if (!this.options.backgroundSync || !this.cloud) {
      return { success: false, syncedItems: 0 };
    }

    try {
      // Placeholder for sync logic
      console.log('Background sync not yet implemented');
      return { success: true, syncedItems: 0 };
    } catch (error) {
      console.error('Sync failed:', error);
      return { success: false, syncedItems: 0 };
    }
  }

  async getAuditTrail(options?: {
    startDate?: Date;
    endDate?: Date;
    actions?: string[];
    limit?: number;
  }): Promise<Array<{
    id: string;
    action: string;
    timestamp: number;
    userId?: string;
    details?: any;
  }>> {
    if (!this.cloud) return [];

    try {
      const events = await this.cloud.get<any[]>('/v1/audit');
      
      let filtered = events || [];
      
      // Apply filters
      if (options?.startDate) {
        filtered = filtered.filter(e => e.timestamp >= options.startDate!.getTime());
      }
      if (options?.endDate) {
        filtered = filtered.filter(e => e.timestamp <= options.endDate!.getTime());
      }
      if (options?.actions) {
        filtered = filtered.filter(e => options.actions!.includes(e.action));
      }
      if (options?.limit) {
        filtered = filtered.slice(0, options.limit);
      }

      return filtered;
    } catch (error) {
      console.error('Failed to get audit trail:', error);
      return [];
    }
  }

  // Key management (hidden from typical developer use)
  async rotateKeys(): Promise<{ success: boolean; newKeyPair?: KeyPair }> {
    try {
      await this.keys.rotate();
      const newKeyPair = await this.keys.ensure();

      if (this.cloud && this.userId) {
        // Re-register new public key
        await this.cloud.post('/v1/keys/register', {
          userId: this.userId,
          publicKeyArmored: newKeyPair.publicKeyArmored
        });

        // Re-escrow if auto-escrow is enabled
        if (this.options.autoEscrow) {
          await this.performAutoEscrow(newKeyPair);
        }
      }

      return { success: true, newKeyPair };
    } catch (error) {
      console.error('Key rotation failed:', error);
      return { success: false };
    }
  }

  private async performAutoEscrow(keyPair: KeyPair): Promise<void> {
    if (!this.cloud || !this.userId) return;

    try {
      // Create a system-generated passphrase for auto-escrow
      const systemPassphrase = this.generateSystemPassphrase();
      
      const backupResult = await this.keys.backup({
        method: 'phrase',
        passphrase: systemPassphrase,
        metadata: {
          autoEscrow: true,
          userId: this.userId,
          timestamp: Date.now()
        }
      });

      if (backupResult.success) {
        await this.cloud.post('/v1/keys/escrow', {
          userId: this.userId,
          encPrivKey: backupResult.backupData
        });
      }
    } catch (error) {
      console.warn('Auto-escrow failed:', error);
    }
  }

  private generateSystemPassphrase(): string {
    // Generate a secure system passphrase for auto-escrow
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }
}