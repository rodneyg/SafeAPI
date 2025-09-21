import type { CloudClient } from '../cloud/client';
import type { ShareRecipient, ShareGroup, ShareOptions } from '../types';
import { wrapKeyWithPGP, unwrapKeyWithPGP } from '../crypto/openpgp';

export class ShareCore {
  constructor(private cloud?: CloudClient, private getDocumentKey?: (collection: string, id: string) => Promise<CryptoKey | null>) {}

  async grant(p: { collection: string; id: string; recipients: ShareRecipient[]; options?: ShareOptions }): Promise<void> {
    if (!this.cloud) return;
    
    // Get or create document key reference
    const { kref } = await this.cloud.post('/v1/broker/doc-key', { collection: p.collection, docId: p.id });
    
    // Get document key for wrapping
    const docKey = this.getDocumentKey ? await this.getDocumentKey(p.collection, p.id) : null;
    
    // Process recipients in batch for efficiency
    const wrappedKeys: { [userId: string]: string } = {};
    
    for (const recipient of p.recipients) {
      if (recipient.publicKeyArmored && docKey) {
        // Wrap the document key with recipient's public key
        const wrapped = await wrapKeyWithPGP(docKey, recipient.publicKeyArmored);
        wrappedKeys[recipient.userId] = wrapped as string;
      }
    }
    
    // Send bulk grant request with wrapped keys
    await this.cloud.post('/v1/broker/grant-bulk', { 
      kref, 
      wrappedKeys,
      options: p.options 
    });
    
    // Audit log the sharing action if enabled
    if (p.options?.auditLog && this.cloud) {
      await this.cloud.post('/v1/audit', {
        action: 'SHARE_GRANT',
        resource: { type: 'document', id: `${p.collection}/${p.id}` },
        meta: { 
          recipients: p.recipients.map(r => r.userId),
          permissions: p.options.permissions,
          expiresAt: p.options.expiresAt?.toISOString()
        }
      });
    }
  }

  async grantGroup(p: { collection: string; id: string; group: ShareGroup; options?: ShareOptions }): Promise<void> {
    // Convert group members to recipients and grant access
    await this.grant({
      collection: p.collection,
      id: p.id,
      recipients: p.group.members,
      options: p.options
    });
    
    // Log group sharing specifically
    if (p.options?.auditLog && this.cloud) {
      await this.cloud.post('/v1/audit', {
        action: 'SHARE_GRANT_GROUP',
        resource: { type: 'document', id: `${p.collection}/${p.id}` },
        meta: { 
          groupId: p.group.groupId,
          groupName: p.group.name,
          memberCount: p.group.members.length,
          permissions: p.options.permissions
        }
      });
    }
  }

  async revoke(p: { collection: string; id: string; userId: string; options?: ShareOptions }): Promise<void> {
    if (!this.cloud) return;
    const { kref } = await this.cloud.post('/v1/broker/doc-key', { collection: p.collection, docId: p.id });
    await this.cloud.post('/v1/broker/revoke', { kref, userId: p.userId });
    await this.cloud.post('/v1/broker/rotate', { kref });
    
    // Audit log the revocation
    if (p.options?.auditLog && this.cloud) {
      await this.cloud.post('/v1/audit', {
        action: 'SHARE_REVOKE',
        resource: { type: 'document', id: `${p.collection}/${p.id}` },
        meta: { revokedUserId: p.userId }
      });
    }
  }

  async revokeGroup(p: { collection: string; id: string; groupId: string; options?: ShareOptions }): Promise<void> {
    if (!this.cloud) return;
    
    // Revoke access for entire group
    await this.cloud.post('/v1/broker/revoke-group', { 
      collection: p.collection, 
      docId: p.id, 
      groupId: p.groupId 
    });
    
    // Audit log the group revocation
    if (p.options?.auditLog && this.cloud) {
      await this.cloud.post('/v1/audit', {
        action: 'SHARE_REVOKE_GROUP',
        resource: { type: 'document', id: `${p.collection}/${p.id}` },
        meta: { revokedGroupId: p.groupId }
      });
    }
  }

  async getSharedWith(p: { collection: string; id: string }): Promise<{ users: string[]; groups: string[] }> {
    if (!this.cloud) return { users: [], groups: [] };
    
    const response = await this.cloud.get(`/v1/broker/doc-key/${p.collection}/${p.id}/shares`);
    return response;
  }

  async unwrapSharedKey(p: { collection: string; id: string; privateKeyArmored: string }): Promise<CryptoKey | null> {
    if (!this.cloud) return null;
    
    try {
      // Get wrapped key for current user
      const response = await this.cloud.get(`/v1/broker/doc-key/${p.collection}/${p.id}/wrapped-key`);
      if (!response.wrappedKey) return null;
      
      // Unwrap the key using user's private key
      const key = await unwrapKeyWithPGP(response.wrappedKey, p.privateKeyArmored);
      return key;
    } catch (error) {
      console.warn('Failed to unwrap shared key:', error);
      return null;
    }
  }
}

