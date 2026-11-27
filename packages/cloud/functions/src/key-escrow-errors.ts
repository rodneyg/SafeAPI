export type EscrowOperation = 'store' | 'recover';

export function validateEscrowInput(userId: unknown, encPrivKey?: unknown) {
  if (typeof userId !== 'string' || userId.trim().length === 0) {
    return { error: 'invalid_user_id', message: 'User ID is required and must be a non-empty string' };
  }
  if (encPrivKey !== undefined && (typeof encPrivKey !== 'string' || encPrivKey.trim().length === 0)) {
    return { error: 'invalid_encrypted_key', message: 'Encrypted private key is required and must be a non-empty string' };
  }
  return null;
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

export function handleEscrowError(res: any, error: unknown, operation: EscrowOperation) {
  const code = errorCode(error);
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  const isStore = operation === 'store';

  if (code === 'permission-denied') {
    return res.status(403).json({
      error: isStore ? 'escrow_storage_permission_denied' : 'escrow_recovery_permission_denied',
      message: isStore ? 'Insufficient permissions to store the encrypted key in escrow' : 'Insufficient permissions to retrieve the encrypted key from escrow'
    });
  }
  if (code === 'deadline-exceeded' || code === 'unavailable') {
    return res.status(503).json({ error: 'escrow_storage_unavailable', message: 'Key escrow storage is temporarily unavailable; please retry' });
  }
  if (isStore && (code === 'resource-exhausted' || message.includes('document too large') || message.includes('maximum size'))) {
    return res.status(413).json({ error: 'escrow_key_too_large', message: 'Encrypted private key exceeds the maximum storage size' });
  }
  return res.status(500).json({
    error: isStore ? 'escrow_storage_failed' : 'escrow_recovery_failed',
    message: isStore ? 'Failed to store the encrypted private key due to a backend error' : 'Failed to retrieve the encrypted private key due to a backend error'
  });
}
