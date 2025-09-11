// Minimal REST client for SafeAPI Cloud
import { request } from 'undici';

export interface CloudConfig {
  endpoint: string;
  apiKey?: string; // used for token exchange
  projectToken?: string; // bearer token after exchange
}

export class CloudClient {
  private cfg: CloudConfig;
  constructor(cfg: CloudConfig) {
    this.cfg = cfg;
  }

  async exchangeToken(): Promise<{ token: string; expiresAt: string }> {
    const url = new URL('/v1/auth/token', this.cfg.endpoint).toString();
    const res = await request(url, { method: 'POST', headers: { 'x-api-key': this.cfg.apiKey || '' } });
    const body = (await res.body.json()) as any;
    this.cfg.projectToken = body.token;
    return body;
  }

  private authHeaders() {
    return this.cfg.projectToken ? { Authorization: `Bearer ${this.cfg.projectToken}` } : {};
  }

  async get<T = any>(path: string): Promise<T> {
    const url = new URL(path, this.cfg.endpoint).toString();
    const res = await request(url, { method: 'GET', headers: { ...this.authHeaders() } });
    return (await res.body.json()) as T;
  }

  async post<T = any>(path: string, body?: any): Promise<T> {
    const url = new URL(path, this.cfg.endpoint).toString();
    const res = await request(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...this.authHeaders() },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.statusCode === 204) return undefined as unknown as T;
    return (await res.body.json()) as T;
  }
}

