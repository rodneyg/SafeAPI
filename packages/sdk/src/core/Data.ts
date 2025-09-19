import type { EncryptionMode, StorageAdapter } from '../types';
import { decryptJsonAesGcm, encryptJsonAesGcm } from '../crypto/openpgp';

type Policy<T> = { encryption: EncryptionMode; fields?: (keyof T)[]; shareable?: boolean };

export class DataCore {
  private storage: StorageAdapter;
  private defaultMode: EncryptionMode;
  // naive in-memory doc key store for demo
  private docKeys = new Map<string, CryptoKey>();

  constructor(storage: StorageAdapter, defaults?: { encryption: EncryptionMode }) {
    this.storage = storage;
    this.defaultMode = defaults?.encryption || 'document';
  }

  private keyFor(collection: string, id: string) {
    return `${collection}:${id}`;
  }

  async create<T>(p: { collection: string; doc: T; policy?: Policy<T> }): Promise<string> {
    const policy = p.policy || { encryption: this.defaultMode };
    let encrypted: Uint8Array;
    let key: CryptoKey | undefined;

    if (policy.encryption === 'none') {
      encrypted = new TextEncoder().encode(JSON.stringify({ __mode: 'none', doc: p.doc }));
    } else if (policy.encryption === 'field') {
      // Simplified: encrypt only fields list, store plaintext others
      const fields = policy.fields || [];
      const partial: any = { ...p.doc } as any;
      const protectedObj: any = {};
      for (const f of fields) {
        protectedObj[f as string] = (p.doc as any)[f as string];
        delete partial[f as string];
      }
      const { encrypted: enc, key: k } = await encryptJsonAesGcm(protectedObj, { 
        contentType: 'application/json',
        metadata: { mode: 'field', fields: fields.map(String) }
      });
      key = k;
      encrypted = enc;
      (partial.__mode = 'field'), (partial.__iv = null), (partial.__blob = Array.from(enc));
      // we embed the encrypted blob in the record for demo adapter
      encrypted = new TextEncoder().encode(JSON.stringify(partial));
    } else {
      const r = await encryptJsonAesGcm(p.doc, {
        contentType: 'application/json',
        metadata: { mode: 'document', collection: p.collection }
      });
      encrypted = r.encrypted;
      key = r.key;
    }

    const id = await this.storage.create({ collection: p.collection, encryptedDoc: encrypted, meta: { mode: policy.encryption } });
    if (key) this.docKeys.set(this.keyFor(p.collection, id), key);
    return id;
  }

  async get<T>(p: { collection: string; id: string }): Promise<T | null> {
    const blob = await this.storage.get({ collection: p.collection, id: p.id });
    if (!blob) return null;
    // Detect mode
    try {
      const asText = new TextDecoder().decode(blob);
      const parsed = JSON.parse(asText);
      if (parsed && parsed.__mode === 'none') return parsed.doc as T;
      if (parsed && parsed.__mode === 'field') return parsed as T; // caller decrypts as needed (demo)
    } catch (_) {
      // not JSON => assume document mode
    }
    const key = this.docKeys.get(this.keyFor(p.collection, p.id));
    if (!key) throw new Error('Missing document key');
    return (await decryptJsonAesGcm(blob, key)) as T;
  }

  async update<T>(p: { collection: string; id: string; doc: T; policy?: Policy<T> }): Promise<void> {
    const policy = p.policy || { encryption: this.defaultMode };
    let encrypted: Uint8Array;
    let key = this.docKeys.get(this.keyFor(p.collection, p.id));
    if (policy.encryption === 'none') {
      encrypted = new TextEncoder().encode(JSON.stringify({ __mode: 'none', doc: p.doc }));
    } else if (policy.encryption === 'field') {
      const fields = policy.fields || [];
      const partial: any = { ...p.doc } as any;
      const protectedObj: any = {};
      for (const f of fields) {
        protectedObj[f as string] = (p.doc as any)[f as string];
        delete partial[f as string];
      }
      const r = await encryptJsonAesGcm(protectedObj, {
        contentType: 'application/json',
        metadata: { mode: 'field', fields: fields.map(String) }
      });
      encrypted = new TextEncoder().encode(JSON.stringify({ ...partial, __mode: 'field', __blob: Array.from(r.encrypted) }));
      key = r.key;
    } else {
      if (!key) key = (await encryptJsonAesGcm({}, { contentType: 'application/json' })).key; // ensure key
      const r = await encryptJsonAesGcm(p.doc, { 
        key,
        contentType: 'application/json',
        metadata: { mode: 'document', collection: p.collection, id: p.id }
      });
      encrypted = r.encrypted;
    }
    await this.storage.update({ collection: p.collection, id: p.id, encryptedDoc: encrypted });
    if (key) this.docKeys.set(this.keyFor(p.collection, p.id), key);
  }

  async delete(p: { collection: string; id: string }): Promise<void> {
    await this.storage.delete({ collection: p.collection, id: p.id });
    this.docKeys.delete(this.keyFor(p.collection, p.id));
  }

  async query<T>(p: { collection: string; where?: any[]; orderBy?: any; limit?: number }): Promise<T[]> {
    const blobs = await this.storage.query({ collection: p.collection, filter: p.where, orderBy: p.orderBy, limit: p.limit });
    // Demo: try to decode as plaintext JSON; otherwise skip (need id->key mapping to decrypt)
    const out: T[] = [];
    for (const b of blobs) {
      try {
        const parsed = JSON.parse(new TextDecoder().decode(b));
        if (parsed && parsed.__mode === 'none') out.push(parsed.doc as T);
      } catch (_) {
        // ignore encrypted items here
      }
    }
    return out;
  }
}

