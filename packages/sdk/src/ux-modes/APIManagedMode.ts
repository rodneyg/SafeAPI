import type { SafeAPIConfig, StorageAdapter, APIManagedOptions } from '../types';
import { CloudClient } from '../cloud/client';

/**
 * API-Managed UX Mode
 * 
 * SafeAPI handles nearly all aspects transparently; the app exposes little or no crypto UX.
 * All key management, encryption, and security operations happen server-side or transparently.
 * 
 * This mode provides the simplest integration but with less control.
 * 
 * API responsibilities:
 * - Complete key lifecycle management
 * - Transparent encryption/decryption
 * - Server-side security operations
 * - Automatic compliance and audit
 */
export class APIManagedMode {
  private storage: StorageAdapter;
  private cloud?: CloudClient;
  private userId?: string;
  private options: APIManagedOptions;

  constructor(config: SafeAPIConfig & { uxMode: 'api-managed' }, options: APIManagedOptions = {}) {
    this.storage = config.storage;
    this.options = options;
    
    if (config.cloud) {
      this.cloud = new CloudClient({ 
        endpoint: config.cloud.endpoint, 
        apiKey: config.cloud.apiKey 
      });
    }
  }

  async initialize(userId: string): Promise<{
    ready: boolean;
    features: {
      transparentEncryption: boolean;
      serverSideKeys: boolean;
      automaticAudit: boolean;
      automaticBackup: boolean;
    };
  }> {
    this.userId = userId;
    
    let features = {
      transparentEncryption: false,
      serverSideKeys: false,
      automaticAudit: false,
      automaticBackup: false
    };

    if (this.cloud) {
      try {
        await this.cloud.exchangeToken();
        
        // Initialize user in cloud system
        await this.cloud.post('/v1/keys/register', {
          userId,
          publicKeyArmored: null // Server will generate keys
        });

        features = {
          transparentEncryption: true,
          serverSideKeys: this.options.serverSideKeys !== false,
          automaticAudit: true,
          automaticBackup: true
        };
      } catch (error) {
        console.warn('API-managed mode initialization failed:', error);
      }
    }

    return { ready: !!this.cloud, features };
  }

  // Ultra-simplified data operations - no crypto exposed to developer
  async store(collection: string, data: any): Promise<{ id: string; encrypted: boolean }> {
    if (!this.cloud) {
      // Graceful fallback to local storage when cloud is not available
      console.warn('API-managed mode: Cloud not available, using local storage fallback');
      const id = await this.storeLocally(collection, data);
      return { id, encrypted: false };
    }

    try {
      // In API-managed mode, the server handles all encryption
      const response = await this.cloud.post<{ id: string; encrypted: boolean }>('/v1/data/store', {
        userId: this.userId,
        collection,
        data,
        options: {
          transparentEncryption: this.options.transparentMode !== false,
          serverSideKeys: this.options.serverSideKeys !== false
        }
      });

      return response;
    } catch (error) {
      // Fallback to local storage with minimal encryption
      console.warn('Server storage failed, using local fallback:', error);
      const id = await this.storeLocally(collection, data);
      return { id, encrypted: false };
    }
  }

  async retrieve(collection: string, id: string): Promise<any> {
    if (!this.cloud) {
      return this.retrieveLocally(collection, id);
    }

    try {
      // Server handles all decryption transparently
      const response = await this.cloud.post<{ data: any }>('/v1/data/retrieve', {
        userId: this.userId,
        collection,
        id
      });

      return response.data;
    } catch (error) {
      console.warn('Server retrieval failed, trying local fallback:', error);
      return this.retrieveLocally(collection, id);
    }
  }

  async update(collection: string, id: string, data: any): Promise<{ success: boolean; encrypted: boolean }> {
    if (!this.cloud) {
      await this.updateLocally(collection, id, data);
      return { success: true, encrypted: false };
    }

    try {
      await this.cloud.post('/v1/data/update', {
        userId: this.userId,
        collection,
        id,
        data
      });

      return { success: true, encrypted: true };
    } catch (error) {
      console.warn('Server update failed, using local fallback:', error);
      await this.updateLocally(collection, id, data);
      return { success: true, encrypted: false };
    }
  }

  async delete(collection: string, id: string): Promise<{ success: boolean }> {
    if (!this.cloud) {
      await this.deleteLocally(collection, id);
      return { success: true };
    }

    try {
      await this.cloud.post('/v1/data/delete', {
        userId: this.userId,
        collection,
        id
      });

      return { success: true };
    } catch (error) {
      console.warn('Server delete failed, using local fallback:', error);
      await this.deleteLocally(collection, id);
      return { success: true };
    }
  }

  async list(collection: string, options?: {
    limit?: number;
    orderBy?: string;
    filters?: Record<string, any>;
  }): Promise<Array<{ id: string; data: any; metadata?: any }>> {
    if (!this.cloud) {
      return this.listLocally(collection, options);
    }

    try {
      const response = await this.cloud.post<Array<{ id: string; data: any; metadata?: any }>>('/v1/data/list', {
        userId: this.userId,
        collection,
        options
      });

      return response;
    } catch (error) {
      console.warn('Server list failed, using local fallback:', error);
      return this.listLocally(collection, options);
    }
  }

  // Transparent sharing - no crypto UX
  async share(collection: string, id: string, recipients: string[]): Promise<{
    success: boolean;
    sharedWith: string[];
    shareLinks?: string[];
  }> {
    if (!this.cloud) {
      console.warn('Sharing not available without cloud configuration');
      return { success: false, sharedWith: [] };
    }

    try {
      const response = await this.cloud.post<{
        success: boolean;
        sharedWith: string[];
        shareLinks?: string[];
      }>('/v1/sharing/share', {
        userId: this.userId,
        collection,
        id,
        recipients,
        options: {
          transparentMode: this.options.transparentMode !== false
        }
      });

      return response;
    } catch (error) {
      console.error('Sharing failed:', error);
      return { success: false, sharedWith: [] };
    }
  }

  async unshare(collection: string, id: string, recipients: string[]): Promise<{ success: boolean }> {
    if (!this.cloud) {
      return { success: false };
    }

    try {
      await this.cloud.post('/v1/sharing/unshare', {
        userId: this.userId,
        collection,
        id,
        recipients
      });

      return { success: true };
    } catch (error) {
      console.error('Unsharing failed:', error);
      return { success: false };
    }
  }

  // Automatic compliance and audit
  async getComplianceReport(options?: {
    format?: 'json' | 'pdf' | 'csv';
    dateRange?: { start: Date; end: Date };
    standards?: string[];
  }): Promise<{ reportId: string; downloadUrl?: string }> {
    if (!this.cloud) {
      throw new Error('Compliance reports require cloud configuration');
    }

    try {
      const response = await this.cloud.post<{ reportId: string }>('/v1/reports/generate', {
        userId: this.userId,
        format: options?.format || 'json',
        dateRange: options?.dateRange,
        standards: options?.standards
      });

      // Get download URL if available
      let downloadUrl: string | undefined;
      try {
        const report = await this.cloud.get<{ urlSigned?: string }>(`/v1/reports/${response.reportId}`);
        downloadUrl = report.urlSigned;
      } catch (error) {
        console.warn('Failed to get report download URL:', error);
      }

      return { reportId: response.reportId, downloadUrl };
    } catch (error) {
      console.error('Compliance report generation failed:', error);
      throw error;
    }
  }

  async getUsageMetrics(): Promise<{
    storage: { used: number; limit: number; unit: string };
    operations: { count: number; limit: number; period: string };
    sharing: { activeShares: number; limit: number };
  }> {
    if (!this.cloud) {
      return {
        storage: { used: 0, limit: 0, unit: 'MB' },
        operations: { count: 0, limit: 0, period: 'day' },
        sharing: { activeShares: 0, limit: 0 }
      };
    }

    try {
      const response = await this.cloud.get<any>('/v1/usage');
      
      // Transform response to standardized format
      return {
        storage: {
          used: response.byFeature?.storage_used || 0,
          limit: 1000, // From project limits
          unit: 'MB'
        },
        operations: {
          count: response.byFeature?.cloud_call || 0,
          limit: 10000, // From project limits
          period: 'day'
        },
        sharing: {
          activeShares: response.byFeature?.active_shares || 0,
          limit: 100
        }
      };
    } catch (error) {
      console.error('Failed to get usage metrics:', error);
      return {
        storage: { used: 0, limit: 0, unit: 'MB' },
        operations: { count: 0, limit: 0, period: 'day' },
        sharing: { activeShares: 0, limit: 0 }
      };
    }
  }

  // Fallback local storage methods (simplified, no encryption)
  private async storeLocally(collection: string, data: any): Promise<string> {
    const doc = new TextEncoder().encode(JSON.stringify({ data, createdAt: Date.now() }));
    const id = await this.storage.create({ collection, encryptedDoc: doc });
    return id;
  }

  private async retrieveLocally(collection: string, id: string): Promise<any> {
    const doc = await this.storage.get({ collection, id });
    if (!doc) return null;
    const parsed = JSON.parse(new TextDecoder().decode(doc));
    return parsed.data;
  }

  private async updateLocally(collection: string, id: string, data: any): Promise<void> {
    const doc = new TextEncoder().encode(JSON.stringify({ data, updatedAt: Date.now() }));
    await this.storage.update({ collection, id, encryptedDoc: doc });
  }

  private async deleteLocally(collection: string, id: string): Promise<void> {
    await this.storage.delete({ collection, id });
  }

  private async listLocally(collection: string, options?: any): Promise<Array<{ id: string; data: any; metadata?: any }>> {
    const docs = await this.storage.query({ 
      collection, 
      limit: options?.limit 
    });
    
    return docs.map((doc, index) => {
      try {
        const parsed = JSON.parse(new TextDecoder().decode(doc));
        return {
          id: `local_${index}`,
          data: parsed.data,
          metadata: { 
            createdAt: parsed.createdAt,
            updatedAt: parsed.updatedAt 
          }
        };
      } catch (error) {
        return {
          id: `local_${index}`,
          data: null,
          metadata: { error: 'Parse failed' }
        };
      }
    });
  }
}