import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AdapterError } from '@/lib/errors';

const MOCK_TOKEN = 'test-token-123';

const mockGetStats = vi.fn().mockResolvedValue({
  queue: 5,
  generating: 1,
  publishing: 0,
  published: 10,
  promoting: 2,
  completed: 8,
  error: 1,
});

vi.mock('@/lib/adapters', () => ({
  createAdapters: () => ({
    table: { getStats: mockGetStats },
  }),
}));

function createAuthRequest(): Request {
  return new Request('http://localhost/api/dashboard/stats', {
    headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
  });
}

function createUnauthRequest(): Request {
  return new Request('http://localhost/api/dashboard/stats');
}

beforeEach(() => {
  vi.stubEnv('SETUP_TOKEN', MOCK_TOKEN);
  mockGetStats.mockResolvedValue({
    queue: 5,
    generating: 1,
    publishing: 0,
    published: 10,
    promoting: 2,
    completed: 8,
    error: 1,
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('GET /api/dashboard/stats', () => {
  it('returns 401 without auth', async () => {
    const { GET } = await import('../stats/route');
    const res = await GET(createUnauthRequest());
    expect(res.status).toBe(401);
  });

  it('returns article counts by status', async () => {
    const { GET } = await import('../stats/route');
    const res = await GET(createAuthRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.queue).toBe(5);
    expect(body.data.published).toBe(10);
    expect(body.data.completed).toBe(8);
    expect(body.data.error).toBe(1);
  });

  it('returns 500 when getStats throws AdapterError', async () => {
    mockGetStats.mockRejectedValueOnce(
      new AdapterError('nocodb', 'getStats', 'Connection refused'),
    );

    const { GET } = await import('../stats/route');
    const res = await GET(createAuthRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.code).toBe('ADAPTER_ERROR');
  });
});
