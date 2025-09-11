import type { StorageAdapter } from '../types';

// Simple in-memory adapter (persists to localStorage in browser)
export class FilesAdapter implements StorageAdapter {
  private store = new Map<string, Uint8Array>();
  private seq = 0;

  constructor(private ns = 'safe-files') {
    if (typeof window !== 'undefined' && window?.localStorage) {
      const raw = window.localStorage.getItem(this.ns);
      if (raw) {
        try {
          const obj = JSON.parse(raw) as Record<string, number[]>;
          for (const [k, arr] of Object.entries(obj)) this.store.set(k, new Uint8Array(arr));
        } catch {}
      }
    }
  }

  private persist() {
    if (typeof window !== 'undefined' && window?.localStorage) {
      const obj: Record<string, number[]> = {};
      for (const [k, v] of this.store.entries()) obj[k] = Array.from(v);
      window.localStorage.setItem(this.ns, JSON.stringify(obj));
    }
  }

  async create(p: { collection: string; encryptedDoc: Uint8Array; meta?: any }): Promise<string> {
    const id = `${Date.now()}_${++this.seq}`;
    const key = `${p.collection}/${id}`;
    this.store.set(key, p.encryptedDoc);
    this.persist();
    return id;
  }
  async get(p: { collection: string; id: string }): Promise<Uint8Array | null> {
    return this.store.get(`${p.collection}/${p.id}`) || null;
  }
  async update(p: { collection: string; id: string; encryptedDoc: Uint8Array }): Promise<void> {
    this.store.set(`${p.collection}/${p.id}`, p.encryptedDoc);
    this.persist();
  }
  async delete(p: { collection: string; id: string }): Promise<void> {
    this.store.delete(`${p.collection}/${p.id}`);
    this.persist();
  }
  async query(p: { collection: string; filter?: any; orderBy?: any; limit?: number }): Promise<Uint8Array[]> {
    const out: Uint8Array[] = [];
    for (const [k, v] of this.store.entries()) {
      if (k.startsWith(`${p.collection}/`)) out.push(v);
      if (p.limit && out.length >= p.limit) break;
    }
    return out;
  }
}

