import { describe, expect, it } from 'vitest';
import type { ConsentRecord } from '../src';

describe('ConsentRecord', () => {
  it('describes the fields returned in consent history', () => {
    const record: ConsentRecord = {
      subjectId: 'subject-1',
      type: 'analytics',
      granted: true,
      method: 'settings',
      ts: 1_700_000_000_000,
      sig: 'signature',
      projectId: 'project-1',
    };

    expect(record.granted).toBe(true);
  });
});
