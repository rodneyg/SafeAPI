// Example demonstrating the new EncryptionOptions interface
import { encryptJsonAesGcm, decryptJsonAesGcm } from '../src/crypto/openpgp';
import type { EncryptionOptions } from '../src/types';

async function demonstrateEncryptionOptions() {
  // Example 1: Document encryption with metadata
  const document = {
    title: "Confidential Report",
    content: "This is sensitive information",
    created: new Date().toISOString()
  };

  const documentOptions: EncryptionOptions = {
    contentType: 'application/json',
    metadata: {
      documentType: 'report',
      classification: 'confidential',
      version: '1.0',
      encryptedAt: new Date().toISOString()
    }
  };

  const documentResult = await encryptJsonAesGcm(document, documentOptions);
  console.log('Document encrypted with metadata:', {
    contentType: documentResult.contentType,
    metadata: documentResult.metadata,
    encryptedSize: documentResult.encrypted.length
  });

  // Example 2: Field-level encryption with custom key
  const customKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );

  const sensitiveData = {
    ssn: "123-45-6789",
    creditCard: "4111-1111-1111-1111"
  };

  const fieldOptions: EncryptionOptions = {
    key: customKey,
    contentType: 'application/json',
    metadata: {
      encryptionMode: 'field-level',
      fields: ['ssn', 'creditCard'],
      purpose: 'PII protection'
    }
  };

  const fieldResult = await encryptJsonAesGcm(sensitiveData, fieldOptions);
  console.log('Field data encrypted with reused key:', {
    keyReused: fieldResult.key === customKey,
    contentType: fieldResult.contentType,
    metadata: fieldResult.metadata
  });

  // Example 3: Verify decryption works
  const decryptedDocument = await decryptJsonAesGcm(documentResult.encrypted, documentResult.key);
  const decryptedFields = await decryptJsonAesGcm(fieldResult.encrypted, fieldResult.key);

  console.log('Decryption successful:', {
    documentMatch: JSON.stringify(decryptedDocument) === JSON.stringify(document),
    fieldsMatch: JSON.stringify(decryptedFields) === JSON.stringify(sensitiveData)
  });
}

// This is just for demonstration - would be called in a real app
export { demonstrateEncryptionOptions };