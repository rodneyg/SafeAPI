import { describe, it, expect } from 'vitest';
import { 
  encryptJsonAesGcm, 
  decryptJsonAesGcm,
  generateKeyPair,
  wrapKeyWithPGP,
  unwrapKeyWithPGP,
  wrapKeyForMultipleRecipients,
  reWrapKey,
  generateDocumentKey,
  encryptDocument,
  decryptDocument
} from '../src/crypto/openpgp';

describe('crypto roundtrip', () => {
  it('AES-GCM JSON roundtrip', async () => {
    const input = { hello: 'world', n: 42 };
    const { encrypted, key } = await encryptJsonAesGcm(input);
    const out = await decryptJsonAesGcm(encrypted, key);
    expect(out).toEqual(input);
  });

  it('OpenPGP key wrapping roundtrip', async () => {
    // Generate recipient keypair
    const recipient = await generateKeyPair('recipient');
    
    // Generate AES key to wrap
    const aesKey = await generateDocumentKey();
    
    // Wrap the key
    const wrappedKey = await wrapKeyWithPGP(aesKey, recipient.publicKeyArmored);
    
    // Unwrap the key
    const unwrappedKey = await unwrapKeyWithPGP(wrappedKey, recipient.privateKeyArmored);
    
    // Test that the keys are equivalent by encrypting/decrypting
    const testData = { test: 'data', value: 123 };
    const { encrypted, iv } = await encryptDocument(testData, aesKey);
    const decrypted = await decryptDocument(encrypted, iv, unwrappedKey);
    
    expect(decrypted).toEqual(testData);
  });

  it('multi-recipient key wrapping', async () => {
    // Generate multiple recipient keypairs
    const alice = await generateKeyPair('alice');
    const bob = await generateKeyPair('bob');
    const charlie = await generateKeyPair('charlie');
    
    const recipients = [
      { userId: 'alice', publicKeyArmored: alice.publicKeyArmored },
      { userId: 'bob', publicKeyArmored: bob.publicKeyArmored },
      { userId: 'charlie', publicKeyArmored: charlie.publicKeyArmored }
    ];
    
    // Generate and wrap key for all recipients
    const aesKey = await generateDocumentKey();
    const wrappedKeys = await wrapKeyForMultipleRecipients(aesKey, recipients);
    
    expect(wrappedKeys).toHaveLength(3);
    expect(wrappedKeys.map(w => w.userId)).toEqual(['alice', 'bob', 'charlie']);
    
    // Verify each recipient can unwrap the key
    const testData = { shared: 'document', content: 'secret' };
    const { encrypted, iv } = await encryptDocument(testData, aesKey);
    
    // Alice unwraps and decrypts
    const aliceKey = await unwrapKeyWithPGP(
      wrappedKeys.find(w => w.userId === 'alice')!.wrappedKey,
      alice.privateKeyArmored
    );
    const aliceDecrypted = await decryptDocument(encrypted, iv, aliceKey);
    expect(aliceDecrypted).toEqual(testData);
    
    // Bob unwraps and decrypts
    const bobKey = await unwrapKeyWithPGP(
      wrappedKeys.find(w => w.userId === 'bob')!.wrappedKey,
      bob.privateKeyArmored
    );
    const bobDecrypted = await decryptDocument(encrypted, iv, bobKey);
    expect(bobDecrypted).toEqual(testData);
  });

  it('key re-wrapping for sharing workflow', async () => {
    // Original owner
    const owner = await generateKeyPair('owner');
    
    // Initial recipients
    const alice = await generateKeyPair('alice');
    const bob = await generateKeyPair('bob');
    
    // New recipients to add later
    const charlie = await generateKeyPair('charlie');
    const dave = await generateKeyPair('dave');
    
    // Create and wrap key for initial recipients
    const aesKey = await generateDocumentKey();
    const initialWrapped = await wrapKeyForMultipleRecipients(aesKey, [
      { userId: 'alice', publicKeyArmored: alice.publicKeyArmored },
      { userId: 'bob', publicKeyArmored: bob.publicKeyArmored }
    ]);
    
    // Re-wrap key for new recipients using Alice's wrapped key
    const aliceWrappedKey = initialWrapped.find(w => w.userId === 'alice')!.wrappedKey;
    const newWrapped = await reWrapKey(
      aliceWrappedKey,
      alice.privateKeyArmored,
      [
        { userId: 'charlie', publicKeyArmored: charlie.publicKeyArmored },
        { userId: 'dave', publicKeyArmored: dave.publicKeyArmored }
      ]
    );
    
    expect(newWrapped).toHaveLength(2);
    
    // Verify all recipients can access the same data
    const testData = { document: 'shared content', version: 2 };
    const { encrypted, iv } = await encryptDocument(testData, aesKey);
    
    // Charlie can decrypt
    const charlieKey = await unwrapKeyWithPGP(
      newWrapped.find(w => w.userId === 'charlie')!.wrappedKey,
      charlie.privateKeyArmored
    );
    const charlieDecrypted = await decryptDocument(encrypted, iv, charlieKey);
    expect(charlieDecrypted).toEqual(testData);
    
    // Dave can decrypt
    const daveKey = await unwrapKeyWithPGP(
      newWrapped.find(w => w.userId === 'dave')!.wrappedKey,
      dave.privateKeyArmored
    );
    const daveDecrypted = await decryptDocument(encrypted, iv, daveKey);
    expect(daveDecrypted).toEqual(testData);
    
    // Original recipients still work
    const bobKey = await unwrapKeyWithPGP(
      initialWrapped.find(w => w.userId === 'bob')!.wrappedKey,
      bob.privateKeyArmored
    );
    const bobDecrypted = await decryptDocument(encrypted, iv, bobKey);
    expect(bobDecrypted).toEqual(testData);
  });
});

