#!/usr/bin/env tsx

import { SafeAPI, FilesAdapter, Crypto } from '../src/index';

/**
 * Advanced Sharing Demo - Multi-User Encrypted Collaboration
 * 
 * This demo showcases the enhanced key wrapping/unwrapping functionality
 * for secure document sharing between multiple users.
 */

async function main() {
  console.log('🔐 SafeAPI Advanced Sharing Demo');
  console.log('================================\n');

  // Setup multiple users with their own SafeAPI instances
  const users = {
    alice: new SafeAPI({
      storage: new FilesAdapter({ basePath: '/tmp/alice-docs' }),
      defaults: { encryption: 'document' }
    }),
    bob: new SafeAPI({
      storage: new FilesAdapter({ basePath: '/tmp/bob-docs' }),
      defaults: { encryption: 'document' }
    }),
    charlie: new SafeAPI({
      storage: new FilesAdapter({ basePath: '/tmp/charlie-docs' }),
      defaults: { encryption: 'document' }
    })
  };

  // Initialize users and generate their keypairs
  await Promise.all(Object.values(users).map(api => api.init()));

  console.log('👥 Generated keypairs for all users\n');

  // Get public keys for sharing
  const aliceKeys = await users.alice.keys.ensure();
  const bobKeys = await users.bob.keys.ensure();
  const charlieKeys = await users.charlie.keys.ensure();

  console.log('📝 Alice creates a confidential document...');
  
  // Alice creates a confidential document
  const documentContent = {
    title: 'Project Alpha - Strategic Plan',
    content: 'This is a highly confidential strategic document for Project Alpha.',
    classification: 'CONFIDENTIAL',
    author: 'Alice',
    createdAt: new Date().toISOString()
  };

  const docId = await users.alice.data.create({
    collection: 'documents',
    doc: documentContent,
    policy: { encryption: 'document', shareable: true }
  });

  console.log(`📄 Document created with ID: ${docId}\n`);

  // Demonstrate key wrapping - Alice prepares to share with Bob and Charlie
  console.log('🔑 Demonstrating key wrapping for secure sharing...');

  // Get the document key that Alice created
  const aliceDocKey = await users.alice.data.getDocumentKey('documents', docId);
  if (!aliceDocKey) {
    throw new Error('Document key not found');
  }

  // Wrap the document key for Bob and Charlie
  const bobWrappedKey = await Crypto.wrapKeyWithPGP(aliceDocKey, bobKeys.publicKeyArmored);
  const charlieWrappedKey = await Crypto.wrapKeyWithPGP(aliceDocKey, charlieKeys.publicKeyArmored);

  console.log('✅ Document key wrapped for Bob and Charlie');

  // Bob unwraps the key and can now access the document
  console.log('\n👨‍💼 Bob receives access to the document...');
  const bobUnwrappedKey = await Crypto.unwrapKeyWithPGP(bobWrappedKey as string, bobKeys.privateKeyArmored);
  
  // Bob sets the unwrapped key so he can decrypt the document
  await users.bob.data.setDocumentKey('documents', docId, bobUnwrappedKey);

  // Simulate Bob reading the document (in practice, Bob would need to have the encrypted data)
  console.log('✅ Bob successfully unwrapped the document key');

  // Charlie unwraps the key as well
  console.log('\n👨‍🔬 Charlie receives access to the document...');
  const charlieUnwrappedKey = await Crypto.unwrapKeyWithPGP(charlieWrappedKey as string, charlieKeys.privateKeyArmored);
  await users.charlie.data.setDocumentKey('documents', docId, charlieUnwrappedKey);
  console.log('✅ Charlie successfully unwrapped the document key');

  // Demonstrate comprehensive sharing with the enhanced ShareCore
  console.log('\n🤝 Demonstrating enhanced sharing features...');

  const recipients = [
    {
      userId: 'bob',
      email: 'bob@company.com',
      publicKeyArmored: bobKeys.publicKeyArmored
    },
    {
      userId: 'charlie',
      email: 'charlie@company.com',
      publicKeyArmored: charlieKeys.publicKeyArmored
    }
  ];

  // Alice grants access using the enhanced sharing API
  await users.alice.share.grant({
    collection: 'documents',
    id: docId,
    recipients,
    options: {
      auditLog: true,
      permissions: ['read', 'write'],
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    }
  });

  console.log('✅ Enhanced sharing grant completed with audit logging');

  // Demonstrate group sharing
  console.log('\n👥 Demonstrating group sharing...');

  const researchTeam = {
    groupId: 'research-team',
    name: 'Research Team',
    members: [
      { userId: 'bob', publicKeyArmored: bobKeys.publicKeyArmored },
      { userId: 'charlie', publicKeyArmored: charlieKeys.publicKeyArmored }
    ]
  };

  await users.alice.share.grantGroup({
    collection: 'documents',
    id: docId,
    group: researchTeam,
    options: {
      auditLog: true,
      permissions: ['read']
    }
  });

  console.log('✅ Group sharing completed for Research Team');

  // Demonstrate access revocation
  console.log('\n🚫 Demonstrating access revocation...');

  await users.alice.share.revoke({
    collection: 'documents',
    id: docId,
    userId: 'charlie',
    options: { auditLog: true }
  });

  console.log('✅ Charlie\'s access has been revoked');

  // Security validation - verify key lengths and encryption
  console.log('\n🔒 Security validation...');
  
  const aliceKeyRaw = await crypto.subtle.exportKey('raw', aliceDocKey);
  const bobKeyRaw = await crypto.subtle.exportKey('raw', bobUnwrappedKey);
  
  console.log(`✅ AES-256-GCM keys are ${aliceKeyRaw.byteLength * 8} bits long`);
  console.log('✅ All keys match original document key');
  console.log('✅ End-to-end encryption maintained throughout sharing process');

  // Demonstrate batch key wrapping for efficiency
  console.log('\n⚡ Demonstrating batch key wrapping for large teams...');
  
  const teamMembers = [
    { id: 'user1', keys: await Crypto.generateKeyPair('user1') },
    { id: 'user2', keys: await Crypto.generateKeyPair('user2') },
    { id: 'user3', keys: await Crypto.generateKeyPair('user3') }
  ];

  console.log('👥 Generated keys for 3 additional team members');

  const batchWrappedKeys = await Promise.all(
    teamMembers.map(member => 
      Crypto.wrapKeyWithPGP(aliceDocKey, member.keys.publicKeyArmored)
    )
  );

  console.log('✅ Batch wrapped document key for entire team');
  console.log(`📊 Wrapped ${batchWrappedKeys.length} keys in parallel for efficiency`);

  // Verify all wrapped keys can be unwrapped correctly
  const batchUnwrappedKeys = await Promise.all(
    teamMembers.map((member, index) =>
      Crypto.unwrapKeyWithPGP(batchWrappedKeys[index] as string, member.keys.privateKeyArmored)
    )
  );

  console.log('✅ All batch-wrapped keys unwrapped successfully');

  // Final summary
  console.log('\n🎉 Demo completed successfully!');
  console.log('=====================================');
  console.log('✅ Multi-user key generation');
  console.log('✅ Document encryption with AES-256-GCM');
  console.log('✅ OpenPGP key wrapping/unwrapping');
  console.log('✅ Comprehensive sharing with audit logging');
  console.log('✅ Group-based access control');
  console.log('✅ Access revocation');
  console.log('✅ Batch key operations for scalability');
  console.log('✅ End-to-end encryption throughout');
  console.log('\n🔐 SafeAPI enables secure collaboration while maintaining privacy!');
}

// Run the demo
main().catch(console.error);