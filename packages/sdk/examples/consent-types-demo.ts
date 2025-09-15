/**
 * Demo showing improved type safety for consent records in audit logs
 * This example demonstrates how the new TypeScript interfaces catch
 * type mismatches early during development.
 */

import type { ConsentRecord, AuditLogEntry } from '../src/types';

// Example: Creating a properly typed consent record
function createConsentRecord(subjectId: string, type: string, granted: boolean): Omit<ConsentRecord, 'id' | 'ts' | 'sig' | 'projectId'> {
  return {
    subjectId,
    type,
    granted,
    method: 'web_form', // TypeScript ensures this is a string
    meta: {
      userAgent: 'Mozilla/5.0...',
      ipAddress: '192.168.1.1',
      source: 'privacy_center'
    }
  };
}

// Example: Creating a properly typed audit log entry
function createAuditEntry(action: 'WRITE' | 'READ' | 'UPDATE' | 'DELETE', resourceType: string, resourceId?: string): Omit<AuditLogEntry, 'id' | 'ts' | 'sig' | 'projectId'> {
  return {
    action, // TypeScript ensures this is one of the allowed values
    resource: {
      type: resourceType,
      id: resourceId
    },
    meta: {
      correlationId: 'req-123',
      userId: 'user-456'
    }
  };
}

// Example usage that demonstrates type safety
const consentData = createConsentRecord('user-123', 'marketing', true);
const auditData = createAuditEntry('WRITE', 'consent_record', 'consent-456');

console.log('Consent record structure:', consentData);
console.log('Audit entry structure:', auditData);

// The following would cause TypeScript compilation errors:
// createAuditEntry('INVALID_ACTION', 'document'); // Error: not assignable to action type
// createConsentRecord('user', 'type', 'invalid'); // Error: boolean expected for granted

export { createConsentRecord, createAuditEntry };