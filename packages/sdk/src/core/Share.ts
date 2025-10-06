import type { CloudClient } from '../cloud/client';
import { 
  wrapKeyForMultipleRecipients, 
  reWrapKey, 
  generateDocumentKey,
  wrapKeyWithPGP,
  unwrapKeyWithPGP
} from '../crypto/openpgp';

export class ShareCore {
  constructor(private cloud?: CloudClient) {}

  // Grant access to multiple recipients for a document
  async grant(p: { 
    collection: string; 
    id: string; 
    recipients: { userId: string; email?: string; publicKeyArmored: string }[];
    documentKey?: CryptoKey;
  }): Promise<{ documentKey: CryptoKey; wrappedKeys: { userId: string; wrappedKey: string }[] }> {
    if (!this.cloud) throw new Error('Cloud client required for sharing');
    
    // Generate or use existing document key
    const documentKey = p.documentKey || await generateDocumentKey();
    
    // Wrap the document key for all recipients
    const wrappedKeys = await wrapKeyForMultipleRecipients(documentKey, p.recipients);
    
    // Register document key with broker
    const { kref } = await this.cloud.post('/v1/broker/doc-key', { 
      collection: p.collection, 
      docId: p.id 
    });
    
    // Store wrapped keys for each recipient
    for (const { userId, wrappedKey } of wrappedKeys) {
      await this.cloud.post('/v1/broker/grant', { 
        kref, 
        recipientUserId: userId, 
        wrappedKey 
      });
    }
    
    return { documentKey, wrappedKeys };
  }

  // Revoke access for a specific user
  async revoke(p: { collection: string; id: string; userId: string }): Promise<void> {
    if (!this.cloud) throw new Error('Cloud client required for sharing');
    
    const { kref } = await this.cloud.post('/v1/broker/doc-key', { 
      collection: p.collection, 
      docId: p.id 
    });
    
    await this.cloud.post('/v1/broker/revoke', { kref, userId: p.userId });
    await this.cloud.post('/v1/broker/rotate', { kref });
  }

  // Re-share document with new recipients (using existing recipient's key to decrypt and re-wrap)
  async reShare(p: {
    collection: string;
    id: string;
    currentUserId: string;
    currentUserPrivateKey: string;
    newRecipients: { userId: string; email?: string; publicKeyArmored: string }[];
  }): Promise<{ wrappedKeys: { userId: string; wrappedKey: string }[] }> {
    if (!this.cloud) throw new Error('Cloud client required for sharing');
    
    // Get current wrapped key for the user
    const { wrappedKey } = await this.cloud.post('/v1/broker/get-wrapped-key', {
      collection: p.collection,
      docId: p.id,
      userId: p.currentUserId
    });
    
    // Re-wrap for new recipients
    const wrappedKeys = await reWrapKey(
      wrappedKey,
      p.currentUserPrivateKey,
      p.newRecipients
    );
    
    // Register with broker
    const { kref } = await this.cloud.post('/v1/broker/doc-key', { 
      collection: p.collection, 
      docId: p.id 
    });
    
    for (const { userId, wrappedKey: newWrappedKey } of wrappedKeys) {
      await this.cloud.post('/v1/broker/grant', { 
        kref, 
        recipientUserId: userId, 
        wrappedKey: newWrappedKey 
      });
    }
    
    return { wrappedKeys };
  }

  // Get wrapped key for current user
  async getWrappedKey(p: { 
    collection: string; 
    id: string; 
    userId: string 
  }): Promise<string> {
    if (!this.cloud) throw new Error('Cloud client required for sharing');
    
    const { wrappedKey } = await this.cloud.post('/v1/broker/get-wrapped-key', {
      collection: p.collection,
      docId: p.id,
      userId: p.userId
    });
    
    return wrappedKey;
  }

  // Unwrap key for current user
  async unwrapKey(p: {
    wrappedKey: string;
    privateKeyArmored: string;
  }): Promise<CryptoKey> {
    return await unwrapKeyWithPGP(p.wrappedKey, p.privateKeyArmored);
  }

  // List all recipients for a document
  async listRecipients(p: { 
    collection: string; 
    id: string 
  }): Promise<{ userId: string; grantedAt: string }[]> {
    if (!this.cloud) throw new Error('Cloud client required for sharing');
    
    const { recipients } = await this.cloud.post('/v1/broker/list-recipients', {
      collection: p.collection,
      docId: p.id
    });
    
    return recipients;
  }
}

