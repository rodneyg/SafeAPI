// Node.js version check - ensure version 20 or higher
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
  const nodeVersion = process.versions.node;
  const majorVersion = parseInt(nodeVersion.split('.')[0], 10);
  if (majorVersion < 20) {
    throw new Error(`SafeAPI SDK requires Node.js version 20 or higher. Current version: ${nodeVersion}`);
  }
}

export type { EncryptionMode, SafeAPIConfig, StorageAdapter, ConsentRecord, AuditLogEntry } from './types';
export { SafeAPI } from './core/SafeAPI';
export { FilesAdapter } from './adapters/FilesAdapter';
export { FirebaseAdapter } from './adapters/FirebaseAdapter';
export { SupabaseAdapter } from './adapters/SupabaseAdapter';
export * as Crypto from './crypto/openpgp';

