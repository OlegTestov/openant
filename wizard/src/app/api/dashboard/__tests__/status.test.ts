import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const MOCK_TOKEN = 'test-token-123';

const mockBlogHealthCheck = vi.fn().mockResolvedValue(true);
const mockTableHealthCheck = vi.fn().mockResolvedValue(true);
const mockAutomationHealthCheck = vi.fn().mockResolvedValue(true);

vi.mock('@/lib/adapters', () => ({
  createAdapters: () => ({
    blog: { healthCheck: mockBlogHealthCheck },
    table: { healthCheck: mockTableHealthCheck },
    automation: { healthCheck: mockAutomationHealthCheck },
  }),
}));

vi.mock('@/lib/config', () => ({
  readEnv: vi.fn().mockResolvedValue({}),
}));

function createAuthRequest(): Request {
  return new Request('http://localhost/api/dashboard/status', {
    headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
  });
}

function createUnauthRequest(): Request {
  return new Request('http://localhost/api/dashboard/status');
}

// Save original fetch to restore later
const originalFetch = global.fetch;

beforeEach(() => {
  vi.stubEnv('SETUP_TOKEN', MOCK_TOKEN);
  mockBlogHealthCheck.mockResolvedValue(true);
  mockTableHealthCheck.mockResolvedValue(true);
  mockAutomationHealthCheck.mockResolvedValue(true);

  // Mock fetch for Caddy health check
  global.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
    const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    if (urlStr.includes('caddy:80')) {
      return Promise.resolve({ ok: true, status: 200 });
    }
    return originalFetch(url);
  }) as typeof fetch;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  global.fetch = originalFetch;
});

describe('GET /api/dashboard/status', () => {
  it('returns 401 without auth token', async () => {
    const { GET } = await import('../status/route');
    const res = await GET(createUnauthRequest());
    expect(res.status).toBe(401);
  });

  it('returns health status for all services', async () => {
    const { GET } = await import('../status/route');
    const res = await GET(createAuthRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.ghost).toBe('healthy');
    expect(body.data.nocodb).toBe('healthy');
    expect(body.data.n8n).toBe('healthy');
    expect(body.data.caddy).toBe('healthy');
  });

  it('returns unhealthy when a service health check fails', async () => {
    mockBlogHealthCheck.mockRejectedValue(new Error('Connection refused'));
    mockTableHealthCheck.mockResolvedValue(false);

    const { GET } = await import('../status/route');
    const res = await GET(createAuthRequest());
    const body = await res.json();

    expect(body.data.ghost).toBe('unhealthy');
    expect(body.data.nocodb).toBe('unhealthy');
    expect(body.data.n8n).toBe('healthy');
  });

  it('returns unhealthy caddy when fetch fails', async () => {
    global.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      if (urlStr.includes('caddy:80')) {
        return Promise.reject(new Error('Network error'));
      }
      return originalFetch(url);
    }) as typeof fetch;

    const { GET } = await import('../status/route');
    const res = await GET(createAuthRequest());
    const body = await res.json();

    expect(body.data.caddy).toBe('unhealthy');
  });

  it('returns domain-based URLs when DOMAIN is set', async () => {
    const { readEnv } = await import('@/lib/config');
    vi.mocked(readEnv).mockResolvedValueOnce({ DOMAIN: 'example.com' });

    const { GET } = await import('../status/route');
    const res = await GET(createAuthRequest());
    const body = await res.json();

    expect(body.data.urls.blog).toBe('https://example.com');
    expect(body.data.urls.table).toBe('https://table.example.com');
    expect(body.data.urls.n8n).toBe('https://auto.example.com');
  });

  it('returns IP-based URLs when no DOMAIN', async () => {
    vi.stubEnv('SERVER_IP', '1.2.3.4');

    const { GET } = await import('../status/route');
    const res = await GET(createAuthRequest());
    const body = await res.json();

    expect(body.data.urls.blog).toBe('http://1.2.3.4');
    expect(body.data.urls.table).toBe('http://1.2.3.4:8080');
    expect(body.data.urls.n8n).toBe('http://1.2.3.4:5678');
  });

  it('returns saas_mode true when OPENANT_SAAS_MODE is set', async () => {
    vi.stubEnv('OPENANT_SAAS_MODE', 'true');

    const { GET } = await import('../status/route');
    const res = await GET(createAuthRequest());
    const body = await res.json();

    expect(body.data.saas_mode).toBe(true);
  });

  it('returns saas_mode false when OPENANT_SAAS_MODE is not set', async () => {
    const { GET } = await import('../status/route');
    const res = await GET(createAuthRequest());
    const body = await res.json();

    expect(body.data.saas_mode).toBe(false);
  });

  it('returns service credentials computed from SETUP_TOKEN', async () => {
    const { GET } = await import('../status/route');
    const res = await GET(createAuthRequest());
    const body = await res.json();

    expect(body.data.credentials).toBeDefined();
    expect(body.data.credentials.ghost).toHaveProperty('email');
    expect(body.data.credentials.ghost).toHaveProperty('password');
    expect(body.data.credentials.ghost).toHaveProperty('adminUrl');
    expect(body.data.credentials.nocodb).toHaveProperty('email');
    expect(body.data.credentials.nocodb).toHaveProperty('password');
    expect(body.data.credentials.n8n).toHaveProperty('email');
    expect(body.data.credentials.n8n).toHaveProperty('password');
  });

  it('handles Caddy 404 as healthy', async () => {
    global.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
      const urlStr = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
      if (urlStr.includes('caddy:80')) {
        return Promise.resolve({ ok: false, status: 404 });
      }
      return originalFetch(url);
    }) as typeof fetch;

    const { GET } = await import('../status/route');
    const res = await GET(createAuthRequest());
    const body = await res.json();

    expect(body.data.caddy).toBe('healthy');
  });
});
