/**
 * API-Managed Mode Example
 * 
 * This example demonstrates how to use SafeAPI in API-managed mode,
 * where the service handles all cryptographic operations transparently.
 */

import { APIManagedMode, FilesAdapter } from '../../src/index';

async function apiManagedExample() {
  console.log('=== SafeAPI API-Managed Mode Example ===\n');

  // Initialize with API-managed mode - minimal configuration
  const storage = new FilesAdapter();
  const safeAPI = new APIManagedMode(
    {
      storage,
      uxMode: 'api-managed',
      cloud: {
        endpoint: 'http://localhost:5001/api', // Use emulator for demo
        apiKey: 'demo-api-key',
        projectId: 'demo-project'
      }
    },
    {
      transparentMode: true,
      serverSideKeys: true
    }
  );

  const userId = 'api-user-789';

  console.log('1. Initializing API-managed mode...');
  try {
    const { ready, features } = await safeAPI.initialize(userId);
    
    console.log(`✓ System ready: ${ready}`);
    console.log('✓ Available features:');
    console.log(`  - Transparent encryption: ${features.transparentEncryption}`);
    console.log(`  - Server-side keys: ${features.serverSideKeys}`);
    console.log(`  - Automatic audit: ${features.automaticAudit}`);
    console.log(`  - Automatic backup: ${features.automaticBackup}\n`);
  } catch (error) {
    console.log('⚠ API service not available, using local storage fallback\n');
  }

  // Ultra-simple data operations - no crypto exposed at all
  console.log('2. Storing data (encryption completely transparent)...');
  const storeResult1 = await safeAPI.store('customer-data', {
    customerId: 'CUST-12345',
    personalInfo: {
      name: 'Alice Johnson',
      email: 'alice@example.com',
      phone: '+1-555-0123',
      address: {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zip: '90210'
      }
    },
    preferences: {
      communications: ['email', 'sms'],
      marketingOptIn: true
    },
    createdAt: new Date().toISOString()
  });
  
  console.log(`✓ Customer data stored with ID: ${storeResult1.id}`);
  console.log(`✓ Data encrypted: ${storeResult1.encrypted}`);

  const storeResult2 = await safeAPI.store('orders', {
    orderId: 'ORD-98765',
    customerId: 'CUST-12345',
    items: [
      { sku: 'ITEM-001', name: 'Laptop', price: 999.99, quantity: 1 },
      { sku: 'ITEM-002', name: 'Mouse', price: 29.99, quantity: 2 }
    ],
    total: 1059.97,
    status: 'processing',
    orderDate: new Date().toISOString()
  });
  
  console.log(`✓ Order data stored with ID: ${storeResult2.id}`);
  console.log(`✓ Data encrypted: ${storeResult2.encrypted}\n`);

  // Retrieve data - decryption is completely transparent
  console.log('3. Retrieving data (decryption transparent)...');
  const customerData = await safeAPI.retrieve('customer-data', storeResult1.id);
  console.log(`✓ Retrieved customer: ${customerData?.personalInfo?.name}`);
  console.log(`✓ Customer ID: ${customerData?.customerId}`);

  const orderData = await safeAPI.retrieve('orders', storeResult2.id);
  console.log(`✓ Retrieved order: ${orderData?.orderId}`);
  console.log(`✓ Order total: $${orderData?.total}\n`);

  // Update data
  console.log('4. Updating data...');
  const updateResult = await safeAPI.update('orders', storeResult2.id, {
    ...orderData,
    status: 'shipped',
    trackingNumber: 'TRK-ABC123',
    shippedAt: new Date().toISOString()
  });
  
  console.log(`✓ Order updated. Success: ${updateResult.success}`);
  console.log(`✓ Data encrypted: ${updateResult.encrypted}\n`);

  // List data with filters
  console.log('5. Listing data with filters...');
  const customers = await safeAPI.list('customer-data', {
    limit: 10,
    filters: { 'preferences.marketingOptIn': true }
  });
  console.log(`✓ Found ${customers.length} customers with marketing opt-in`);

  const orders = await safeAPI.list('orders', {
    limit: 5,
    orderBy: 'orderDate',
    filters: { status: 'shipped' }
  });
  console.log(`✓ Found ${orders.length} shipped orders\n`);

  // Transparent sharing - no crypto UX needed
  console.log('6. Sharing data transparently...');
  try {
    const shareResult = await safeAPI.share('customer-data', storeResult1.id, [
      'support-team-lead',
      'account-manager-bob',
      'billing-system'
    ]);
    
    if (shareResult.success) {
      console.log(`✓ Data shared with: ${shareResult.sharedWith.join(', ')}`);
      if (shareResult.shareLinks) {
        console.log(`✓ Generated ${shareResult.shareLinks.length} secure share links`);
      }
    } else {
      console.log('✗ Sharing failed (API service required)');
    }
  } catch (error) {
    console.log('⚠ Sharing not available without API service');
  }
  console.log();

  // Automatic compliance reporting
  console.log('7. Generating compliance reports...');
  try {
    const reportResult = await safeAPI.getComplianceReport({
      format: 'json',
      dateRange: {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        end: new Date()
      },
      standards: ['SOC2', 'GDPR', 'HIPAA']
    });
    
    console.log(`✓ Compliance report generated. ID: ${reportResult.reportId}`);
    if (reportResult.downloadUrl) {
      console.log(`✓ Download URL: ${reportResult.downloadUrl}`);
    }
  } catch (error) {
    console.log('⚠ Compliance reporting not available without API service');
  }
  console.log();

  // Usage metrics
  console.log('8. Checking usage metrics...');
  try {
    const metrics = await safeAPI.getUsageMetrics();
    
    console.log('✓ Usage metrics:');
    console.log(`  - Storage: ${metrics.storage.used}/${metrics.storage.limit} ${metrics.storage.unit}`);
    console.log(`  - Operations: ${metrics.operations.count}/${metrics.operations.limit} per ${metrics.operations.period}`);
    console.log(`  - Active shares: ${metrics.sharing.activeShares}/${metrics.sharing.limit}`);
  } catch (error) {
    console.log('⚠ Usage metrics not available without API service');
  }
  console.log();

  // Unshare data
  console.log('9. Managing data sharing...');
  try {
    const unshareResult = await safeAPI.unshare('customer-data', storeResult1.id, [
      'billing-system'
    ]);
    
    if (unshareResult.success) {
      console.log('✓ Data access revoked from billing-system');
    }
  } catch (error) {
    console.log('⚠ Unsharing not available without API service');
  }
  console.log();

  // Clean up
  console.log('10. Cleaning up data...');
  const deleteResult1 = await safeAPI.delete('customer-data', storeResult1.id);
  console.log(`✓ Customer data deleted. Success: ${deleteResult1.success}`);

  const deleteResult2 = await safeAPI.delete('orders', storeResult2.id);
  console.log(`✓ Order data deleted. Success: ${deleteResult2.success}\n`);

  console.log('=== API-Managed Mode Example Complete ===');
  console.log('\nKey benefits of API-Managed Mode:');
  console.log('• Zero crypto UX - everything handled transparently');
  console.log('• Simplest possible integration for developers');
  console.log('• Automatic compliance and audit reporting');
  console.log('• Server-side key management and security');
  console.log('• Built-in usage monitoring and limits');
  console.log('• Suitable for rapid prototyping and simple applications');
  console.log('• Minimal configuration required');
  console.log('• Focus entirely on business logic');
}

// Run the example
if (require.main === module) {
  apiManagedExample().catch(console.error);
}

export { apiManagedExample };