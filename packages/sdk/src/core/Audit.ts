import type { CloudClient } from '../cloud/client';

export interface AuditEvent {
  action: string;
  resource?: { type: string; id?: string };
  meta?: any;
  // Flexible properties for different audit event types
  [key: string]: any;
}

export class AuditCore {
  constructor(private cloud?: CloudClient) {}
  
  async log(e: AuditEvent): Promise<void> {
    if (!this.cloud) return;
    await this.cloud.post('/v1/audit', e);
  }
}

