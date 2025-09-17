import { describe, it, expect } from 'vitest';
import { signContentPGP, verifyContentPGP, generateKeyPair } from '../src/crypto/openpgp';

describe('SafeAPI v0.2 - Sign/Verify functionality', () => {
  it('can sign and verify content with PGP', async () => {
    const keyPair = await generateKeyPair('test_user');
    const payload = 'Hello, SafeAPI v0.2!';
    
    const signature = await signContentPGP(payload, keyPair.privateKeyArmored);
    expect(signature).toBeTruthy();
    
    const verification = await verifyContentPGP(payload, signature, keyPair.publicKeyArmored);
    expect(verification.valid).toBe(true);
  });

  it('fails verification with wrong content', async () => {
    const keyPair = await generateKeyPair('test_user');
    const payload = 'Original message';
    const tamperedPayload = 'Tampered message';
    
    const signature = await signContentPGP(payload, keyPair.privateKeyArmored);
    const verification = await verifyContentPGP(tamperedPayload, signature, keyPair.publicKeyArmored);
    
    expect(verification.valid).toBe(false);
  });
});

describe('SafeAPI v0.2 - AES-GCM encryption (Seal)', () => {
  it('can encrypt and decrypt JSON payloads', async () => {
    const { encryptJsonAesGcm, decryptJsonAesGcm } = await import('../src/crypto/openpgp');
    
    const payload = { message: 'This is a test', timestamp: Date.now() };
    const { encrypted, key } = await encryptJsonAesGcm(payload);
    const decrypted = await decryptJsonAesGcm(encrypted, key);
    
    expect(decrypted).toEqual(payload);
  });
});