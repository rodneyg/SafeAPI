// Simple test to verify the improved error handling for key escrow operations
// This tests the validation logic and error message formats
const test = require('node:test');
const assert = require('node:assert');

// Validation functions extracted from the improved handleKeys function
function validateUserId(userId) {
  if (!userId || typeof userId !== 'string' || userId.trim().length === 0) {
    return { error: 'invalid_user_id', message: 'User ID is required and must be a non-empty string' };
  }
  return null;
}

function validateEncryptedKey(encPrivKey) {
  if (!encPrivKey || typeof encPrivKey !== 'string' || encPrivKey.trim().length === 0) {
    return { error: 'invalid_encrypted_key', message: 'Encrypted private key is required and must be a non-empty string' };
  }
  
  // Basic validation that the encrypted key looks like encrypted data
  if (encPrivKey.includes('BEGIN PGP PRIVATE KEY BLOCK') && !encPrivKey.includes('encrypted')) {
    return { error: 'key_not_encrypted', message: 'Private key appears to be unencrypted - only encrypted keys can be stored in escrow' };
  }
  
  return null;
}

function getStorageErrorResponse(error) {
  if (error.code === 'permission-denied') {
    return { status: 403, error: 'storage_permission_denied', message: 'Insufficient permissions to store encrypted key in escrow' };
  } else if (error.code === 'deadline-exceeded' || error.code === 'unavailable') {
    return { status: 503, error: 'storage_unavailable', message: 'Key escrow storage temporarily unavailable - please retry' };
  } else if (error.message && error.message.includes('document too large')) {
    return { status: 413, error: 'key_too_large', message: 'Encrypted private key exceeds maximum storage size limit' };
  } else {
    return { status: 500, error: 'escrow_storage_failed', message: 'Failed to store encrypted private key due to backend error' };
  }
}

function getRecoveryErrorResponse(error) {
  if (error.code === 'permission-denied') {
    return { status: 403, error: 'recovery_permission_denied', message: 'Insufficient permissions to retrieve encrypted key from escrow' };
  } else if (error.code === 'deadline-exceeded' || error.code === 'unavailable') {
    return { status: 503, error: 'storage_unavailable', message: 'Key escrow storage temporarily unavailable - please retry recovery' };
  } else {
    return { status: 500, error: 'recovery_failed', message: 'Failed to retrieve encrypted private key due to backend error' };
  }
}

// Test suite
test('Key Escrow Error Handling', async (t) => {
  
  await t.test('validates user ID correctly', (t) => {
    // Test invalid user IDs
    assert.deepStrictEqual(validateUserId(''), { error: 'invalid_user_id', message: 'User ID is required and must be a non-empty string' });
    assert.deepStrictEqual(validateUserId(null), { error: 'invalid_user_id', message: 'User ID is required and must be a non-empty string' });
    assert.deepStrictEqual(validateUserId(undefined), { error: 'invalid_user_id', message: 'User ID is required and must be a non-empty string' });
    assert.deepStrictEqual(validateUserId('   '), { error: 'invalid_user_id', message: 'User ID is required and must be a non-empty string' });
    assert.deepStrictEqual(validateUserId(123), { error: 'invalid_user_id', message: 'User ID is required and must be a non-empty string' });
    
    // Test valid user ID
    assert.strictEqual(validateUserId('valid-user-123'), null);
  });

  await t.test('validates encrypted private key correctly', (t) => {
    // Test invalid encrypted keys
    assert.deepStrictEqual(validateEncryptedKey(''), { error: 'invalid_encrypted_key', message: 'Encrypted private key is required and must be a non-empty string' });
    assert.deepStrictEqual(validateEncryptedKey(null), { error: 'invalid_encrypted_key', message: 'Encrypted private key is required and must be a non-empty string' });
    assert.deepStrictEqual(validateEncryptedKey('   '), { error: 'invalid_encrypted_key', message: 'Encrypted private key is required and must be a non-empty string' });
    
    // Test unencrypted key detection
    const unencryptedKey = '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: OpenPGP.js\n\nlQWGBGPuZr8BDADEk...';
    assert.deepStrictEqual(validateEncryptedKey(unencryptedKey), { 
      error: 'key_not_encrypted', 
      message: 'Private key appears to be unencrypted - only encrypted keys can be stored in escrow' 
    });
    
    // Test valid encrypted key
    const encryptedKey = '-----BEGIN PGP PRIVATE KEY BLOCK-----\nVersion: OpenPGP.js\nencrypted key data...';
    assert.strictEqual(validateEncryptedKey(encryptedKey), null);
    assert.strictEqual(validateEncryptedKey('some-encrypted-blob'), null);
  });

  await t.test('provides specific storage error messages', (t) => {
    // Test permission denied
    const permError = new Error('permission denied');
    permError.code = 'permission-denied';
    assert.deepStrictEqual(getStorageErrorResponse(permError), {
      status: 403,
      error: 'storage_permission_denied',
      message: 'Insufficient permissions to store encrypted key in escrow'
    });
    
    // Test timeout/unavailable
    const timeoutError = new Error('deadline exceeded');
    timeoutError.code = 'deadline-exceeded';
    assert.deepStrictEqual(getStorageErrorResponse(timeoutError), {
      status: 503,
      error: 'storage_unavailable',
      message: 'Key escrow storage temporarily unavailable - please retry'
    });
    
    // Test document too large
    const largeError = new Error('document too large');
    assert.deepStrictEqual(getStorageErrorResponse(largeError), {
      status: 413,
      error: 'key_too_large',
      message: 'Encrypted private key exceeds maximum storage size limit'
    });
    
    // Test generic error
    const genericError = new Error('some other error');
    assert.deepStrictEqual(getStorageErrorResponse(genericError), {
      status: 500,
      error: 'escrow_storage_failed',
      message: 'Failed to store encrypted private key due to backend error'
    });
  });

  await t.test('provides specific recovery error messages', (t) => {
    // Test permission denied
    const permError = new Error('permission denied');
    permError.code = 'permission-denied';
    assert.deepStrictEqual(getRecoveryErrorResponse(permError), {
      status: 403,
      error: 'recovery_permission_denied',
      message: 'Insufficient permissions to retrieve encrypted key from escrow'
    });
    
    // Test service unavailable
    const unavailError = new Error('unavailable');
    unavailError.code = 'unavailable';
    assert.deepStrictEqual(getRecoveryErrorResponse(unavailError), {
      status: 503,
      error: 'storage_unavailable',
      message: 'Key escrow storage temporarily unavailable - please retry recovery'
    });
    
    // Test generic recovery error
    const genericError = new Error('some recovery error');
    assert.deepStrictEqual(getRecoveryErrorResponse(genericError), {
      status: 500,
      error: 'recovery_failed',
      message: 'Failed to retrieve encrypted private key due to backend error'
    });
  });
});

console.log('Running improved error handling tests...');