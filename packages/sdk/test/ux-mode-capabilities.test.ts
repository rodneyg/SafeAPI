import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SafeAPI } from '../src';

describe('UX mode capability documentation', () => {
  it('maps the existing SDK surface and names unsupported mode gaps', () => {
    const guide = readFileSync(new URL('../../../UX_MODES_GUIDE.md', import.meta.url), 'utf8');
    const source = readFileSync(new URL('../src/core/Keys.ts', import.meta.url), 'utf8');

    expect(SafeAPI).toBeDefined();
    for (const mode of ['User-managed', 'Shared responsibility', 'Developer-managed', 'API-managed']) {
      expect(guide).toContain(mode);
    }
    expect(guide).toContain('No server-side data encryption');
    expect(guide).toContain('not implemented');
    expect(source).toContain('backup not implemented');
    expect(source).toContain('restore not implemented');
  });
});
