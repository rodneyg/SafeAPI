import type { CloudClient } from '../cloud/client';

export class AuditCore {
  constructor(private cloud?: CloudClient) {}
  async log(e: { action: 'WRITE' | 'READ' | 'UPDATE' | 'DELETE'; resource: { type: string; id?: string }; meta?: any }): Promise<void> {
    if (!this.cloud) return;
    await this.cloud.post('/v1/audit', e);
  }
}

