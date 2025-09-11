import type { StorageAdapter } from '../types';

export class ExportCore {
  constructor(private storage: StorageAdapter) {}
  async bundle(p: { collections: string[] }): Promise<ArrayBuffer> {
    // Demo: export raw bytes of first N docs of each collection
    const chunks: Uint8Array[] = [];
    for (const c of p.collections) {
      const docs = await this.storage.query({ collection: c, limit: 10 });
      for (const d of docs) chunks.push(d);
    }
    const total = chunks.reduce((n, u) => n + u.length, 0);
    const out = new Uint8Array(total);
    let off = 0;
    for (const u of chunks) {
      out.set(u, off);
      off += u.length;
    }
    return out.buffer;
  }
  async import(_bundle: ArrayBuffer): Promise<void> {
    console.warn('import bundle not implemented');
  }
}

