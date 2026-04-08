import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    default: actual,
    readFile: vi.fn().mockResolvedValue('# Caddyfile content'),
  };
});

vi.mock('@/lib/caddy', () => ({
  getCaddyfilePath: vi.fn().mockReturnValue('/opt/openant/caddy/Caddyfile'),
}));

const mockReactivateWorkflows = vi.fn();
vi.mock('@/lib/adapters', () => ({
  createAdapters: () => ({
    automation: { reactivateWorkflows: mockReactivateWorkflows },
  }),
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const savedEnv = { ...process.env };

beforeEach(() => {
  mockExecAsync.mockReset();
  mockReactivateWorkflows.mockReset();
  mockFetch.mockReset();
  mockFetch.mockResolvedValue({ status: 200, ok: true });
  process.env.HOST_PROJECT_DIR = '/opt/openant';
  process.env.GHOST_INTERNAL_URL = 'http://ghost:2368';
  process.env.NOCODB_INTERNAL_URL = 'http://nocodb:8080';
  process.env.N8N_INTERNAL_URL = 'http://n8n:5678';
});

afterEach(() => {
  process.env = { ...savedEnv };
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

describe('restartServices', () => {
  it('runs docker compose up, waits for health, and reactivates workflows', async () => {
    mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });
    mockReactivateWorkflows.mockResolvedValueOnce(undefined);

    const { restartServices } = await import('../docker');
    await restartServices();

    expect(mockExecAsync).toHaveBeenCalledWith(
      expect.stringContaining('docker compose -f /opt/openant/docker-compose.yml up -d'),
      expect.objectContaining({ timeout: 120_000 }),
    );
    expect(mockFetch).toHaveBeenCalled();
    expect(mockReactivateWorkflows).toHaveBeenCalled();
  });

  it('falls back to docker restart when compose fails', async () => {
    mockExecAsync.mockRejectedValueOnce(new Error('compose not found'));
    mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });
    mockReactivateWorkflows.mockResolvedValueOnce(undefined);

    const { restartServices } = await import('../docker');
    await restartServices();

    expect(mockExecAsync).toHaveBeenCalledTimes(2);
    expect(mockExecAsync).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('docker restart'),
      expect.objectContaining({ timeout: 60_000 }),
    );
  });

  it('throws AdapterError when both compose and restart fail', async () => {
    mockExecAsync.mockRejectedValueOnce(new Error('compose not found'));
    mockExecAsync.mockRejectedValueOnce(new Error('restart failed'));

    const { restartServices } = await import('../docker');

    try {
      await restartServices();
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterError);
      expect((error as AdapterError).adapter).toBe('docker');
      expect((error as AdapterError).operation).toBe('restart');
    }
  });

  it('silently catches reactivate failure (best-effort)', async () => {
    mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });
    mockReactivateWorkflows.mockRejectedValueOnce(new Error('webhook fail'));

    const { restartServices } = await import('../docker');
    await expect(restartServices()).resolves.toBeUndefined();
  });
});

describe('updateAndRestart', () => {
  it('runs git pull, build, recreate, restart, waits for health, and reactivates', async () => {
    // git pull
    mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });
    // compose build wizard
    mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });
    // compose up wizard (recreate)
    mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });
    // docker restart
    mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });
    mockReactivateWorkflows.mockResolvedValueOnce(undefined);

    const { updateAndRestart } = await import('../docker');
    await updateAndRestart();

    expect(mockExecAsync).toHaveBeenCalledTimes(4);
    expect(mockExecAsync).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('alpine/git pull origin main'),
      expect.objectContaining({ timeout: 60_000 }),
    );
    expect(mockExecAsync).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('docker compose build wizard'),
      expect.objectContaining({ timeout: 180_000 }),
    );
    expect(mockExecAsync).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('docker compose up -d wizard'),
      expect.objectContaining({ timeout: 60_000 }),
    );
    expect(mockExecAsync).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('docker restart'),
      expect.objectContaining({ timeout: 60_000 }),
    );
    expect(mockFetch).toHaveBeenCalled();
    expect(mockReactivateWorkflows).toHaveBeenCalled();
  });

  it('throws AdapterError when git pull fails', async () => {
    mockExecAsync.mockRejectedValueOnce(new Error('git pull failed'));

    const { updateAndRestart } = await import('../docker');

    try {
      await updateAndRestart();
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterError);
      expect((error as AdapterError).adapter).toBe('docker');
      expect((error as AdapterError).operation).toBe('update');
      expect((error as AdapterError).message).toContain('pull latest code');
    }
  });

  it('throws AdapterError when build fails', async () => {
    mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' }); // git pull ok
    mockExecAsync.mockRejectedValueOnce(new Error('build failed'));

    const { updateAndRestart } = await import('../docker');

    try {
      await updateAndRestart();
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterError);
      expect((error as AdapterError).adapter).toBe('docker');
      expect((error as AdapterError).operation).toBe('update');
      expect((error as AdapterError).message).toContain('rebuild wizard');
    }
  });

  it('throws AdapterError when restart fails', async () => {
    mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' }); // git pull
    mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' }); // build
    mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' }); // recreate
    mockExecAsync.mockRejectedValueOnce(new Error('restart failed'));

    const { updateAndRestart } = await import('../docker');

    try {
      await updateAndRestart();
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterError);
      expect((error as AdapterError).adapter).toBe('docker');
      expect((error as AdapterError).operation).toBe('update');
      expect((error as AdapterError).message).toContain('restart containers');
    }
  });
});

describe('startServices', () => {
  it('runs docker compose up, waits for health, and reactivates workflows', async () => {
    mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });
    mockReactivateWorkflows.mockResolvedValueOnce(undefined);

    const { startServices } = await import('../docker');
    await startServices();

    expect(mockExecAsync).toHaveBeenCalledWith(
      expect.stringContaining('docker compose -f /opt/openant/docker-compose.yml up -d'),
      expect.objectContaining({ timeout: 120_000 }),
    );
    expect(mockFetch).toHaveBeenCalled();
    expect(mockReactivateWorkflows).toHaveBeenCalled();
  });

  it('silently handles compose failure and still checks health', async () => {
    mockExecAsync.mockRejectedValueOnce(new Error('compose not available'));
    mockReactivateWorkflows.mockResolvedValueOnce(undefined);

    const { startServices } = await import('../docker');
    await expect(startServices()).resolves.toBeUndefined();

    expect(mockFetch).toHaveBeenCalled();
  });
});
