// OpenPGP + AES-GCM helpers for SafeAPI
// - AES-GCM for document encryption (fast, symmetric)
// - OpenPGP for keypair and wrapping doc keys for sharing

import * as openpgp from 'openpgp';

export async function generateKeyPair(userId = 'user') {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: 'ed25519',
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

/**
 * Wraps an AES-GCM document encryption key using OpenPGP for secure sharing in the re-encryption broker.
 * 
 * This function is a core component of SafeAPI's secure document sharing system. It encrypts
 * an AES-GCM key (used for document encryption) with a recipient's PGP public key, enabling
 * secure key distribution without exposing the plaintext key material. The wrapped key can
 * only be unwrapped by the intended recipient using their corresponding private key.
 * 
 * **Security Notes:**
 * - The original AES key remains secure and is never transmitted in plaintext
 * - Uses OpenPGP asymmetric encryption with Ed25519/Curve25519 key pairs
 * - Suitable for Firebase-based backend services handling sensitive document keys
 * - Part of the re-encryption broker pattern for secure multi-party document access
 * 
 * @param aesKey - The AES-GCM CryptoKey (256-bit) used for document encryption.
 *                 Must be extractable and support encrypt/decrypt operations.
 * @param recipientPublicKeyArmored - The recipient's PGP public key in ASCII-armored format.
 *                                   Should be a valid Ed25519 public key string.
 * 
 * @returns Promise<string> - The wrapped key as an ASCII-armored PGP message string.
 *                           This can be safely stored or transmitted and later unwrapped
 *                           by the recipient using their private key.
 * 
 * @throws {Error} When the AES key cannot be exported (e.g., not extractable)
 * @throws {Error} When the recipient public key is invalid or cannot be parsed
 * @throws {Error} When OpenPGP encryption fails
 * 
 * @example
 * ```typescript
 * // Generate a document encryption key
 * const { encrypted, key } = await encryptJsonAesGcm({ sensitive: "data" });
 * 
 * // Wrap the key for sharing with a recipient
 * const recipientPubKey = "-----BEGIN PGP PUBLIC KEY BLOCK-----...";
 * const wrappedKey = await wrapKeyWithPGP(key, recipientPubKey);
 * 
 * // Store wrapped key in Firebase for recipient access
 * await firestore.collection('wrapped_keys').add({
 *   recipient: recipientUserId,
 *   documentId: docId,
 *   wrappedKey: wrappedKey,
 *   timestamp: Date.now()
 * });
 * ```
 * 
 * @example
 * ```typescript
 * // Re-encryption broker usage pattern
 * async function grantDocumentAccess(docId: string, recipientId: string) {
 *   // Retrieve document's AES key (from secure storage)
 *   const documentKey = await getDocumentKey(docId);
 *   
 *   // Get recipient's public key
 *   const recipientKey = await getUserPublicKey(recipientId);
 *   
 *   // Wrap key for secure sharing
 *   const wrapped = await wrapKeyWithPGP(documentKey, recipientKey);
 *   
 *   // Store in key broker for recipient access
 *   await storeWrappedKey(docId, recipientId, wrapped);
 * }
 * ```
 */
export async function wrapKeyWithPGP(aesKey: CryptoKey, recipientPublicKeyArmored: string) {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', aesKey));
  const publicKey = await openpgp.readKey({ armoredKey: recipientPublicKeyArmored });
  const message = await openpgp.createMessage({ binary: raw });
  const encrypted = await openpgp.encrypt({ message, encryptionKeys: publicKey });
  return encrypted; // armored
}

export async function unwrapKeyWithPGP(wrappedArmored: string, privateKeyArmored: string) {
  const privateKey = await openpgp.readPrivateKey({ armoredKey: privateKeyArmored });
  const message = await openpgp.readMessage({ armoredMessage: wrappedArmored });
  const { data } = await openpgp.decrypt({ message, decryptionKeys: privateKey });
  const raw = typeof data === 'string' ? new Uint8Array(Buffer.from(data)) : new Uint8Array(data);
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  return key;
}

