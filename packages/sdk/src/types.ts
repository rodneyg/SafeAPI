export type EncryptionMode = 'none' | 'field' | 'document';

export interface StorageAdapter {
  create(p: { collection: string; encryptedDoc: Uint8Array; meta?: any }): Promise<string>;
  get(p: { collection: string; id: string }): Promise<Uint8Array | null>;
  update(p: { collection: string; id: string; encryptedDoc: Uint8Array }): Promise<void>;
  delete(p: { collection: string; id: string }): Promise<void>;
  query(p: { collection: string; filter?: any; orderBy?: any; limit?: number }): Promise<Uint8Array[]>;
}

export interface SafeAPIConfig {
  storage: StorageAdapter;
  cloud?: { endpoint: string; apiKey: string; projectId: string };
  crypto?: { mode: 'client'; keystore?: 'indexeddb' | 'memory' };
  defaults?: { encryption: EncryptionMode; audit?: boolean; shareable?: boolean };
}

export interface KeyPair {
  publicKeyArmored: string;
  privateKeyArmored: string;
}

export interface ConsentRecord {
  /** Unique identifier for the consent record */
  id?: string;
  /** Subject/user ID for whom consent is being recorded */
  subjectId: string;
  /** Type of consent (e.g., 'data_processing', 'marketing', 'analytics') */
  type: string;
  /** Whether consent was granted (true) or denied/revoked (false) */
  granted: boolean;
  /** Method of consent collection (e.g., 'web_form', 'api', 'email') */
  method?: string;
  /** Timestamp when consent was recorded (Unix timestamp in milliseconds) */
  ts: number;
  /** Digital signature for audit trail integrity */
  sig: string;
  /** Project ID associated with this consent record */
  projectId: string;
  /** Additional metadata for compliance and context */
  meta?: any;
}

export interface AuditLogEntry {
  /** Unique identifier for the audit log entry */
  id?: string;
  /** Action performed (WRITE, READ, UPDATE, DELETE) */
  action: 'WRITE' | 'READ' | 'UPDATE' | 'DELETE';
  /** Resource that was acted upon */
  resource: {
    /** Type of resource (e.g., 'document', 'key', 'user') */
    type: string;
    /** Optional resource identifier */
    id?: string;
  };
  /** Timestamp when action was performed (Unix timestamp in milliseconds) */
  ts: number;
  /** Digital signature for audit trail integrity */
  sig: string;
  /** Project ID associated with this audit entry */
  projectId: string;
  /** Additional metadata for the audit entry */
  meta?: any;
}

