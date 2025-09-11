import { generateKeyPair } from '../crypto/openpgp';
import type { KeyPair } from '../types';

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

  async backup(method: 'phrase' | 'webauthn' | 'file'): Promise<void> {
    // Stub: implement according to chosen method
    console.warn('backup not implemented; method=', method);
  }

  async restore(_params: any): Promise<void> {
    console.warn('restore not implemented');
  }
}

