// OpenPGP + AES-GCM helpers for SafeAPI
// - AES-GCM for document encryption (fast, symmetric)
// - OpenPGP for keypair and wrapping doc keys for sharing

import * as openpgp from 'openpgp';

export async function generateKeyPair(userId = 'user') {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: 'ecc',
    curve: 'curve25519',
    userIDs: [{ name: userId }],
  });
  return { publicKeyArmored: publicKey, privateKeyArmored: privateKey };
}

// AES-GCM JSON encrypt/decrypt (UTF-8 JSON)
export async function encryptJsonAesGcm(obj: any, key?: CryptoKey) {
  const data = new TextEncoder().encode(JSON.stringify(obj));
  const k = key || (await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, data));
  // Serialize: [version(1), iv(12), ciphertext]
  const out = new Uint8Array(1 + 12 + cipher.length);
  out[0] = 1; // version
  out.set(iv, 1);
  out.set(cipher, 13);
  return { encrypted: out, key: k, iv };
}

export async function decryptJsonAesGcm(encrypted: Uint8Array, key: CryptoKey) {
  if (encrypted[0] !== 1) throw new Error('Unsupported version');
  const iv = encrypted.slice(1, 13);
  const cipher = encrypted.slice(13);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  return JSON.parse(new TextDecoder().decode(plain));
}

// Wrap/unwrap AES key using recipient PGP
export async function wrapKeyWithPGP(aesKey: CryptoKey, recipientPublicKeyArmored: string) {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', aesKey));
  const publicKey = await openpgp.readKey({ armoredKey: recipientPublicKeyArmored });
  const message = await openpgp.createMessage({ binary: raw });
  const encrypted = await openpgp.encrypt({ 
    message, 
    encryptionKeys: publicKey,
    format: 'armored'
  });
  return encrypted; // armored
}

export async function unwrapKeyWithPGP(wrappedArmored: string, privateKeyArmored: string) {
  const privateKey = await openpgp.readPrivateKey({ armoredKey: privateKeyArmored });
  const message = await openpgp.readMessage({ armoredMessage: wrappedArmored });
  const { data } = await openpgp.decrypt({ 
    message, 
    decryptionKeys: privateKey,
    format: 'binary'
  });
  
  // With format: 'binary', data should be Uint8Array
  let raw: Uint8Array;
  if (data instanceof Uint8Array) {
    raw = data;
  } else {
    throw new Error(`Expected Uint8Array but got ${typeof data}`);
  }
  
  // Validate key length for AES-GCM (must be 16, 24, or 32 bytes)
  if (raw.length !== 32 && raw.length !== 24 && raw.length !== 16) {
    throw new Error(`Invalid AES key length: ${raw.length} bytes. Expected 16, 24, or 32 bytes.`);
  }
  
  const key = await crypto.subtle.importKey('raw', raw as BufferSource, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  return key;
}

// Enhanced key wrapping methods for multi-user sharing
export async function wrapKeyForMultipleRecipients(
  aesKey: CryptoKey, 
  recipients: Array<{ userId: string; publicKeyArmored: string }>
): Promise<Array<{ userId: string; wrappedKey: string }>> {
  const wrappedKeys = await Promise.all(
    recipients.map(async (recipient) => ({
      userId: recipient.userId,
      wrappedKey: await wrapKeyWithPGP(aesKey, recipient.publicKeyArmored) as string
    }))
  );
  return wrappedKeys;
}

// Re-wrap an existing wrapped key for new recipients
export async function reWrapKey(
  originalWrappedKey: string,
  originalPrivateKey: string,
  newRecipients: Array<{ userId: string; publicKeyArmored: string }>
): Promise<Array<{ userId: string; wrappedKey: string }>> {
  // First unwrap the original key
  const aesKey = await unwrapKeyWithPGP(originalWrappedKey, originalPrivateKey);
  
  // Then wrap it for the new recipients
  return await wrapKeyForMultipleRecipients(aesKey, newRecipients);
}

// Generate a new AES key for documents
export async function generateDocumentKey(): Promise<CryptoKey> {
  return await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

// Encrypt document data with AES-GCM
export async function encryptDocument(data: any, key: CryptoKey): Promise<{ encrypted: Uint8Array; iv: Uint8Array }> {
  const jsonData = new TextEncoder().encode(JSON.stringify(data));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, jsonData as BufferSource));
  return { encrypted, iv };
}

// Decrypt document data with AES-GCM
export async function decryptDocument(encrypted: Uint8Array, iv: Uint8Array, key: CryptoKey): Promise<any> {
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource }, key, encrypted as BufferSource);
  return JSON.parse(new TextDecoder().decode(decrypted));
}

