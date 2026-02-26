import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdapterError } from '@/lib/errors';

const mockExecAsync = vi.fn();

vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...(actual as object), default: actual };
});

vi.mock('util', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    default: { ...(actual as object), promisify: () => mockExecAsync },
    promisify: () => mockExecAsync,
  };
});

beforeEach(() => {
  mockExecAsync.mockReset();
});

describe('reloadCaddy', () => {
  it('executes docker exec command', async () => {
    mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

    const { reloadCaddy } = await import('../docker');
    await reloadCaddy();

    expect(mockExecAsync).toHaveBeenCalledWith(
      'docker exec openant-caddy caddy reload --config /etc/caddy/Caddyfile',
    );
  });

  it('throws AdapterError when command fails', async () => {
    mockExecAsync.mockRejectedValueOnce(new Error('permission denied'));

    const { reloadCaddy } = await import('../docker');

    try {
      await reloadCaddy();
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterError);
      expect((error as AdapterError).adapter).toBe('caddy');
      expect((error as AdapterError).operation).toBe('reload');
    }
  });

  it('skips gracefully when container not found (local dev)', async () => {
    mockExecAsync.mockRejectedValueOnce(new Error('No such container: openant-caddy'));

    const { reloadCaddy } = await import('../docker');
    await expect(reloadCaddy()).resolves.toBeUndefined();
  });
});
