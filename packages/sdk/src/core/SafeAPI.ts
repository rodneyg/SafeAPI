import type { EncryptionMode, SafeAPIConfig, StorageAdapter } from '../types';
import { Keys } from './Keys';
import { DataCore } from './Data';
import { AnonCore } from './Anon';
import { AuditCore } from './Audit';
import { ConsentCore } from './Consent';
import { ExportCore } from './Export';
import { ShareCore } from './Share';
import { CloudClient } from '../cloud/client';

export class SafeAPI {
  private cfg: SafeAPIConfig;
  private cloudClient?: CloudClient;

  keys: Keys;
  data: DataCore;
  anon: AnonCore;
  share: ShareCore;
  audit: AuditCore;
  consent: ConsentCore;
  export: ExportCore;

  constructor(cfg: SafeAPIConfig) {
    this.cfg = cfg;
    const defaults = cfg.defaults || { encryption: 'document' as EncryptionMode };
    if (cfg.cloud) this.cloudClient = new CloudClient({ endpoint: cfg.cloud.endpoint, apiKey: cfg.cloud.apiKey });
    this.keys = new Keys({ keystore: cfg.crypto?.keystore || 'memory' });
    this.data = new DataCore(cfg.storage as StorageAdapter, { encryption: defaults.encryption });
    this.anon = new AnonCore(cfg.storage);
    this.share = new ShareCore(this.cloudClient);
    this.audit = new AuditCore(this.cloudClient);
    this.consent = new ConsentCore(this.cloudClient);
    this.export = new ExportCore(cfg.storage);
  }

  async init(): Promise<void> {
    if (this.cloudClient) await this.cloudClient.exchangeToken().catch(() => {});
    await this.keys.ensure();
  }
}

