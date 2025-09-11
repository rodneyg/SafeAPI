import type { StorageAdapter } from '../types';

// Placeholder interface using Firestore via Cloud Functions proxy or direct SDK
// For emulator-friendly usage, prefer using cloud endpoints for metering.
export class FirebaseAdapter implements StorageAdapter {
  constructor(private opts: { projectId: string }) {}

  async create(_p: { collection: string; encryptedDoc: Uint8Array; meta?: any }): Promise<string> {
    throw new Error('FirebaseAdapter not implemented in scaffold');
  }
  async get(_p: { collection: string; id: string }): Promise<Uint8Array | null> {
    throw new Error('FirebaseAdapter not implemented in scaffold');
  }
  async update(_p: { collection: string; id: string; encryptedDoc: Uint8Array }): Promise<void> {
    throw new Error('FirebaseAdapter not implemented in scaffold');
  }
  async delete(_p: { collection: string; id: string }): Promise<void> {
    throw new Error('FirebaseAdapter not implemented in scaffold');
  }
  async query(_p: { collection: string; filter?: any; orderBy?: any; limit?: number }): Promise<Uint8Array[]> {
    return [];
  }
}

