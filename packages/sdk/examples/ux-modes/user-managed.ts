/**
 * User-Managed Mode Example
 * 
 * This example demonstrates how to use SafeAPI in user-managed mode,
 * where users have full control over key generation, backup, and recovery.
 */

import { UserManagedMode, FilesAdapter } from '../../src/index';

async function userManagedExample() {
  console.log('=== SafeAPI User-Managed Mode Example ===\n');

  // Initialize with user-managed mode
  const storage = new FilesAdapter();
  const safeAPI = new UserManagedMode({
    storage,
    uxMode: 'user-managed',
    defaults: { encryption: 'document' }
  });

  console.log('1. Initializing user-managed mode...');
  const { keyPair, backupNeeded } = await safeAPI.initialize();
  console.log(`✓ Keys generated. Public key: ${keyPair.publicKeyArmored.substring(0, 50)}...`);
  console.log(`✓ Backup needed: ${backupNeeded}\n`);

  // User generates their own keys
  console.log('2. Generating new keys...');
  const newKeyPair = await safeAPI.generateKeys({ backupMethod: 'file' });
  console.log(`✓ New keys generated. Public key: ${newKeyPair.publicKeyArmored.substring(0, 50)}...\n`);

  // User backs up their keys with a passphrase
  console.log('3. Backing up keys with passphrase...');
  const passphrase = 'my-super-secure-passphrase-123';
  const backupResult = await safeAPI.backupKeys({
    method: 'phrase',
    passphrase,
    metadata: { userNote: 'Primary key backup' }
  });
  
  if (backupResult.success) {
    console.log('✓ Keys backed up successfully');
    console.log(`✓ Instructions: ${backupResult.instructions}`);
    console.log(`✓ Backup data size: ${JSON.stringify(backupResult.backupData).length} bytes\n`);
  }

  // User creates encrypted documents
  console.log('4. Creating encrypted documents...');
  const docId1 = await safeAPI.createDocument('notes', {
    title: 'Personal Note',
    content: 'This is my private note',
    createdAt: Date.now()
  });
  console.log(`✓ Document created with ID: ${docId1}`);

  const docId2 = await safeAPI.createDocument('passwords', {
    service: 'example.com',
    username: 'user@example.com',
    password: 'super-secret-password'
  }, { encryption: 'document' });
  console.log(`✓ Password document created with ID: ${docId2}\n`);

  // User retrieves their documents
  console.log('5. Retrieving documents...');
  const note = await safeAPI.getDocument('notes', docId1);
  console.log(`✓ Retrieved note: ${note?.title}`);
  
  const passwordDoc = await safeAPI.getDocument<{service: string, username: string, password: string}>('passwords', docId2);
  console.log(`✓ Retrieved password for: ${passwordDoc?.service}\n`);

  // User exports their keys for manual backup
  console.log('6. Exporting keys for manual backup...');
  const exportedKeys = await safeAPI.exportKeys('json');
  console.log('✓ Keys exported (showing first 100 chars):');
  console.log(exportedKeys.substring(0, 100) + '...\n');

  // Simulate key recovery scenario
  console.log('7. Simulating key recovery...');
  const recoveryResult = await safeAPI.restoreKeys({
    method: 'phrase',
    passphrase,
    backupData: backupResult.backupData
  });
  
  if (recoveryResult.success) {
    console.log('✓ Keys recovered successfully');
    console.log(`✓ Message: ${recoveryResult.message}`);
    
    // Verify we can still access documents after recovery
    const verifyDoc = await safeAPI.getDocument('notes', docId1);
    console.log(`✓ Document accessible after recovery: ${verifyDoc?.title}\n`);
  }

  // User queries their documents
  console.log('8. Querying documents...');
  const allNotes = await safeAPI.queryDocuments('notes', { limit: 10 });
  console.log(`✓ Found ${allNotes.length} notes\n`);

  console.log('=== User-Managed Mode Example Complete ===');
  console.log('\nKey benefits of User-Managed Mode:');
  console.log('• Full control over key generation and storage');
  console.log('• User responsible for backup and recovery');
  console.log('• Maximum security and privacy');
  console.log('• No dependency on cloud services for basic operations');
  console.log('• Suitable for privacy-conscious users and sensitive data');
}

// Run the example
if (require.main === module) {
  userManagedExample().catch(console.error);
}

export { userManagedExample };