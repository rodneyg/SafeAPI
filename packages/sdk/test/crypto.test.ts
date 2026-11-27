import { describe, it, expect } from 'vitest';
import { decryptJsonAesGcm, encryptJsonAesGcm, generateKeyPair, keyUnwrap, keyWrap } from '../src/crypto/openpgp';

describe('crypto roundtrip', () => {
  it('wraps an AES-GCM key for a recipient and unwraps it in a browser-safe binary format', async () => {
    const recipient = await generateKeyPair('recipient');
    const { key, encrypted } = await encryptJsonAesGcm({ shared: 'secret' });
    const wrapped = await keyWrap(key, recipient.publicKeyArmored);
    const unwrapped = await keyUnwrap(wrapped, recipient.privateKeyArmored);

    await expect(decryptJsonAesGcm(encrypted, unwrapped)).resolves.toEqual({ shared: 'secret' });
  });

  it('AES-GCM JSON roundtrip', async () => {
    const input = { hello: 'world', n: 42 };
    const { encrypted, key } = await encryptJsonAesGcm(input);
    const out = await decryptJsonAesGcm(encrypted, key);
    expect(out).toEqual(input);
  });
});

