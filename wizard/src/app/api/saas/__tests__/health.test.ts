import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ArticleStatus } from '@/lib/adapters/types';

const mockBlogHealthCheck = vi.fn().mockResolvedValue(true);
const mockTableHealthCheck = vi.fn().mockResolvedValue(true);
const mockAutomationHealthCheck = vi.fn().mockResolvedValue(true);
const mockGetStats = vi.fn().mockResolvedValue({
  queue: 3,
  draft: 0,
  generating: 0,
  publishing: 0,
  published: 5,
  promoting: 0,
  completed: 2,
  error: 1,
} satisfies Record<ArticleStatus, number>);

vi.mock('@/lib/adapters', () => ({
  createAdapters: () => ({
    blog: { healthCheck: mockBlogHealthCheck },
    table: { healthCheck: mockTableHealthCheck, getStats: mockGetStats },
    automation: { healthCheck: mockAutomationHealthCheck },
  }),
}));

const mockReadState = vi.fn().mockResolvedValue({
  currentStep: 'deploy',
  deployed: true,
  steps: {},
});

vi.mock('@/lib/state', () => ({
  readState: (...args: unknown[]) => mockReadState(...args),
}));

const mockGetEffectiveDomain = vi.fn().mockReturnValue(null);
const mockGetServiceDomains = vi.fn().mockReturnValue(null);

vi.mock('@/lib/domain', () => ({
  getEffectiveDomain: (...args: unknown[]) => mockGetEffectiveDomain(...args),
  getServiceDomains: (...args: unknown[]) => mockGetServiceDomains(...args),
}));

function createRequest(): Request {
  return new Request('http://localhost/api/saas/health');
}

beforeEach(() => {
  mockBlogHealthCheck.mockResolvedValue(true);
  mockTableHealthCheck.mockResolvedValue(true);
  mockAutomationHealthCheck.mockResolvedValue(true);
  mockGetStats.mockResolvedValue({
    queue: 3,
    generating: 0,
    publishing: 0,
    published: 5,
    promoting: 0,
    completed: 2,
    error: 1,
  });
  mockReadState.mockResolvedValue({ currentStep: 'deploy', deployed: true, steps: {} });
  mockGetEffectiveDomain.mockReturnValue(null);
  mockGetServiceDomains.mockReturnValue(null);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('GET /api/saas/health', () => {
  it('returns 404 when OPENANT_SAAS_MODE is not set', async () => {
    const { GET } = await import('../health/route');
    const res = await GET(createRequest());

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('SaaS mode not enabled');
  });

  it('returns 404 when OPENANT_SAAS_MODE is false', async () => {
    vi.stubEnv('OPENANT_SAAS_MODE', 'false');

    const { GET } = await import('../health/route');
    const res = await GET(createRequest());

    expect(res.status).toBe(404);
  });

  it('returns combined health and stats when SaaS mode is active', async () => {
    vi.stubEnv('OPENANT_SAAS_MODE', 'true');

    const { GET } = await import('../health/route');
    const res = await GET(createRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.wizard).toBe('healthy');
    expect(body.ghost).toBe('healthy');
    expect(body.nocodb).toBe('healthy');
    expect(body.n8n).toBe('healthy');
    expect(body.stats).toEqual({
      articles_queue: 3,
      articles_published: 5,
      articles_completed: 2,
      articles_error: 1,
    });
    expect(body.effective_domain).toBeNull();
    expect(body.service_domains).toBeNull();
  });

  it('includes effective_domain and service_domains when custom domain is configured', async () => {
    vi.stubEnv('OPENANT_SAAS_MODE', 'true');
    mockGetEffectiveDomain.mockReturnValue('example.com');
    mockGetServiceDomains.mockReturnValue({
      ghost: 'blog.example.com',
      nocodb: 'table.example.com',
      n8n: 'auto.example.com',
      wizard: 'setup.example.com',
    });

    const { GET } = await import('../health/route');
    const res = await GET(createRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.effective_domain).toBe('example.com');
    expect(body.service_domains).toEqual({
      ghost: 'blog.example.com',
      nocodb: 'table.example.com',
      n8n: 'auto.example.com',
    });
  });

  it('handles adapter failures gracefully', async () => {
    vi.stubEnv('OPENANT_SAAS_MODE', 'true');
    mockBlogHealthCheck.mockRejectedValue(new Error('Connection refused'));
    mockGetStats.mockRejectedValue(new Error('DB down'));

    const { GET } = await import('../health/route');
    const res = await GET(createRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ghost).toBe('unhealthy');
    expect(body.nocodb).toBe('healthy');
    expect(body.stats).toBeNull();
  });

  it('does not require auth', async () => {
    vi.stubEnv('OPENANT_SAAS_MODE', 'true');

    const { GET } = await import('../health/route');
    // Request without any Authorization header
    const res = await GET(createRequest());

    expect(res.status).toBe(200);
  });
});
