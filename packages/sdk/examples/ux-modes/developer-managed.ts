/**
 * Developer-Managed Mode Example
 * 
 * This example demonstrates how to use SafeAPI in developer-managed mode,
 * where the SDK handles most crypto operations behind the scenes.
 */

import { DeveloperManagedMode, FilesAdapter } from '../../src/index';

async function developerManagedExample() {
  console.log('=== SafeAPI Developer-Managed Mode Example ===\n');

  // Initialize with developer-managed mode and configuration
  const storage = new FilesAdapter();
  const safeAPI = new DeveloperManagedMode(
    {
      storage,
      uxMode: 'developer-managed',
      cloud: {
        endpoint: 'http://localhost:5001/api', // Use emulator for demo
        apiKey: 'demo-api-key',
        projectId: 'demo-project'
      },
      defaults: { encryption: 'document', audit: true }
    },
    {
      autoEscrow: true,
      backgroundSync: true
    }
  );

  const userId = 'dev-user-456';

  console.log('1. Initializing developer-managed mode...');
  try {
    const { ready, keyPair, features } = await safeAPI.initialize(userId);
    
    console.log(`✓ System ready: ${ready}`);
    console.log(`✓ Keys auto-generated: ${keyPair.publicKeyArmored.substring(0, 50)}...`);
    console.log('✓ Available features:');
    console.log(`  - Sharing: ${features.sharing}`);
    console.log(`  - Audit: ${features.audit}`);
    console.log(`  - Auto-escrow: ${features.escrow}\n`);
  } catch (error) {
    console.log('⚠ Cloud features not available, using local mode only\n');
  }

  // Simple document operations - crypto is handled transparently
  console.log('2. Saving documents (encryption automatic)...');
  const saveResult1 = await safeAPI.save('user-profiles', {
    userId: userId,
    name: 'John Developer',
    email: 'john@example.com',
    preferences: {
      theme: 'dark',
      notifications: true,
      language: 'en'
    },
    createdAt: Date.now()
  });
  console.log(`✓ User profile saved with ID: ${saveResult1.id}`);

  const saveResult2 = await safeAPI.save('app-settings', {
    appVersion: '1.2.3',
    features: ['encryption', 'sharing', 'audit'],
    apiEndpoints: {
      auth: '/v1/auth',
      data: '/v1/data',
      sharing: '/v1/sharing'
    },
    lastUpdated: Date.now()
  });
  console.log(`✓ App settings saved with ID: ${saveResult2.id}\n`);

  // Load documents - decryption is automatic
  console.log('3. Loading documents (decryption automatic)...');
  const userProfile = await safeAPI.load('user-profiles', saveResult1.id);
  console.log(`✓ Loaded profile for: ${userProfile?.name}`);

  const appSettings = await safeAPI.load('app-settings', saveResult2.id);
  console.log(`✓ Loaded app settings. Version: ${appSettings?.appVersion}\n`);

  // Update documents
  console.log('4. Updating documents...');
  await safeAPI.update('user-profiles', saveResult1.id, {
    ...userProfile,
    preferences: {
      ...userProfile.preferences,
      theme: 'light',
      lastLogin: Date.now()
    }
  });
  console.log('✓ User profile updated\n');

  // List documents with filtering
  console.log('5. Listing documents...');
  const profiles = await safeAPI.list('user-profiles', { limit: 10 });
  console.log(`✓ Found ${profiles.length} user profiles`);

  const settings = await safeAPI.list('app-settings');
  console.log(`✓ Found ${settings.length} app settings\n`);

  // Share documents with other users
  console.log('6. Sharing documents...');
  try {
    const shareResult = await safeAPI.shareWith('user-profiles', saveResult1.id, [
      { userId: 'colleague-123', email: 'colleague@example.com', permissions: 'read' },
      { userId: 'manager-456', email: 'manager@example.com', permissions: 'write' }
    ]);
    
    if (shareResult.success) {
      console.log(`✓ Document shared with: ${shareResult.sharedWith.join(', ')}`);
    } else {
      console.log('✗ Sharing failed (cloud service required)');
    }
  } catch (error) {
    console.log('⚠ Sharing not available without cloud service');
  }
  console.log();

  // Background sync to cloud
  console.log('7. Background sync to cloud...');
  try {
    const syncResult = await safeAPI.syncToCloud();
    console.log(`✓ Sync completed. Items synced: ${syncResult.syncedItems}`);
  } catch (error) {
    console.log('⚠ Background sync not available without cloud service');
  }
  console.log();

  // Get audit trail
  console.log('8. Retrieving audit trail...');
  try {
    const auditTrail = await safeAPI.getAuditTrail({
      startDate: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      actions: ['document_saved', 'document_updated', 'document_shared'],
      limit: 10
    });
    
    console.log(`✓ Found ${auditTrail.length} audit events:`);
    auditTrail.forEach((event, i) => {
      console.log(`  ${i + 1}. ${event.action} at ${new Date(event.timestamp).toISOString()}`);
    });
  } catch (error) {
    console.log('⚠ Audit trail not available without cloud service');
  }
  console.log();

  // Key rotation (hidden from typical developer use)
  console.log('9. Background key rotation...');
  try {
    const rotationResult = await safeAPI.rotateKeys();
    if (rotationResult.success) {
      console.log('✓ Keys rotated successfully (automatic background operation)');
      console.log(`✓ New public key: ${rotationResult.newKeyPair?.publicKeyArmored.substring(0, 50)}...`);
      
      // Verify documents are still accessible after rotation
      const verifyDoc = await safeAPI.load('user-profiles', saveResult1.id);
      console.log(`✓ Document still accessible after rotation: ${verifyDoc?.name}`);
    }
  } catch (error) {
    console.log('⚠ Key rotation simulation failed');
  }
  console.log();

  // Unshare document
  console.log('10. Managing document sharing...');
  try {
    const unshareResult = await safeAPI.unshareWith('user-profiles', saveResult1.id, 'colleague-123');
    if (unshareResult.success) {
      console.log('✓ Document access revoked from colleague-123');
    }
  } catch (error) {
    console.log('⚠ Unsharing not available without cloud service');
  }
  console.log();

  // Clean up - remove documents
  console.log('11. Cleaning up documents...');
  await safeAPI.remove('user-profiles', saveResult1.id);
  console.log('✓ User profile removed');

  await safeAPI.remove('app-settings', saveResult2.id);
  console.log('✓ App settings removed\n');

  console.log('=== Developer-Managed Mode Example Complete ===');
  console.log('\nKey benefits of Developer-Managed Mode:');
  console.log('• Simple API - crypto operations hidden from developers');
  console.log('• Automatic key management and escrow');
  console.log('• Built-in audit logging and compliance features');
  console.log('• Background sync and sharing capabilities');
  console.log('• Suitable for most business applications');
  console.log('• Balances ease of integration with security');
  console.log('• Developers focus on business logic, not crypto details');
}

// Run the example
if (require.main === module) {
  developerManagedExample().catch(console.error);
}

export { developerManagedExample };