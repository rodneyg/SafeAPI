import { describe, it, expect } from 'vitest';
import { decryptBytesAesGcm, decryptJsonAesGcm, encryptBytesAesGcm, encryptJsonAesGcm, generateKeyPair, keyUnwrap, keyWrap, reWrapKeyForRecipients, signBytes, verifyBytes, wrapKeyForRecipients } from '../src/crypto/openpgp';

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

  it('wraps keys for multiple recipients and lets a recipient re-wrap for another user', async () => {
    const alice = await generateKeyPair('alice');
    const bob = await generateKeyPair('bob');
    const charlie = await generateKeyPair('charlie');
    const { key, encrypted } = await encryptJsonAesGcm({ shared: 'secret' });

    const initial = await wrapKeyForRecipients(key, [
      { userId: 'bob', publicKeyArmored: bob.publicKeyArmored },
    ]);
    expect(initial).toHaveLength(1);
    const rewrapped = await reWrapKeyForRecipients(
      initial[0].wrappedKey,
      bob.privateKeyArmored,
      [{ userId: 'charlie', publicKeyArmored: charlie.publicKeyArmored }],
    );
    const charlieKey = await keyUnwrap(rewrapped[0].wrappedKey, charlie.privateKeyArmored);
    await expect(decryptJsonAesGcm(encrypted, charlieKey)).resolves.toEqual({ shared: 'secret' });

    await expect(keyUnwrap(initial[0].wrappedKey, alice.privateKeyArmored)).rejects.toThrow();
  });

  it('AES-GCM byte roundtrip preserves exact bytes', async () => {
    const input = new Uint8Array([0, 1, 2, 255]);
    const { ciphertext, key, iv } = await encryptBytesAesGcm(input);
    expect(await decryptBytesAesGcm(ciphertext, key, iv)).toEqual(input);
  });

  it('signs and verifies exact bytes with an OpenPGP key', async () => {
    const keys = await generateKeyPair('test signer');
    const payload = new TextEncoder().encode('exact payload');
    const signature = await signBytes(payload, keys.privateKeyArmored);
    await expect(verifyBytes(payload, signature, keys.publicKeyArmored)).resolves.toBe(true);
    await expect(verifyBytes(new TextEncoder().encode('changed'), signature, keys.publicKeyArmored)).resolves.toBe(false);
    const decoded = Buffer.from(signature, 'utf8');
    decoded[Math.floor(decoded.length / 2)] ^= 1;
    const corrupted = decoded.toString('utf8');
    await expect(verifyBytes(payload, corrupted, keys.publicKeyArmored)).resolves.toBe(false);
  });
});

