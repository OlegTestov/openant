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

vi.mock('@/lib/buffer', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    fetchBufferChannels: vi.fn(() => Promise.resolve([])),
  };
});

// Mirrors the real getServerIp (env first), but never hits the network
vi.mock('@/lib/server-ip', () => ({
  getServerIp: vi.fn(() => Promise.resolve(process.env.SERVER_IP || '203.0.113.5')),
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

  it('clamps publish_interval_minutes below 60 to 60 in saved state', async () => {
    const { writeState } = await import('@/lib/state');
    const { POST } = await import('../blog/route');
    const res = await POST(
      createRequest({
        title: 'Blog',
        language: 'en',
        tone: 'professional',
        publish_interval_minutes: 30,
      }),
    );

    expect(res.status).toBe(200);
    expect(writeState).toHaveBeenCalledWith(
      expect.objectContaining({
        blog: expect.objectContaining({ publish_interval_minutes: 60 }),
      }),
    );
  });

  it('clamps publish_interval_minutes above 10080 to 10080 in saved state', async () => {
    const { writeState } = await import('@/lib/state');
    const { POST } = await import('../blog/route');
    const res = await POST(
      createRequest({
        title: 'Blog',
        language: 'en',
        tone: 'professional',
        publish_interval_minutes: 99999,
      }),
    );

    expect(res.status).toBe(200);
    expect(writeState).toHaveBeenCalledWith(
      expect.objectContaining({
        blog: expect.objectContaining({ publish_interval_minutes: 10080 }),
      }),
    );
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
        board: 'My Pins',
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  const BUFFER_CHANNELS = [
    {
      id: 'ch-pin',
      service: 'pinterest',
      name: 'My Pinterest',
      boards: [{ serviceId: 'b1', name: 'Board One' }],
    },
    { id: 'ch-ig', service: 'instagram', name: 'My IG', boards: [] },
  ];

  it('returns 200 with valid Buffer config and clears Make fields', async () => {
    const { fetchBufferChannels } = await import('@/lib/buffer');
    vi.mocked(fetchBufferChannels).mockResolvedValueOnce(BUFFER_CHANNELS);
    const { writeState } = await import('@/lib/state');
    const { POST } = await import('../social/route');
    const res = await POST(
      createRequest({
        make_webhook_url: '',
        pinterest_enabled: true,
        threads_enabled: false,
        instagram_enabled: true,
        buffer_api_key: '1/key',
        buffer_pinterest_channel_id: 'ch-pin',
        buffer_pinterest_board_id: 'b1',
        buffer_instagram_channel_id: 'ch-ig',
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(writeState).toHaveBeenCalledWith(
      expect.objectContaining({
        social: expect.objectContaining({
          buffer_api_key: '1/key',
          buffer_pinterest_channel_id: 'ch-pin',
          buffer_pinterest_board_id: 'b1',
          buffer_instagram_channel_id: 'ch-ig',
          make_webhook_url: undefined,
          board: undefined,
        }),
      }),
    );
  });

  it('returns 400 when Buffer API key is invalid', async () => {
    const { fetchBufferChannels } = await import('@/lib/buffer');
    vi.mocked(fetchBufferChannels).mockRejectedValueOnce(new Error('Buffer API returned 401'));
    const { POST } = await import('../social/route');
    const res = await POST(
      createRequest({
        make_webhook_url: '',
        pinterest_enabled: true,
        threads_enabled: false,
        buffer_api_key: '1/bad-key',
        buffer_pinterest_channel_id: 'ch-pin',
        buffer_pinterest_board_id: 'b1',
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('BUFFER_KEY_INVALID');
  });

  it('returns 400 when selected channel does not belong to the Buffer account', async () => {
    const { fetchBufferChannels } = await import('@/lib/buffer');
    vi.mocked(fetchBufferChannels).mockResolvedValueOnce(BUFFER_CHANNELS);
    const { POST } = await import('../social/route');
    const res = await POST(
      createRequest({
        make_webhook_url: '',
        pinterest_enabled: true,
        threads_enabled: false,
        buffer_api_key: '1/key',
        buffer_pinterest_channel_id: 'ch-from-old-account',
        buffer_pinterest_board_id: 'b1',
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('BUFFER_CHANNEL_INVALID');
  });

  it('returns 400 when board does not belong to the selected Pinterest channel', async () => {
    const { fetchBufferChannels } = await import('@/lib/buffer');
    vi.mocked(fetchBufferChannels).mockResolvedValueOnce(BUFFER_CHANNELS);
    const { POST } = await import('../social/route');
    const res = await POST(
      createRequest({
        make_webhook_url: '',
        pinterest_enabled: true,
        threads_enabled: false,
        buffer_api_key: '1/key',
        buffer_pinterest_channel_id: 'ch-pin',
        buffer_pinterest_board_id: 'wrong-board',
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.code).toBe('BUFFER_CHANNEL_INVALID');
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

  it('resolves masked *** key to the stored key', async () => {
    mockState.social = {
      pinterest_enabled: true,
      threads_enabled: false,
      buffer_api_key: '1/stored-key',
      buffer_pinterest_channel_id: 'ch-pin',
      buffer_pinterest_board_id: 'b1',
    };
    const { fetchBufferChannels } = await import('@/lib/buffer');
    vi.mocked(fetchBufferChannels).mockResolvedValueOnce(BUFFER_CHANNELS);
    const { writeState } = await import('@/lib/state');
    const { POST } = await import('../social/route');
    const res = await POST(
      createRequest({
        make_webhook_url: '',
        pinterest_enabled: true,
        threads_enabled: false,
        buffer_api_key: '***',
        buffer_pinterest_channel_id: 'ch-pin',
        buffer_pinterest_board_id: 'b1',
      }),
    );

    expect(res.status).toBe(200);
    expect(vi.mocked(fetchBufferChannels)).toHaveBeenCalledWith('1/stored-key');
    expect(writeState).toHaveBeenCalledWith(
      expect.objectContaining({
        social: expect.objectContaining({ buffer_api_key: '1/stored-key' }),
      }),
    );
  });

  it('does not persist the Buffer key when no networks are enabled', async () => {
    const { writeState } = await import('@/lib/state');
    const { POST } = await import('../social/route');
    const res = await POST(
      createRequest({
        make_webhook_url: '',
        pinterest_enabled: false,
        threads_enabled: false,
        instagram_enabled: false,
        buffer_api_key: '1/key',
      }),
    );

    expect(res.status).toBe(200);
    expect(writeState).toHaveBeenCalledWith(
      expect.objectContaining({
        social: expect.objectContaining({ buffer_api_key: undefined }),
      }),
    );
  });

  it('clears channel ids of disabled networks', async () => {
    const { fetchBufferChannels } = await import('@/lib/buffer');
    vi.mocked(fetchBufferChannels).mockResolvedValueOnce(BUFFER_CHANNELS);
    const { writeState } = await import('@/lib/state');
    const { POST } = await import('../social/route');
    const res = await POST(
      createRequest({
        make_webhook_url: '',
        pinterest_enabled: true,
        threads_enabled: false,
        instagram_enabled: false,
        buffer_api_key: '1/key',
        buffer_pinterest_channel_id: 'ch-pin',
        buffer_pinterest_board_id: 'b1',
        // stale ids for disabled networks must not be persisted
        buffer_instagram_channel_id: 'ch-ig',
        buffer_threads_channel_id: 'ch-th',
      }),
    );

    expect(res.status).toBe(200);
    expect(writeState).toHaveBeenCalledWith(
      expect.objectContaining({
        social: expect.objectContaining({
          buffer_pinterest_channel_id: 'ch-pin',
          buffer_instagram_channel_id: undefined,
          buffer_threads_channel_id: undefined,
        }),
      }),
    );
  });

  it('persists Inro fields (and defaults keyword) for Buffer Instagram', async () => {
    const { fetchBufferChannels } = await import('@/lib/buffer');
    vi.mocked(fetchBufferChannels).mockResolvedValueOnce(BUFFER_CHANNELS);
    const { writeState } = await import('@/lib/state');
    const { POST } = await import('../social/route');
    const res = await POST(
      createRequest({
        make_webhook_url: '',
        pinterest_enabled: false,
        threads_enabled: false,
        instagram_enabled: true,
        buffer_api_key: '1/key',
        buffer_instagram_channel_id: 'ch-ig',
        inro_api_key: 'inro-secret',
        inro_tag_prefix: 'oa',
        // keyword omitted on purpose — route defaults it to ХОЧУ
      }),
    );

    expect(res.status).toBe(200);
    expect(writeState).toHaveBeenCalledWith(
      expect.objectContaining({
        social: expect.objectContaining({
          inro_api_key: 'inro-secret',
          inro_keyword: 'ХОЧУ',
          inro_tag_prefix: 'oa',
        }),
      }),
    );
  });

  it('resolves masked *** Inro key to the stored key', async () => {
    mockState.social = {
      pinterest_enabled: false,
      threads_enabled: false,
      instagram_enabled: true,
      buffer_api_key: '1/stored-key',
      buffer_instagram_channel_id: 'ch-ig',
      inro_api_key: 'inro-stored',
      inro_keyword: 'ХОЧУ',
    };
    const { fetchBufferChannels } = await import('@/lib/buffer');
    vi.mocked(fetchBufferChannels).mockResolvedValueOnce(BUFFER_CHANNELS);
    const { writeState } = await import('@/lib/state');
    const { POST } = await import('../social/route');
    const res = await POST(
      createRequest({
        make_webhook_url: '',
        pinterest_enabled: false,
        threads_enabled: false,
        instagram_enabled: true,
        buffer_api_key: '***',
        buffer_instagram_channel_id: 'ch-ig',
        inro_api_key: '***',
        inro_keyword: 'ХОЧУ',
      }),
    );

    expect(res.status).toBe(200);
    expect(writeState).toHaveBeenCalledWith(
      expect.objectContaining({
        social: expect.objectContaining({ inro_api_key: 'inro-stored' }),
      }),
    );
  });

  it('clears Inro fields when Instagram is disabled', async () => {
    const { fetchBufferChannels } = await import('@/lib/buffer');
    vi.mocked(fetchBufferChannels).mockResolvedValueOnce(BUFFER_CHANNELS);
    const { writeState } = await import('@/lib/state');
    const { POST } = await import('../social/route');
    const res = await POST(
      createRequest({
        make_webhook_url: '',
        pinterest_enabled: true,
        threads_enabled: false,
        instagram_enabled: false,
        buffer_api_key: '1/key',
        buffer_pinterest_channel_id: 'ch-pin',
        buffer_pinterest_board_id: 'b1',
        // stale Inro values must not be persisted when IG is off
        inro_api_key: 'inro-secret',
        inro_keyword: 'ХОЧУ',
        inro_tag_prefix: 'oa',
      }),
    );

    expect(res.status).toBe(200);
    expect(writeState).toHaveBeenCalledWith(
      expect.objectContaining({
        social: expect.objectContaining({
          inro_api_key: undefined,
          inro_keyword: undefined,
          inro_tag_prefix: undefined,
        }),
      }),
    );
  });

  it('clears Inro fields when Buffer is unused (Make path)', async () => {
    const { writeState } = await import('@/lib/state');
    const { POST } = await import('../social/route');
    const res = await POST(
      createRequest({
        make_webhook_url: 'https://hook.make.com/abc',
        pinterest_enabled: true,
        threads_enabled: false,
        instagram_enabled: false,
        board: 'My Pins',
        inro_api_key: 'inro-secret',
        inro_tag_prefix: 'oa',
      }),
    );

    expect(res.status).toBe(200);
    expect(writeState).toHaveBeenCalledWith(
      expect.objectContaining({
        social: expect.objectContaining({
          inro_api_key: undefined,
          inro_keyword: undefined,
          inro_tag_prefix: undefined,
        }),
      }),
    );
  });
});

describe('GET /api/setup/status', () => {
  it('masks the Buffer API key', async () => {
    mockState.social = {
      pinterest_enabled: true,
      threads_enabled: false,
      buffer_api_key: '1/secret-key',
      buffer_pinterest_channel_id: 'ch-pin',
      buffer_pinterest_board_id: 'b1',
    };
    const { GET } = await import('../status/route');
    const res = await GET(
      new Request('http://localhost/api/setup/status', {
        headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.social.buffer_api_key).toBe('***');
    expect(body.data.social.buffer_pinterest_channel_id).toBe('ch-pin');
  });

  it('masks the Inro API key', async () => {
    mockState.social = {
      pinterest_enabled: false,
      threads_enabled: false,
      instagram_enabled: true,
      buffer_api_key: '1/secret-key',
      buffer_instagram_channel_id: 'ch-ig',
      inro_api_key: 'inro-secret',
      inro_keyword: 'ХОЧУ',
      inro_tag_prefix: 'oa',
    };
    const { GET } = await import('../status/route');
    const res = await GET(
      new Request('http://localhost/api/setup/status', {
        headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.social.inro_api_key).toBe('***');
    expect(body.data.social.buffer_api_key).toBe('***');
    expect(body.data.social.inro_keyword).toBe('ХОЧУ');
    expect(body.data.social.inro_tag_prefix).toBe('oa');
  });
});
