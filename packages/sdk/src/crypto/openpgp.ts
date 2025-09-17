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

// Sign content with PGP
export async function signContentPGP(payload: string, privateKeyArmored: string) {
  const privateKey = await openpgp.readPrivateKey({ armoredKey: privateKeyArmored });
  const message = await openpgp.createMessage({ text: payload });
  const signature = await openpgp.sign({
    message,
    signingKeys: privateKey,
    detached: true
  });
  return signature;
}

// Verify content with PGP signature
export async function verifyContentPGP(payload: string, signature: string, publicKeyArmored: string) {
  try {
    const publicKey = await openpgp.readKey({ armoredKey: publicKeyArmored });
    const message = await openpgp.createMessage({ text: payload });
    const signatureObj = await openpgp.readSignature({ armoredSignature: signature });
    
    const verificationResult = await openpgp.verify({
      message,
      signature: signatureObj,
      verificationKeys: publicKey
    });

    const isValid = verificationResult.signatures.length > 0 && 
                    await verificationResult.signatures[0].verified;
    
    return {
      valid: isValid,
      keyID: verificationResult.signatures[0]?.keyID?.toHex(),
      signature: verificationResult.signatures[0]
    };
  } catch (error) {
    // If verification throws an error, it means the signature is invalid
    return {
      valid: false,
      keyID: undefined,
      signature: undefined
    };
  }
}

// Sign content with Ed25519 (direct)
export async function signContentEd25519(payload: string, privateKeyEd25519: Uint8Array) {
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  
  // Import Ed25519 private key for signing
  const key = await crypto.subtle.importKey(
    'raw',
    privateKeyEd25519,
    {
      name: 'Ed25519',
    },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('Ed25519', key, data);
  return {
    signature: new Uint8Array(signature),
    algorithm: 'ed25519'
  };
}

// Verify content with Ed25519 signature
export async function verifyContentEd25519(payload: string, signature: Uint8Array, publicKeyEd25519: Uint8Array) {
  const encoder = new TextEncoder();
  const data = encoder.encode(payload);
  
  // Import Ed25519 public key for verification
  const key = await crypto.subtle.importKey(
    'raw',
    publicKeyEd25519,
    {
      name: 'Ed25519',
    },
    false,
    ['verify']
  );
  
  const valid = await crypto.subtle.verify('Ed25519', key, signature, data);
  return { valid };
}

