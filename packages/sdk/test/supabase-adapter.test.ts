import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('SupabaseAdapter documentation', () => {
  it('suggests timestamp indexes for audit and consent record queries', () => {
    const source = readFileSync(new URL('../src/adapters/SupabaseAdapter.ts', import.meta.url), 'utf8');

    expect(source).toContain('audit log queries ordered by timestamp');
    expect(source).toContain('`ts DESC`');
    expect(source).toContain('index to the corresponding audit table');
    expect(source).toContain('consent records');
    expect(source).toContain('when queries sort those records by timestamp');
  });
});
