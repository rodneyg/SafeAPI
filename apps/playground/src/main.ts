import { Crypto } from '@safeapi/sdk';

const el = (id: string) => document.getElementById(id)!;

const ui = `
  <h1>SafeAPI Multi-User Sharing Demo</h1>
  <p>Demonstrates end-to-end encrypted document sharing between users using OpenPGP key wrapping.</p>
  
  <div class="demo-section">
    <h2>Demo Workflow</h2>
    <div class="steps">
      <div class="step">
        <h3>Step 1: Generate User Keypairs</h3>
        <button id="generate-keys">Generate Keys for Alice, Bob & Charlie</button>
        <div id="keys-output" class="output"></div>
      </div>
      
      <div class="step">
        <h3>Step 2: Create & Share Document</h3>
        <textarea id="document-content" placeholder="Enter document content to share..." rows="3"></textarea>
        <button id="create-document">Create & Share Document</button>
        <div id="document-output" class="output"></div>
      </div>
      
      <div class="step">
        <h3>Step 3: Recipients Access Document</h3>
        <button id="bob-access">Bob Accesses Document</button>
        <button id="charlie-access">Charlie Accesses Document</button>
        <div id="access-output" class="output"></div>
      </div>
      
      <div class="step">
        <h3>Step 4: Revoke Access</h3>
        <button id="revoke-charlie">Revoke Charlie's Access</button>
        <div id="revoke-output" class="output"></div>
      </div>
    </div>
  </div>
  
  <div class="technical-info">
    <h2>Technical Details</h2>
    <div id="technical-output" class="output">
      This demo showcases:
      <ul>
        <li>OpenPGP keypair generation for multiple users</li>
        <li>AES-GCM document encryption with generated keys</li>
        <li>Key wrapping using OpenPGP for secure sharing</li>
        <li>Key unwrapping by recipients to access documents</li>
        <li>Access revocation by removing wrapped keys</li>
      </ul>
    </div>
  </div>
  
  <style>
    body { 
      font-family: Inter, system-ui, sans-serif; 
      line-height: 1.6;
      max-width: 1000px;
      margin: 0 auto;
      padding: 20px;
      background: #f8f9fa;
    }
    
    h1 { color: #2c3e50; margin-bottom: 10px; }
    h2 { color: #34495e; border-bottom: 2px solid #3498db; padding-bottom: 8px; }
    h3 { color: #2c3e50; margin-bottom: 10px; }
    
    .demo-section { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .technical-info { background: #e8f4f8; padding: 20px; border-radius: 8px; margin: 20px 0; }
    
    .steps { display: grid; gap: 20px; }
    .step { padding: 15px; border: 1px solid #ddd; border-radius: 6px; background: #fafafa; }
    
    button { 
      background: #3498db; 
      color: white; 
      border: none; 
      padding: 10px 16px; 
      border-radius: 4px; 
      cursor: pointer; 
      margin: 5px 5px 5px 0;
      font-size: 14px;
    }
    button:hover { background: #2980b9; }
    button:disabled { background: #bdc3c7; cursor: not-allowed; }
    
    textarea { 
      width: calc(100% - 16px); 
      padding: 8px; 
      border: 1px solid #ddd; 
      border-radius: 4px; 
      margin-bottom: 10px;
      font-family: inherit;
    }
    
    .output { 
      background: #2c3e50; 
      color: #ecf0f1; 
      padding: 15px; 
      border-radius: 4px; 
      margin-top: 10px; 
      font-family: 'Courier New', monospace; 
      font-size: 12px;
      white-space: pre-wrap;
      max-height: 300px;
      overflow-y: auto;
    }
    
    .success { color: #27ae60; }
    .error { color: #e74c3c; }
    .info { color: #3498db; }
    
    .technical-info .output { background: #34495e; color: white; }
    .technical-info ul { margin: 10px 0; padding-left: 20px; }
  </style>
`;

document.getElementById('app')!.innerHTML = ui;

// Demo state
const demoState = {
  users: {} as any,
  document: null as any,
  isInitialized: false
};

function log(elementId: string, message: string, type: 'info' | 'success' | 'error' = 'info') {
  const output = el(elementId);
  const timestamp = new Date().toLocaleTimeString();
  const colorClass = type === 'success' ? 'success' : type === 'error' ? 'error' : 'info';
  output.innerHTML += `<span class="${colorClass}">[${timestamp}] ${message}</span>\n`;
  output.scrollTop = output.scrollHeight;
}

async function generateKeys() {
  try {
    log('keys-output', 'Generating keypairs for Alice, Bob, and Charlie...', 'info');
    
    // Generate keypairs for three users
    demoState.users.alice = await Crypto.generateKeyPair('alice');
    demoState.users.bob = await Crypto.generateKeyPair('bob');
    demoState.users.charlie = await Crypto.generateKeyPair('charlie');
    
    log('keys-output', 'Alice keypair generated ✓', 'success');
    log('keys-output', `Alice public key: ${demoState.users.alice.publicKeyArmored.substring(0, 80)}...`, 'info');
    
    log('keys-output', 'Bob keypair generated ✓', 'success');
    log('keys-output', `Bob public key: ${demoState.users.bob.publicKeyArmored.substring(0, 80)}...`, 'info');
    
    log('keys-output', 'Charlie keypair generated ✓', 'success');
    log('keys-output', `Charlie public key: ${demoState.users.charlie.publicKeyArmored.substring(0, 80)}...`, 'info');
    
    demoState.isInitialized = true;
    el('create-document').disabled = false;
    
    log('keys-output', 'All keypairs ready! You can now create a document.', 'success');
  } catch (error) {
    log('keys-output', `Error generating keys: ${error.message}`, 'error');
  }
}

async function createAndShareDocument() {
  if (!demoState.isInitialized) {
    log('document-output', 'Please generate keys first!', 'error');
    return;
  }
  
  const content = (el('document-content') as HTMLTextAreaElement).value.trim();
  if (!content) {
    log('document-output', 'Please enter document content!', 'error');
    return;
  }
  
  try {
    log('document-output', 'Creating document and encrypting with AES-GCM...', 'info');
    
    // Create document content
    const documentData = {
      title: 'Shared Secret Document',
      content: content,
      author: 'alice',
      createdAt: new Date().toISOString(),
      sharedWith: ['bob', 'charlie']
    };
    
    // Generate document key and encrypt
    const documentKey = await Crypto.generateDocumentKey();
    const { encrypted, iv } = await Crypto.encryptDocument(documentData, documentKey);
    
    log('document-output', `Document encrypted (${encrypted.length} bytes) ✓`, 'success');
    log('document-output', `IV: ${Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('')}`, 'info');
    
    // Wrap key for recipients
    log('document-output', 'Wrapping document key for Bob and Charlie...', 'info');
    
    const recipients = [
      { userId: 'bob', publicKeyArmored: demoState.users.bob.publicKeyArmored },
      { userId: 'charlie', publicKeyArmored: demoState.users.charlie.publicKeyArmored }
    ];
    
    const wrappedKeys = await Crypto.wrapKeyForMultipleRecipients(documentKey, recipients);
    
    log('document-output', `Keys wrapped for ${wrappedKeys.length} recipients ✓`, 'success');
    wrappedKeys.forEach(wk => {
      log('document-output', `${wk.userId}: ${wk.wrappedKey.substring(0, 80)}...`, 'info');
    });
    
    // Store document state
    demoState.document = {
      data: documentData,
      encrypted,
      iv,
      documentKey,
      wrappedKeys
    };
    
    // Enable access buttons
    el('bob-access').disabled = false;
    el('charlie-access').disabled = false;
    el('revoke-charlie').disabled = false;
    
    log('document-output', 'Document created and shared successfully! Recipients can now access it.', 'success');
    
  } catch (error) {
    log('document-output', `Error creating document: ${error.message}`, 'error');
  }
}

async function bobAccessDocument() {
  if (!demoState.document) {
    log('access-output', 'No document to access!', 'error');
    return;
  }
  
  try {
    log('access-output', 'Bob attempting to access document...', 'info');
    
    // Find Bob's wrapped key
    const bobWrappedKey = demoState.document.wrappedKeys.find(wk => wk.userId === 'bob');
    if (!bobWrappedKey) {
      log('access-output', 'Bob does not have access to this document!', 'error');
      return;
    }
    
    // Unwrap the key
    log('access-output', 'Unwrapping document key with Bob\'s private key...', 'info');
    const documentKey = await Crypto.unwrapKeyWithPGP(bobWrappedKey.wrappedKey, demoState.users.bob.privateKeyArmored);
    
    // Decrypt the document
    log('access-output', 'Decrypting document with unwrapped key...', 'info');
    const decryptedData = await Crypto.decryptDocument(demoState.document.encrypted, demoState.document.iv, documentKey);
    
    log('access-output', 'Bob successfully accessed the document! ✓', 'success');
    log('access-output', `Title: ${decryptedData.title}`, 'info');
    log('access-output', `Content: ${decryptedData.content}`, 'info');
    log('access-output', `Author: ${decryptedData.author}`, 'info');
    log('access-output', `Created: ${decryptedData.createdAt}`, 'info');
    
  } catch (error) {
    log('access-output', `Bob failed to access document: ${error.message}`, 'error');
  }
}

async function charlieAccessDocument() {
  if (!demoState.document) {
    log('access-output', 'No document to access!', 'error');
    return;
  }
  
  try {
    log('access-output', 'Charlie attempting to access document...', 'info');
    
    // Find Charlie's wrapped key
    const charlieWrappedKey = demoState.document.wrappedKeys.find(wk => wk.userId === 'charlie');
    if (!charlieWrappedKey) {
      log('access-output', 'Charlie does not have access to this document!', 'error');
      return;
    }
    
    // Unwrap the key
    log('access-output', 'Unwrapping document key with Charlie\'s private key...', 'info');
    const documentKey = await Crypto.unwrapKeyWithPGP(charlieWrappedKey.wrappedKey, demoState.users.charlie.privateKeyArmored);
    
    // Decrypt the document
    log('access-output', 'Decrypting document with unwrapped key...', 'info');
    const decryptedData = await Crypto.decryptDocument(demoState.document.encrypted, demoState.document.iv, documentKey);
    
    log('access-output', 'Charlie successfully accessed the document! ✓', 'success');
    log('access-output', `Title: ${decryptedData.title}`, 'info');
    log('access-output', `Content: ${decryptedData.content}`, 'info');
    log('access-output', `Author: ${decryptedData.author}`, 'info');
    log('access-output', `Created: ${decryptedData.createdAt}`, 'info');
    
  } catch (error) {
    log('access-output', `Charlie failed to access document: ${error.message}`, 'error');
  }
}

async function revokeCharlieAccess() {
  if (!demoState.document) {
    log('revoke-output', 'No document to revoke access from!', 'error');
    return;
  }
  
  try {
    log('revoke-output', 'Revoking Charlie\'s access...', 'info');
    
    // Remove Charlie's wrapped key (simulate revocation)
    const originalCount = demoState.document.wrappedKeys.length;
    demoState.document.wrappedKeys = demoState.document.wrappedKeys.filter(wk => wk.userId !== 'charlie');
    
    if (demoState.document.wrappedKeys.length < originalCount) {
      log('revoke-output', 'Charlie\'s access revoked successfully ✓', 'success');
      log('revoke-output', `Remaining recipients: ${demoState.document.wrappedKeys.map(wk => wk.userId).join(', ')}`, 'info');
      log('revoke-output', 'Charlie can no longer access the document.', 'info');
    } else {
      log('revoke-output', 'Charlie did not have access to revoke.', 'error');
    }
    
  } catch (error) {
    log('revoke-output', `Error revoking access: ${error.message}`, 'error');
  }
}

// Event listeners
el('generate-keys').addEventListener('click', generateKeys);
el('create-document').addEventListener('click', createAndShareDocument);
el('bob-access').addEventListener('click', bobAccessDocument);
el('charlie-access').addEventListener('click', charlieAccessDocument);
el('revoke-charlie').addEventListener('click', revokeCharlieAccess);

// Initial state - disable buttons until keys are generated
el('create-document').disabled = true;
el('bob-access').disabled = true;
el('charlie-access').disabled = true;
el('revoke-charlie').disabled = true;

// Log initial message
log('technical-output', 'Demo ready! Click "Generate Keys for Alice, Bob & Charlie" to start.', 'success');
