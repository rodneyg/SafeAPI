#!/usr/bin/env node

/**
 * Simple test script to verify UX modes work correctly
 */

async function testUXModes() {
  console.log('🔐 Testing SafeAPI UX Modes...\n');
  
  // Import the built SDK
  const { 
    UserManagedMode, 
    SharedResponsibilityMode, 
    DeveloperManagedMode, 
    APIManagedMode,
    FilesAdapter 
  } = await import('../dist/index.js');

  const storage = new FilesAdapter();

  // Test User-Managed Mode
  console.log('1. Testing User-Managed Mode...');
  const userMode = new UserManagedMode({
    storage,
    uxMode: 'user-managed',
    defaults: { encryption: 'document' }
  });

  const { keyPair: userKeys, backupNeeded } = await userMode.initialize();
  console.log(`✅ User-managed initialized. Backup needed: ${backupNeeded}`);
  
  const userDocId = await userMode.createDocument('test', { message: 'user-managed test' });
  const userDoc = await userMode.getDocument('test', userDocId);
  console.log(`✅ User-managed document: ${userDoc?.message}\n`);

  // Test Shared Responsibility Mode
  console.log('2. Testing Shared Responsibility Mode...');
  const sharedMode = new SharedResponsibilityMode({
    storage,
    uxMode: 'shared-responsibility'
    // No cloud config for test
  });

  const { keyPair: sharedKeys, recoveryEnabled } = await sharedMode.initialize('test-user', {
    passphrase: 'test-passphrase',
    enableRecovery: true
  });
  console.log(`✅ Shared responsibility initialized. Recovery: ${recoveryEnabled}`);
  
  const { id: sharedDocId } = await sharedMode.createDocument('medical', { 
    patientId: 'P123' 
  }, { auditEnabled: false });
  const sharedDoc = await sharedMode.getDocument('medical', sharedDocId);
  console.log(`✅ Shared responsibility document: Patient ${sharedDoc?.patientId}\n`);

  // Test Developer-Managed Mode
  console.log('3. Testing Developer-Managed Mode...');
  const devMode = new DeveloperManagedMode({
    storage,
    uxMode: 'developer-managed'
    // No cloud config for test
  });

  const { ready, features } = await devMode.initialize('dev-user');
  console.log(`✅ Developer-managed ready: ${ready}, Features: ${JSON.stringify(features)}`);
  
  const { id: devDocId } = await devMode.save('users', { name: 'Test User' });
  const devDoc = await devMode.load('users', devDocId);
  console.log(`✅ Developer-managed document: ${devDoc?.name}\n`);

  // Test API-Managed Mode
  console.log('4. Testing API-Managed Mode...');
  const apiMode = new APIManagedMode({
    storage,
    uxMode: 'api-managed'
    // No cloud config for test - will use fallback
  });

  const { ready: apiReady } = await apiMode.initialize('api-user');
  console.log(`✅ API-managed ready: ${apiReady} (local fallback)`);
  
  const { id: apiDocId, encrypted } = await apiMode.store('customers', { 
    name: 'Alice Test' 
  });
  const apiDoc = await apiMode.retrieve('customers', apiDocId);
  console.log(`✅ API-managed document: ${apiDoc?.name}, Encrypted: ${encrypted}\n`);

  console.log('🎉 All UX modes tested successfully!');
  console.log('\nNext steps:');
  console.log('• Configure cloud endpoints for full feature testing');
  console.log('• Run individual mode examples with: npm run demo:ux-modes');
  console.log('• See UX_MODES_GUIDE.md for detailed implementation guide');
}

testUXModes().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});