import type { StorageAdapter } from '../types';

/**
 * SupabaseAdapter for SafeAPI storage operations using Supabase (PostgreSQL).
 * 
 * Database Index Recommendations for Optimal Query Performance:
 * 
 * For audit log queries that use orderBy('ts', 'desc'):
 * CREATE INDEX idx_audit_events_ts_desc ON audit_events (ts DESC);
 * 
 * For consent record queries that use orderBy('ts', 'desc'):  
 * CREATE INDEX idx_consent_records_ts_desc ON consent_records (ts DESC);
 * 
 * Additional composite indexes may be beneficial for filtered queries:
 * CREATE INDEX idx_audit_events_project_ts ON audit_events (project_id, ts DESC);
 * CREATE INDEX idx_consent_records_subject_ts ON consent_records (subject_id, ts DESC);
 * 
 * These indexes significantly improve performance for timestamp-based ordering
 * operations commonly used in audit logs and consent tracking.
 */
export class SupabaseAdapter implements StorageAdapter {
  constructor(private opts: { url: string; anonKey: string; tablePrefix?: string }) {}

  async create(_p: { collection: string; encryptedDoc: Uint8Array; meta?: any }): Promise<string> {
    throw new Error('SupabaseAdapter not implemented in scaffold');
  }
  async get(_p: { collection: string; id: string }): Promise<Uint8Array | null> {
    throw new Error('SupabaseAdapter not implemented in scaffold');
  }
  async update(_p: { collection: string; id: string; encryptedDoc: Uint8Array }): Promise<void> {
    throw new Error('SupabaseAdapter not implemented in scaffold');
  }
  async delete(_p: { collection: string; id: string }): Promise<void> {
    throw new Error('SupabaseAdapter not implemented in scaffold');
  }
  async query(_p: { collection: string; filter?: any; orderBy?: any; limit?: number }): Promise<Uint8Array[]> {
    return [];
  }
}

