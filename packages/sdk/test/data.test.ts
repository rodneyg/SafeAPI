import { describe, it, expect } from 'vitest';
import { SafeAPI, FilesAdapter } from '../src';

describe('data create/get/query (FilesAdapter)', () => {
  it('creates and reads back a document', async () => {
    const api = new SafeAPI({ storage: new FilesAdapter(), defaults: { encryption: 'document' } });
    await api.init();
    const id = await api.data.create({ collection: 'notes', doc: { a: 1 } });
    const got = await api.data.get<{ a: number }>({ collection: 'notes', id });
    expect(got).toEqual({ a: 1 });
  });

  it('query returns plaintext-only docs (demo behavior)', async () => {
    const api = new SafeAPI({ storage: new FilesAdapter(), defaults: { encryption: 'none' } });
    await api.init();
    await api.data.create({ collection: 'items', doc: { x: true } });
    const rows = await api.data.query<{ x: boolean }>({ collection: 'items' });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].x).toBe(true);
  });
});

