import type { CloudClient } from '../cloud/client';
import type { AuditLogEntry } from '../types';

export class AuditCore {
  constructor(private cloud?: CloudClient) {}
  
  async log(entry: Omit<AuditLogEntry, 'id' | 'ts' | 'sig' | 'projectId'>): Promise<Pick<AuditLogEntry, 'id' | 'sig'> | void> {
    if (!this.cloud) return;
    return this.cloud.post('/v1/audit', entry);
  }
}

