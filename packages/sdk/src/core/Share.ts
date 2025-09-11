import type { CloudClient } from '../cloud/client';

export class ShareCore {
  constructor(private cloud?: CloudClient) {}
  async grant(p: { collection: string; id: string; recipients: { userId: string; email?: string }[] }): Promise<void> {
    if (!this.cloud) return;
    const { kref } = await this.cloud.post('/v1/broker/doc-key', { collection: p.collection, docId: p.id });
    for (const r of p.recipients) {
      await this.cloud.post('/v1/broker/grant', { kref, recipientUserId: r.userId });
    }
  }
  async revoke(p: { collection: string; id: string; userId: string }): Promise<void> {
    if (!this.cloud) return;
    const { kref } = await this.cloud.post('/v1/broker/doc-key', { collection: p.collection, docId: p.id });
    await this.cloud.post('/v1/broker/revoke', { kref, userId: p.userId });
    await this.cloud.post('/v1/broker/rotate', { kref });
  }
}

