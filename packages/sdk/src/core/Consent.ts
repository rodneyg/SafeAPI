import type { CloudClient } from '../cloud/client';
import type { ConsentRecord } from '../types';

export class ConsentCore {
  constructor(private cloud?: CloudClient) {}
  
  async record(
    subjectId: string,
    type: string,
    granted: boolean,
    options?: { method?: string; meta?: any }
  ): Promise<Pick<ConsentRecord, 'id' | 'sig'> | void> {
    if (!this.cloud) return;
    const payload = {
      subjectId,
      type,
      granted,
      method: options?.method,
      meta: options?.meta,
      ts: Date.now()
    };
    return this.cloud.post('/v1/consent', payload);
  }
  
  async history(subjectId: string): Promise<ConsentRecord[]> {
    if (!this.cloud) return [];
    return this.cloud.get(`/v1/consent/${encodeURIComponent(subjectId)}`);
  }
}

