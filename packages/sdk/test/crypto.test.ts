import { describe, it, expect } from 'vitest';
import { encryptJsonAesGcm, decryptJsonAesGcm } from '../src/crypto/openpgp';
import type { EncryptionOptions } from '../src/types';

describe('crypto roundtrip', () => {
  it('AES-GCM JSON roundtrip', async () => {
    const input = { hello: 'world', n: 42 };
    const { encrypted, key } = await encryptJsonAesGcm(input);
    const out = await decryptJsonAesGcm(encrypted, key);
    expect(out).toEqual(input);
  });

  it('AES-GCM with EncryptionOptions interface', async () => {
    const input = { data: 'test', value: 123 };
    const options: EncryptionOptions = {
      contentType: 'application/json',
      metadata: { version: '1.0', purpose: 'test' }
    };
    
    const result = await encryptJsonAesGcm(input, options);
    
    expect(result.contentType).toBe('application/json');
    expect(result.metadata).toEqual({ version: '1.0', purpose: 'test' });
    expect(result.encrypted).toBeInstanceOf(Uint8Array);
    expect(result.key).toBeInstanceOf(CryptoKey);
    expect(result.iv).toBeInstanceOf(Uint8Array);
    
    const decrypted = await decryptJsonAesGcm(result.encrypted, result.key);
    expect(decrypted).toEqual(input);
  });

  it('AES-GCM with custom algorithm and key length', async () => {
    const input = { test: 'data' };
    const options: EncryptionOptions = {
      algorithm: 'AES-GCM',
      keyLength: 256,
      contentType: 'application/json',
      metadata: { custom: true }
    };
    
    const result = await encryptJsonAesGcm(input, options);
    expect(result.contentType).toBe('application/json');
    expect(result.metadata?.custom).toBe(true);
    
    const decrypted = await decryptJsonAesGcm(result.encrypted, result.key);
    expect(decrypted).toEqual(input);
  });

  it('AES-GCM with pre-existing key', async () => {
    const input = { reuse: 'key' };
    
    // Generate a key first
    const key = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 }, 
      true, 
      ['encrypt', 'decrypt']
    );
    
    const options: EncryptionOptions = {
      key,
      contentType: 'application/json',
      metadata: { keyReused: true }
    };
    
    const result = await encryptJsonAesGcm(input, options);
    expect(result.key).toBe(key); // Should be the same key instance
    expect(result.contentType).toBe('application/json');
    expect(result.metadata?.keyReused).toBe(true);
    
    const decrypted = await decryptJsonAesGcm(result.encrypted, result.key);
    expect(decrypted).toEqual(input);
  });
});

