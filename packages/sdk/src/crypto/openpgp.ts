// OpenPGP + AES-GCM helpers for SafeAPI
// - AES-GCM for document encryption (fast, symmetric)
// - OpenPGP for keypair and wrapping doc keys for sharing

import * as openpgp from 'openpgp';

export async function generateKeyPair(userId = 'user') {
  const { privateKey, publicKey } = await openpgp.generateKey({
    type: 'ecc',
    curve: 'ed25519',
    userIDs: [{ name: userId }],
  });
  return { publicKeyArmored: publicKey, privateKeyArmored: privateKey };
}

export async function signBytes(data: Uint8Array, privateKeyArmored: string, passphrase?: string): Promise<string> {
  const privateKey = await openpgp.readPrivateKey({ armoredKey: privateKeyArmored });
  const signingKey = passphrase
    ? await openpgp.decryptKey({ privateKey, passphrase })
    : privateKey;
  const message = await openpgp.createMessage({ binary: data });
  return await openpgp.sign({ message, signingKeys: signingKey, format: 'armored' }) as string;
}

export async function verifyBytes(data: Uint8Array, signature: string, publicKeyArmored: string): Promise<boolean> {
  const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
  try {
    const signedMessage = await openpgp.readMessage({ armoredMessage: signature });
    const verification = await openpgp.verify({ message: signedMessage, verificationKeys: publicKey });
    const signatureResult = verification.signatures[0];
    if (!signatureResult) return false;
    const literalData = signedMessage.getLiteralData();
    if (!literalData) return false;
    const signedBytes = new Uint8Array(literalData as Uint8Array);
    if (signedBytes.length !== data.length || signedBytes.some((value, index) => value !== data[index])) return false;
    await signatureResult.verified;
    return true;
  } catch {
    return false;
  }
}

export async function encryptBytesAesGcm(data: Uint8Array, key?: CryptoKey) {
  const cryptoKey = key || await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const input = Uint8Array.from(data);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, input));
  return { ciphertext, key: cryptoKey, iv };
}

export async function decryptBytesAesGcm(ciphertext: Uint8Array, key: CryptoKey, iv: Uint8Array) {
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Uint8Array.from(iv) }, key, Uint8Array.from(ciphertext)));
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
  const encrypted = await openpgp.encrypt({ message, encryptionKeys: publicKey, format: 'armored' });
  return encrypted as string; // armored
}

export async function unwrapKeyWithPGP(wrappedArmored: string, privateKeyArmored: string) {
  const privateKey = await openpgp.readPrivateKey({ armoredKey: privateKeyArmored });
  const message = await openpgp.readMessage({ armoredMessage: wrappedArmored });
  const { data } = await openpgp.decrypt({ message, decryptionKeys: privateKey, format: 'binary' });
  const rawBytes = data as Uint8Array;
  if (![16, 24, 32].includes(rawBytes.byteLength)) {
    throw new Error(`Invalid AES key length: ${rawBytes.byteLength} bytes`);
  }
  const raw = new ArrayBuffer(rawBytes.byteLength);
  new Uint8Array(raw).set(rawBytes);
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  return key;
}

/** Wrap one document key for each recipient. The server only receives armored ciphertext. */
export async function wrapKeyForRecipients(
  aesKey: CryptoKey,
  recipients: Array<{ userId: string; publicKeyArmored: string }>,
): Promise<Array<{ userId: string; wrappedKey: string }>> {
  return Promise.all(recipients.map(async ({ userId, publicKeyArmored }) => ({
    userId,
    wrappedKey: await wrapKeyWithPGP(aesKey, publicKeyArmored),
  })));
}

/** Re-wrap a recipient-held key for additional users without exposing it to the broker. */
export async function reWrapKeyForRecipients(
  existingWrappedKey: string,
  currentRecipientPrivateKeyArmored: string,
  recipients: Array<{ userId: string; publicKeyArmored: string }>,
): Promise<Array<{ userId: string; wrappedKey: string }>> {
  const aesKey = await unwrapKeyWithPGP(existingWrappedKey, currentRecipientPrivateKeyArmored);
  return wrapKeyForRecipients(aesKey, recipients);
}


// Public SDK names for sharing an AES document key with another user's OpenPGP key.
export const keyWrap = wrapKeyWithPGP;
export const keyUnwrap = unwrapKeyWithPGP;
