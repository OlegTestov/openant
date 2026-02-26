import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SetupState } from '@/types/setup';

const MOCK_TOKEN = 'test-token-123';

const DEFAULT_STATE: SetupState = {
  currentStep: 'welcome',
  deployed: false,
  steps: {
    welcome: { completed: false },
    domain: { completed: false },
    llm: { completed: false },
    blog: { completed: false },
    social: { completed: false },
    review: { completed: false },
    deploy: { completed: false },
  },
};

let mockState: SetupState;

vi.mock('@/lib/state', () => ({
  readState: vi.fn(() => Promise.resolve({ ...mockState, steps: { ...mockState.steps } })),
  writeState: vi.fn(() => Promise.resolve()),
}));

function createRequest(body: unknown): Request {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${MOCK_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
}

function createUnauthRequest(body: unknown): Request {
  return new Request('http://localhost/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.stubEnv('SETUP_TOKEN', MOCK_TOKEN);
  mockState = { ...DEFAULT_STATE, steps: { ...DEFAULT_STATE.steps } };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/setup/welcome', () => {
  it('returns 200 and updates state on valid input', async () => {
    const { POST } = await import('../welcome/route');
    const { writeState } = await import('@/lib/state');

    const res = await POST(createRequest({ language: 'en' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(writeState).toHaveBeenCalledWith(
      expect.objectContaining({
        welcome: { language: 'en' },
        currentStep: 'domain',
        steps: expect.objectContaining({ welcome: { completed: true } }),
      }),
    );
  });

  it('returns 400 on invalid input', async () => {
    const { POST } = await import('../welcome/route');

    const res = await POST(createRequest({ language: 'xx' }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
  });

  it('returns 401 without auth token', async () => {
    const { POST } = await import('../welcome/route');

    const res = await POST(createUnauthRequest({ language: 'en' }));

    expect(res.status).toBe(401);
  });

  it('sets currentStep to "domain" after completion', async () => {
    const { POST } = await import('../welcome/route');
    const { writeState } = await import('@/lib/state');

    await POST(createRequest({ language: 'ru' }));

    expect(writeState).toHaveBeenCalledWith(expect.objectContaining({ currentStep: 'domain' }));
  });

  it('does not overwrite other state sections', async () => {
    const { readState } = await import('@/lib/state');
    const { writeState } = await import('@/lib/state');

    mockState = {
      ...DEFAULT_STATE,
      steps: { ...DEFAULT_STATE.steps },
      domain: { use_domain: false },
    };
    vi.mocked(readState).mockResolvedValueOnce({
      ...mockState,
      steps: { ...mockState.steps },
    });

    const { POST } = await import('../welcome/route');
    await POST(createRequest({ language: 'en' }));

    expect(writeState).toHaveBeenCalledWith(
      expect.objectContaining({
        domain: { use_domain: false },
      }),
    );
  });
});

describe('POST /api/setup/domain', () => {
  it('returns 200 with dns_check on use_domain=true', async () => {
    vi.stubEnv('SERVER_IP', '1.2.3.4');

    // Mock dns.resolve4 at module level
    vi.doMock('dns/promises', () => ({
      default: { resolve4: vi.fn().mockResolvedValue(['1.2.3.4']) },
      resolve4: vi.fn().mockResolvedValue(['1.2.3.4']),
    }));

    // Re-import to pick up the mock
    const { POST } = await import('../domain/route');
    const res = await POST(createRequest({ use_domain: true, domain: 'example.com' }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.dns_check).toEqual({
      resolved: true,
      ip: '1.2.3.4',
      matches_server: true,
    });
  });

  it('returns 200 without dns_check on use_domain=false', async () => {
    vi.stubEnv('SERVER_IP', '1.2.3.4');

    const { POST } = await import('../domain/route');
    const res = await POST(createRequest({ use_domain: false }));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.dns_check).toBeUndefined();
  });

  it('returns 400 when use_domain=true without domain', async () => {
    const { POST } = await import('../domain/route');
    const res = await POST(createRequest({ use_domain: true }));

    expect(res.status).toBe(400);
  });

  it('sets currentStep to "llm"', async () => {
    vi.stubEnv('SERVER_IP', '1.2.3.4');
    const { writeState } = await import('@/lib/state');

    const { POST } = await import('../domain/route');
    await POST(createRequest({ use_domain: false }));

    expect(writeState).toHaveBeenCalledWith(expect.objectContaining({ currentStep: 'llm' }));
  });
});

describe('POST /api/setup/llm', () => {
  it('returns 200 with test_result on valid input', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          choices: [{ message: { content: 'ok' } }],
        }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { POST } = await import('../llm/route');
    const res = await POST(
      createRequest({
        provider: 'openai',
        api_url: 'https://api.openai.com/v1',
        api_key: 'sk-test',
        model: 'gpt-4o-mini',
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.test_result.connected).toBe(true);
  });

  it('returns test_result with error on failed connection', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });
    vi.stubGlobal('fetch', mockFetch);

    const { POST } = await import('../llm/route');
    const res = await POST(
      createRequest({
        provider: 'openai',
        api_url: 'https://api.openai.com/v1',
        api_key: 'wrong-key',
        model: 'gpt-4o-mini',
      }),
    );
    const body = await res.json();

    expect(body.success).toBe(true);
    expect(body.data.test_result.connected).toBe(false);
    expect(body.data.test_result.error).toContain('401');
  });

  it('returns 400 on invalid api_url', async () => {
    const { POST } = await import('../llm/route');
    const res = await POST(
      createRequest({
        provider: 'openai',
        api_url: 'not-url',
        api_key: 'sk-test',
        model: 'gpt-4o-mini',
      }),
    );

    expect(res.status).toBe(400);
  });

  it('sets currentStep to "blog"', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'ok' } }] }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const { writeState } = await import('@/lib/state');
    const { POST } = await import('../llm/route');
    await POST(
      createRequest({
        provider: 'openai',
        api_url: 'https://api.openai.com/v1',
        api_key: 'sk-test',
        model: 'gpt-4o-mini',
      }),
    );

    expect(writeState).toHaveBeenCalledWith(expect.objectContaining({ currentStep: 'blog' }));
  });
});

describe('POST /api/setup/blog', () => {
  it('returns 200 on valid input', async () => {
    const { POST } = await import('../blog/route');
    const res = await POST(
      createRequest({
        title: 'My Blog',
        language: 'en',
        tone: 'professional',
        publish_interval_minutes: 60,
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 400 on empty title', async () => {
    const { POST } = await import('../blog/route');
    const res = await POST(
      createRequest({
        title: '',
        language: 'en',
        tone: 'professional',
        publish_interval_minutes: 60,
      }),
    );

    expect(res.status).toBe(400);
  });

  it('sets currentStep to "social"', async () => {
    const { writeState } = await import('@/lib/state');
    const { POST } = await import('../blog/route');
    await POST(
      createRequest({
        title: 'Blog',
        language: 'en',
        tone: 'casual',
        publish_interval_minutes: 30,
      }),
    );

    expect(writeState).toHaveBeenCalledWith(expect.objectContaining({ currentStep: 'social' }));
  });
});

describe('POST /api/setup/social', () => {
  it('returns 200 with empty fields', async () => {
    const { POST } = await import('../social/route');
    const res = await POST(
      createRequest({
        make_webhook_url: '',
        pinterest_enabled: false,
        threads_enabled: false,
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 200 with webhook URL', async () => {
    const { POST } = await import('../social/route');
    const res = await POST(
      createRequest({
        make_webhook_url: 'https://hook.make.com/abc',
        pinterest_enabled: true,
        threads_enabled: true,
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 400 on invalid webhook URL', async () => {
    const { POST } = await import('../social/route');
    const res = await POST(
      createRequest({
        make_webhook_url: 'not-a-url',
        pinterest_enabled: false,
        threads_enabled: false,
      }),
    );

    expect(res.status).toBe(400);
  });

  it('sets currentStep to "review"', async () => {
    const { writeState } = await import('@/lib/state');
    const { POST } = await import('../social/route');
    await POST(
      createRequest({
        make_webhook_url: '',
        pinterest_enabled: false,
        threads_enabled: false,
      }),
    );

    expect(writeState).toHaveBeenCalledWith(expect.objectContaining({ currentStep: 'review' }));
  });
});
