import { describe, it, expect } from 'vitest';
import { FilesAdapter } from '../src';

describe('adapters smoke', () => {
  it('FilesAdapter basic CRUD', async () => {
    const s = new FilesAdapter();
    const id = await s.create({ collection: 'c', encryptedDoc: new Uint8Array([1, 2, 3]) });
    const got = await s.get({ collection: 'c', id });
    expect(got).toBeInstanceOf(Uint8Array);
    await s.update({ collection: 'c', id, encryptedDoc: new Uint8Array([4, 5]) });
    const got2 = await s.get({ collection: 'c', id });
    expect(got2?.[0]).toBe(4);
    await s.delete({ collection: 'c', id });
    const got3 = await s.get({ collection: 'c', id });
    expect(got3).toBeNull();
  });
});

