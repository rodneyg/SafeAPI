/**
 * Shared Responsibility Mode Example
 * 
 * This example demonstrates how to use SafeAPI in shared responsibility mode,
 * where users set a passphrase and SafeAPI escrows the encrypted private key.
 */

import { SharedResponsibilityMode, FilesAdapter } from '../../src/index';

async function sharedResponsibilityExample() {
  console.log('=== SafeAPI Shared Responsibility Mode Example ===\n');

  // Initialize with shared responsibility mode
  const storage = new FilesAdapter();
  const safeAPI = new SharedResponsibilityMode({
    storage,
    uxMode: 'shared-responsibility',
    cloud: {
      endpoint: 'http://localhost:5001/api', // Use emulator for demo
      apiKey: 'demo-api-key',
      projectId: 'demo-project'
    },
    defaults: { encryption: 'document' }
  });

  const userId = 'user123';
  const userPassphrase = 'my-secure-passphrase-456';

  console.log('1. Initializing shared responsibility mode...');
  try {
    const { keyPair, escrowStatus, recoveryEnabled } = await safeAPI.initialize(userId, {
      passphrase: userPassphrase,
      enableRecovery: true,
      escrowMetadata: { 
        deviceType: 'desktop',
        location: 'US',
        timestamp: Date.now()
      }
    });
    
    console.log(`✓ Keys generated. Public key: ${keyPair.publicKeyArmored.substring(0, 50)}...`);
    console.log(`✓ Escrow status: ${escrowStatus}`);
    console.log(`✓ Recovery enabled: ${recoveryEnabled}\n`);
  } catch (error) {
    console.log('⚠ Cloud service not available, using local mode');
    console.log('Note: In production, ensure cloud service is configured for escrow features\n');
  }

  // User updates their passphrase
  console.log('2. Setting/updating passphrase...');
  try {
    const passphraseResult = await safeAPI.setPassphrase(userPassphrase, {
      escrowMetadata: { reason: 'initial_setup', timestamp: Date.now() }
    });
    
    console.log(`✓ Passphrase set. Escrow status: ${passphraseResult.escrowStatus}`);
    console.log(`✓ Success: ${passphraseResult.success}\n`);
  } catch (error) {
    console.log('⚠ Passphrase escrow not available in demo mode\n');
  }

  // Create documents with automatic audit logging
  console.log('3. Creating documents with audit logging...');
  const docResult1 = await safeAPI.createDocument('medical-records', {
    patientId: 'P12345',
    recordType: 'lab_results',
    results: {
      bloodPressure: '120/80',
      cholesterol: 180,
      bloodSugar: 95
    },
    date: new Date().toISOString()
  }, { 
    encryption: 'document', 
    shareable: true,
    auditEnabled: true 
  });
  
  console.log(`✓ Medical record created. ID: ${docResult1.id}`);
  if (docResult1.auditId) {
    console.log(`✓ Audit record created. ID: ${docResult1.auditId}`);
  }

  const docResult2 = await safeAPI.createDocument('financial', {
    accountNumber: '****1234',
    balance: 5432.10,
    lastTransaction: '2024-01-15',
    currency: 'USD'
  }, { 
    encryption: 'document',
    auditEnabled: true 
  });
  
  console.log(`✓ Financial record created. ID: ${docResult2.id}\n`);

  // User retrieves documents
  console.log('4. Retrieving documents...');
  const medicalRecord = await safeAPI.getDocument('medical-records', docResult1.id);
  console.log(`✓ Retrieved medical record for patient: ${medicalRecord?.patientId}`);
  
  const financialRecord = await safeAPI.getDocument('financial', docResult2.id);
  console.log(`✓ Retrieved financial record. Balance: $${financialRecord?.balance}\n`);

  // Check escrow status
  console.log('5. Checking escrow status...');
  try {
    const escrowStatus = await safeAPI.getEscrowStatus();
    console.log(`✓ Has escrowed key: ${escrowStatus.hasEscrowedKey}`);
    if (escrowStatus.escrowDate) {
      console.log(`✓ Escrow date: ${new Date(escrowStatus.escrowDate).toISOString()}`);
    }
    if (escrowStatus.metadata) {
      console.log(`✓ Escrow metadata: ${JSON.stringify(escrowStatus.metadata)}`);
    }
  } catch (error) {
    console.log('⚠ Escrow status check not available in demo mode');
  }
  console.log();

  // Simulate recovery scenario
  console.log('6. Simulating key recovery with passphrase...');
  try {
    const recoveryResult = await safeAPI.recoverWithPassphrase(userPassphrase);
    
    if (recoveryResult.success) {
      console.log('✓ Recovery successful');
      console.log(`✓ Message: ${recoveryResult.message}`);
      
      // Verify access to documents after recovery
      const verifyDoc = await safeAPI.getDocument('medical-records', docResult1.id);
      console.log(`✓ Document accessible after recovery: Patient ${verifyDoc?.patientId}`);
    } else {
      console.log(`✗ Recovery failed: ${recoveryResult.message}`);
    }
  } catch (error) {
    console.log('⚠ Recovery simulation not available without cloud service');
  }
  console.log();

  // Update escrow with new metadata
  console.log('7. Updating escrow...');
  try {
    const updateResult = await safeAPI.updateEscrow({
      passphrase: userPassphrase,
      enableRecovery: true,
      escrowMetadata: {
        lastUpdate: Date.now(),
        reason: 'metadata_update',
        version: '1.1'
      }
    });
    
    console.log(`✓ Escrow updated. Status: ${updateResult.escrowStatus}`);
  } catch (error) {
    console.log('⚠ Escrow update not available in demo mode');
  }
  console.log();

  console.log('=== Shared Responsibility Mode Example Complete ===');
  console.log('\nKey benefits of Shared Responsibility Mode:');
  console.log('• User controls passphrase, SafeAPI handles secure escrow');
  console.log('• Recovery possible through cloud service');
  console.log('• Automatic audit logging for compliance');
  console.log('• Balance of user control and convenience');
  console.log('• Suitable for business applications with compliance needs');
  console.log('• Shared security responsibility reduces single points of failure');
}

// Run the example
if (require.main === module) {
  sharedResponsibilityExample().catch(console.error);
}

export { sharedResponsibilityExample };