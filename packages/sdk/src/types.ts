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

export interface EncryptionOptions {
  /** MIME type or format identifier for the content being encrypted */
  contentType?: string;
  /** Additional metadata to associate with the encrypted content */
  metadata?: Record<string, any>;
  /** Optional pre-existing CryptoKey for encryption */
  key?: CryptoKey;
  /** Encryption algorithm (default: 'AES-GCM') */
  algorithm?: string;
  /** Key length in bits (default: 256) */
  keyLength?: number;
}

