import { describe, it, expect } from 'vitest';
import { 
  generateKeyPair,
  generateDocumentKey,
  encryptDocument,
  decryptDocument,
  wrapKeyForMultipleRecipients,
  unwrapKeyWithPGP
} from '../src/crypto/openpgp';

describe('Multi-user document sharing', () => {
  it('should demonstrate complete sharing workflow', async () => {
    // Setup: Create users with keypairs
    const alice = await generateKeyPair('alice');
    const bob = await generateKeyPair('bob');
    const charlie = await generateKeyPair('charlie');
    
    // Alice creates a document and encrypts it
    const documentContent = {
      title: 'Shared Secret Document',
      content: 'This is confidential information that will be shared.',
      author: 'alice',
      timestamp: new Date().toISOString()
    };
    
    // Generate document key and encrypt the content
    const documentKey = await generateDocumentKey();
    const { encrypted, iv } = await encryptDocument(documentContent, documentKey);
    
    // Alice wants to share with Bob and Charlie
    const recipients = [
      { userId: 'bob', publicKeyArmored: bob.publicKeyArmored },
      { userId: 'charlie', publicKeyArmored: charlie.publicKeyArmored }
    ];
    
    // Wrap the document key for recipients
    const wrappedKeys = await wrapKeyForMultipleRecipients(documentKey, recipients);
    
    expect(wrappedKeys).toHaveLength(2);
    expect(wrappedKeys.map(w => w.userId).sort()).toEqual(['bob', 'charlie']);
    
    // Bob receives the document and unwraps the key
    const bobWrappedKey = wrappedKeys.find(w => w.userId === 'bob')!.wrappedKey;
    const bobDocumentKey = await unwrapKeyWithPGP(bobWrappedKey, bob.privateKeyArmored);
    const bobDecrypted = await decryptDocument(encrypted, iv, bobDocumentKey);
    
    expect(bobDecrypted).toEqual(documentContent);
    
    // Charlie receives the document and unwraps the key
    const charlieWrappedKey = wrappedKeys.find(w => w.userId === 'charlie')!.wrappedKey;
    const charlieDocumentKey = await unwrapKeyWithPGP(charlieWrappedKey, charlie.privateKeyArmored);
    const charlieDecrypted = await decryptDocument(encrypted, iv, charlieDocumentKey);
    
    expect(charlieDecrypted).toEqual(documentContent);
  });

  it('should handle collaborative editing scenario', async () => {
    // Setup users
    const alice = await generateKeyPair('alice');
    const bob = await generateKeyPair('bob');
    const charlie = await generateKeyPair('charlie');
    const david = await generateKeyPair('david');
    
    // Alice creates initial document
    let documentContent = {
      title: 'Collaborative Document',
      sections: ['Introduction by Alice'],
      lastEditor: 'alice',
      version: 1
    };
    
    const documentKey = await generateDocumentKey();
    let { encrypted, iv } = await encryptDocument(documentContent, documentKey);
    
    // Share with Bob initially
    let wrappedKeys = await wrapKeyForMultipleRecipients(documentKey, [
      { userId: 'bob', publicKeyArmored: bob.publicKeyArmored }
    ]);
    
    // Bob edits the document
    const bobDocumentKey = await unwrapKeyWithPGP(
      wrappedKeys.find(w => w.userId === 'bob')!.wrappedKey,
      bob.privateKeyArmored
    );
    
    let decrypted = await decryptDocument(encrypted, iv, bobDocumentKey);
    decrypted.sections.push('Added content by Bob');
    decrypted.lastEditor = 'bob';
    decrypted.version = 2;
    
    // Re-encrypt with same key
    ({ encrypted, iv } = await encryptDocument(decrypted, bobDocumentKey));
    
    // Bob shares with Charlie and David
    const newRecipients = [
      { userId: 'charlie', publicKeyArmored: charlie.publicKeyArmored },
      { userId: 'david', publicKeyArmored: david.publicKeyArmored }
    ];
    
    const newWrappedKeys = await wrapKeyForMultipleRecipients(bobDocumentKey, newRecipients);
    
    // Charlie edits
    const charlieDocumentKey = await unwrapKeyWithPGP(
      newWrappedKeys.find(w => w.userId === 'charlie')!.wrappedKey,
      charlie.privateKeyArmored
    );
    
    decrypted = await decryptDocument(encrypted, iv, charlieDocumentKey);
    decrypted.sections.push('Charlie\'s contribution');
    decrypted.lastEditor = 'charlie';
    decrypted.version = 3;
    
    ({ encrypted, iv } = await encryptDocument(decrypted, charlieDocumentKey));
    
    // Verify David can also access the latest version
    const davidDocumentKey = await unwrapKeyWithPGP(
      newWrappedKeys.find(w => w.userId === 'david')!.wrappedKey,
      david.privateKeyArmored
    );
    
    const davidDecrypted = await decryptDocument(encrypted, iv, davidDocumentKey);
    
    expect(davidDecrypted.sections).toEqual([
      'Introduction by Alice',
      'Added content by Bob',
      'Charlie\'s contribution'
    ]);
    expect(davidDecrypted.version).toBe(3);
    expect(davidDecrypted.lastEditor).toBe('charlie');
  });

  it('should handle key rotation scenario', async () => {
    // Setup users
    const alice = await generateKeyPair('alice');
    const bob = await generateKeyPair('bob');
    const charlie = await generateKeyPair('charlie');
    
    // Initial document
    const documentContent = {
      title: 'Document with Key Rotation',
      sensitive: true,
      data: 'Original sensitive data'
    };
    
    // Original key and encryption
    const originalKey = await generateDocumentKey();
    let { encrypted, iv } = await encryptDocument(documentContent, originalKey);
    
    // Share with Bob and Charlie
    const originalWrappedKeys = await wrapKeyForMultipleRecipients(originalKey, [
      { userId: 'bob', publicKeyArmored: bob.publicKeyArmored },
      { userId: 'charlie', publicKeyArmored: charlie.publicKeyArmored }
    ]);
    
    // Alice decides to rotate the key (e.g., after Charlie leaves the project)
    const newKey = await generateDocumentKey();
    
    // Decrypt with old key and re-encrypt with new key
    const decrypted = await decryptDocument(encrypted, iv, originalKey);
    ({ encrypted, iv } = await encryptDocument(decrypted, newKey));
    
    // Share new key only with Bob
    const newWrappedKeys = await wrapKeyForMultipleRecipients(newKey, [
      { userId: 'bob', publicKeyArmored: bob.publicKeyArmored }
    ]);
    
    // Bob can still access with new key
    const bobNewKey = await unwrapKeyWithPGP(
      newWrappedKeys.find(w => w.userId === 'bob')!.wrappedKey,
      bob.privateKeyArmored
    );
    
    const bobDecrypted = await decryptDocument(encrypted, iv, bobNewKey);
    expect(bobDecrypted).toEqual(documentContent);
    
    // Charlie's old key no longer works with the new encryption
    const charlieOldKey = await unwrapKeyWithPGP(
      originalWrappedKeys.find(w => w.userId === 'charlie')!.wrappedKey,
      charlie.privateKeyArmored
    );
    
    // This should fail because the document was re-encrypted with a different key
    await expect(decryptDocument(encrypted, iv, charlieOldKey)).rejects.toThrow();
  });
});