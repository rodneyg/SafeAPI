import type { CloudClient } from '../cloud/client';

export class ConsentCore {
  constructor(private cloud?: CloudClient) {}
  async record(type: string, granted: boolean, meta?: any): Promise<void> {
    if (!this.cloud) return;
    await this.cloud.post('/v1/consent', { type, granted, meta, ts: Date.now() });
  }
  async history(subjectId: string): Promise<any[]> {
    if (!this.cloud) return [];
    return this.cloud.get(`/v1/consent/${encodeURIComponent(subjectId)}`);
  }
}

