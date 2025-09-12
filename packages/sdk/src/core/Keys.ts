import { generateKeyPair, encryptJsonAesGcm, decryptJsonAesGcm } from '../crypto/openpgp';
import type { KeyPair } from '../types';

export interface KeyBackupOptions {
  method: 'phrase' | 'webauthn' | 'file';
  passphrase?: string;
  metadata?: Record<string, any>;
}

export interface KeyRecoveryOptions {
  method: 'phrase' | 'webauthn' | 'file';
  passphrase?: string;
  backupData?: any;
}

export class Keys {
  private cached?: KeyPair;
  private keystore: 'indexeddb' | 'memory';

  constructor(opts?: { keystore?: 'indexeddb' | 'memory' }) {
    this.keystore = opts?.keystore || 'memory';
  }

  async ensure(): Promise<KeyPair> {
    if (this.cached) return this.cached;
    // TODO: load from IndexedDB when keystore==='indexeddb'
    const kp = await generateKeyPair();
    this.cached = kp;
    return kp;
  }

  async rotate(): Promise<void> {
    this.cached = await generateKeyPair();
  }

  async backup(options: KeyBackupOptions): Promise<{ backupData: any; success: boolean }> {
    if (!this.cached) throw new Error('No keys to backup');
    
    const { method, passphrase, metadata } = options;
    
    try {
      let backupData: any;
      
      switch (method) {
        case 'phrase':
          if (!passphrase) throw new Error('Passphrase required for phrase backup');
          // Encrypt private key with passphrase
          const { encrypted } = await encryptJsonAesGcm(
            { privateKey: this.cached.privateKeyArmored, metadata },
            await this.deriveKeyFromPassphrase(passphrase)
          );
          backupData = {
            method: 'phrase',
            encryptedPrivateKey: Array.from(encrypted),
            publicKey: this.cached.publicKeyArmored,
            createdAt: Date.now()
          };
          break;
          
        case 'file':
          backupData = {
            method: 'file',
            privateKey: this.cached.privateKeyArmored,
            publicKey: this.cached.publicKeyArmored,
            metadata,
            createdAt: Date.now()
          };
          break;
          
        case 'webauthn':
          // Placeholder for WebAuthn implementation
          backupData = {
            method: 'webauthn',
            publicKey: this.cached.publicKeyArmored,
            metadata,
            createdAt: Date.now()
          };
          console.warn('WebAuthn backup not fully implemented');
          break;
          
        default:
          throw new Error(`Unsupported backup method: ${method}`);
      }
      
      return { backupData, success: true };
    } catch (error) {
      console.error('Backup failed:', error);
      return { backupData: null, success: false };
    }
  }

  async restore(options: KeyRecoveryOptions): Promise<{ success: boolean; keyPair?: KeyPair }> {
    const { method, passphrase, backupData } = options;
    
    try {
      let keyPair: KeyPair;
      
      switch (method) {
        case 'phrase':
          if (!passphrase || !backupData?.encryptedPrivateKey) {
            throw new Error('Passphrase and backup data required for phrase recovery');
          }
          const key = await this.deriveKeyFromPassphrase(passphrase);
          const encrypted = new Uint8Array(backupData.encryptedPrivateKey);
          const decrypted = await decryptJsonAesGcm(encrypted, key);
          keyPair = {
            privateKeyArmored: decrypted.privateKey,
            publicKeyArmored: backupData.publicKey
          };
          break;
          
        case 'file':
          if (!backupData?.privateKey || !backupData?.publicKey) {
            throw new Error('Invalid file backup data');
          }
          keyPair = {
            privateKeyArmored: backupData.privateKey,
            publicKeyArmored: backupData.publicKey
          };
          break;
          
        case 'webauthn':
          throw new Error('WebAuthn recovery not yet implemented');
          
        default:
          throw new Error(`Unsupported recovery method: ${method}`);
      }
      
      this.cached = keyPair;
      return { success: true, keyPair };
    } catch (error) {
      console.error('Recovery failed:', error);
      return { success: false };
    }
  }

  async export(format: 'armored' | 'json' = 'armored'): Promise<string> {
    if (!this.cached) throw new Error('No keys to export');
    
    if (format === 'armored') {
      return this.cached.privateKeyArmored;
    } else {
      return JSON.stringify({
        privateKey: this.cached.privateKeyArmored,
        publicKey: this.cached.publicKeyArmored,
        exportedAt: Date.now()
      }, null, 2);
    }
  }

  async import(keyData: string, format: 'armored' | 'json' = 'armored'): Promise<void> {
    try {
      let keyPair: KeyPair;
      
      if (format === 'armored') {
        // Assume it's a private key, derive public key
        keyPair = {
          privateKeyArmored: keyData,
          publicKeyArmored: '' // TODO: derive from private key
        };
      } else {
        const parsed = JSON.parse(keyData);
        keyPair = {
          privateKeyArmored: parsed.privateKey,
          publicKeyArmored: parsed.publicKey
        };
      }
      
      this.cached = keyPair;
    } catch (error) {
      throw new Error(`Failed to import keys: ${error}`);
    }
  }

  private async deriveKeyFromPassphrase(passphrase: string): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const data = encoder.encode(passphrase);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  }
}

