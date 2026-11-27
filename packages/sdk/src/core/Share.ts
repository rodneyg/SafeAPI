import type { CloudClient } from '../cloud/client';

export class ShareCore {
  constructor(private cloud?: CloudClient) {}
  async grant(p: { collection: string; id: string; recipients: { userId: string; email?: string; wrappedKey: string }[] }): Promise<void> {
    if (!this.cloud) return;
    const { kref } = await this.cloud.post('/v1/broker/doc-key', { collection: p.collection, docId: p.id });
    for (const r of p.recipients) {
      await this.cloud.post('/v1/broker/grant', { kref, recipientUserId: r.userId, wrappedKey: r.wrappedKey });
    }
  }
  async getWrappedKey(p: { collection: string; id: string; userId: string }): Promise<string> {
    if (!this.cloud) throw new Error('Cloud client is required to retrieve a shared key');
    const { kref } = await this.cloud.post('/v1/broker/doc-key', { collection: p.collection, docId: p.id });
    const query = new URLSearchParams({ kref, recipientUserId: p.userId });
    const result = await this.cloud.get<{ wrappedKey: string }>(`/v1/broker/wrapped-key?${query}`);
    return result.wrappedKey;
  }
  async revoke(p: { collection: string; id: string; userId: string }): Promise<void> {
    if (!this.cloud) return;
    const { kref } = await this.cloud.post('/v1/broker/doc-key', { collection: p.collection, docId: p.id });
    await this.cloud.post('/v1/broker/revoke', { kref, userId: p.userId });
    await this.cloud.post('/v1/broker/rotate', { kref });
  }
}

