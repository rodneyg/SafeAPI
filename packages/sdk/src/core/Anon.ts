import type { StorageAdapter } from '../types';

export class AnonCore {
  constructor(private storage: StorageAdapter) {}
  async create(collection: string, doc: Record<string, any>): Promise<string> {
    // Store as plaintext JSON for anonymous demo writes
    const blob = new TextEncoder().encode(JSON.stringify({ __mode: 'none', doc }));
    return this.storage.create({ collection, encryptedDoc: blob });
  }
}

