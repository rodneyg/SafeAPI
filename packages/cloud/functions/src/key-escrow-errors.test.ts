import { describe, expect, it, vi } from 'vitest';
import { handleEscrowError, validateEscrowInput } from './key-escrow-errors';

describe('key escrow error responses', () => {
  it('rejects missing or empty user IDs', () => {
    expect(validateEscrowInput('', 'encrypted')).toEqual({ error: 'invalid_user_id', message: 'User ID is required and must be a non-empty string' });
    expect(validateEscrowInput(7, 'encrypted')).toEqual({ error: 'invalid_user_id', message: 'User ID is required and must be a non-empty string' });
  });

  it('rejects missing or empty encrypted key data', () => {
    expect(validateEscrowInput('user', ' ')).toEqual({ error: 'invalid_encrypted_key', message: 'Encrypted private key is required and must be a non-empty string' });
  });

  it.each([
    ['permission-denied', 403, 'escrow_storage_permission_denied'],
    ['unavailable', 503, 'escrow_storage_unavailable'],
    ['resource-exhausted', 413, 'escrow_key_too_large'],
    ['internal', 500, 'escrow_storage_failed']
  ])('maps store failure %s to a safe diagnostic', (code, status, error) => {
    const res = responseMock();
    handleEscrowError(res as never, { code, message: 'secret data must not leak' }, 'store');
    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error }));
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('secret data');
  });

  it('identifies recovery failures separately', () => {
    const res = responseMock();
    handleEscrowError(res as never, { code: 'internal' }, 'recover');
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ error: 'escrow_recovery_failed', message: 'Failed to retrieve the encrypted private key due to a backend error' });
  });
});

function responseMock() {
  const res: any = { status: vi.fn(), json: vi.fn() };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}
