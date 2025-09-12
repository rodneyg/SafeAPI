/**
 * Complete UX Modes Demonstration
 * 
 * This example demonstrates all four SafeAPI UX modes and how developers
 * can choose the appropriate mode based on their requirements.
 */

import { userManagedExample } from './user-managed';
import { sharedResponsibilityExample } from './shared-responsibility';
import { developerManagedExample } from './developer-managed';
import { apiManagedExample } from './api-managed';

async function runAllUXModeExamples() {
  console.log('🔐 SafeAPI UX Modes Complete Demonstration\n');
  console.log('This demo shows how each UX mode addresses different use cases:\n');

  // Run User-Managed Mode
  console.log('📋 Running User-Managed Mode Example...');
  console.log('Use case: Privacy-conscious users, sensitive data, maximum control\n');
  await userManagedExample();
  console.log('\n' + '='.repeat(80) + '\n');

  // Run Shared Responsibility Mode
  console.log('📋 Running Shared Responsibility Mode Example...');
  console.log('Use case: Business applications, compliance requirements, balanced control\n');
  await sharedResponsibilityExample();
  console.log('\n' + '='.repeat(80) + '\n');

  // Run Developer-Managed Mode
  console.log('📋 Running Developer-Managed Mode Example...');
  console.log('Use case: Most business applications, easy integration, automatic features\n');
  await developerManagedExample();
  console.log('\n' + '='.repeat(80) + '\n');

  // Run API-Managed Mode
  console.log('📋 Running API-Managed Mode Example...');
  console.log('Use case: Rapid prototyping, simple apps, zero crypto complexity\n');
  await apiManagedExample();
  console.log('\n' + '='.repeat(80) + '\n');

  // Summary and recommendations
  console.log('🎯 UX Mode Selection Guide\n');
  
  console.log('1. User-Managed Mode:');
  console.log('   ✅ Choose when: Maximum privacy, user controls everything');
  console.log('   ✅ Best for: Privacy apps, personal data, crypto-savvy users');
  console.log('   ⚠️  Consider: Users must handle backup/recovery themselves\n');

  console.log('2. Shared Responsibility Mode:');
  console.log('   ✅ Choose when: Need compliance, want recovery options');
  console.log('   ✅ Best for: Business apps, regulated industries, team collaboration');
  console.log('   ⚠️  Consider: Requires cloud service configuration\n');

  console.log('3. Developer-Managed Mode:');
  console.log('   ✅ Choose when: Want easy integration with automatic features');
  console.log('   ✅ Best for: Most business applications, SaaS products');
  console.log('   ⚠️  Consider: Less user control over crypto operations\n');

  console.log('4. API-Managed Mode:');
  console.log('   ✅ Choose when: Want simplest possible integration');
  console.log('   ✅ Best for: Prototypes, simple apps, non-crypto developers');
  console.log('   ⚠️  Consider: Requires full trust in API service\n');

  console.log('💡 Implementation Tips:');
  console.log('• Start with API-Managed for prototyping');
  console.log('• Move to Developer-Managed for production apps');
  console.log('• Use Shared Responsibility for compliance needs');
  console.log('• Choose User-Managed for maximum privacy/control');
  console.log('• You can migrate between modes as requirements evolve');
}

// UX Mode comparison matrix
function printComparisonMatrix() {
  console.log('\n📊 UX Mode Comparison Matrix\n');
  
  const matrix = [
    ['Feature', 'User-Managed', 'Shared Responsibility', 'Developer-Managed', 'API-Managed'],
    ['User Control', 'Maximum', 'High', 'Medium', 'Low'],
    ['Integration Complexity', 'High', 'Medium', 'Low', 'Minimal'],
    ['Crypto UX Exposure', 'Full', 'Some', 'Hidden', 'None'],
    ['Recovery Options', 'User-managed', 'Cloud + Passphrase', 'Automatic', 'Automatic'],
    ['Cloud Dependency', 'Optional', 'Required', 'Recommended', 'Required'],
    ['Audit/Compliance', 'Manual', 'Automatic', 'Automatic', 'Automatic'],
    ['Sharing Features', 'Limited', 'Full', 'Full', 'Full'],
    ['Security Model', 'Client-only', 'Hybrid', 'SDK + Cloud', 'Server-side'],
    ['Best For', 'Privacy apps', 'Business apps', 'Most apps', 'Simple apps']
  ];

  // Print table
  matrix.forEach((row, i) => {
    if (i === 0) {
      console.log(row.map(cell => cell.padEnd(18)).join(' | '));
      console.log('-'.repeat(row.length * 20));
    } else {
      console.log(row.map(cell => cell.padEnd(18)).join(' | '));
    }
  });
}

// Run examples if called directly
if (require.main === module) {
  runAllUXModeExamples()
    .then(() => {
      printComparisonMatrix();
      console.log('\n✅ All UX mode examples completed successfully!');
    })
    .catch(error => {
      console.error('❌ Example failed:', error);
      process.exit(1);
    });
}

export { runAllUXModeExamples, printComparisonMatrix };