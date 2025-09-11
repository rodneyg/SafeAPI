import { describe, it, expect } from 'vitest';
import { encryptJsonAesGcm, decryptJsonAesGcm } from '../src/crypto/openpgp';

describe('crypto roundtrip', () => {
  it('AES-GCM JSON roundtrip', async () => {
    const input = { hello: 'world', n: 42 };
    const { encrypted, key } = await encryptJsonAesGcm(input);
    const out = await decryptJsonAesGcm(encrypted, key);
    expect(out).toEqual(input);
  });
});

