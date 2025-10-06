import { describe, it, expect } from 'vitest';
import { encryptJsonAesGcm, decryptJsonAesGcm } from '../src/crypto/openpgp';

describe('crypto roundtrip', () => {
  it('AES-GCM JSON roundtrip', async () => {
    const input = { hello: 'world', n: 42 };
    const { encrypted, key } = await encryptJsonAesGcm(input);
    const out = await decryptJsonAesGcm(encrypted, key);
    expect(out).toEqual(input);
  });

  it('AES-GCM constant is used correctly', async () => {
    // This test verifies that the AES-GCM constant is working by ensuring
    // encryption/decryption still works after the refactoring
    const input = { test: 'constant refactoring', array: [1, 2, 3] };
    const { encrypted, key } = await encryptJsonAesGcm(input);
    
    // Verify the encrypted data is different from input
    expect(encrypted).not.toEqual(input);
    
    // Verify decryption works with the same key
    const output = await decryptJsonAesGcm(encrypted, key);
    expect(output).toEqual(input);
  });
});

