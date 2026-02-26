import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SetupState } from '@/types/setup';

const MOCK_TOKEN = 'test-token-123';

const DEPLOYED_STATE: SetupState = {
  currentStep: 'deploy',
  deployed: true,
  steps: {
    welcome: { completed: true },
    domain: { completed: true },
    llm: { completed: true },
    blog: { completed: true },
    social: { completed: true },
    review: { completed: true },
    deploy: { completed: true },
  },
  welcome: { language: 'en' },
  domain: { use_domain: true, domain: 'example.com' },
  llm: {
    provider: 'openai',
    api_url: 'https://api.openai.com/v1',
    api_key: 'sk-test',
    model: 'gpt-4o-mini',
  },
  blog: { title: 'My Blog', language: 'en', tone: 'professional', publish_interval_minutes: 60 },
  social: { pinterest_enabled: false, threads_enabled: false },
};

let mockState: SetupState;

vi.mock('@/lib/state', () => ({
  readState: vi.fn(() => Promise.resolve({ ...mockState, steps: { ...mockState.steps } })),
  writeState: vi.fn(() => Promise.resolve()),
}));

function createAuthRequest(): Request {
  return new Request('http://localhost/api/dashboard/reconfigure', {
    method: 'POST',
    headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
  });
}

function createUnauthRequest(): Request {
  return new Request('http://localhost/api/dashboard/reconfigure', {
    method: 'POST',
  });
}

beforeEach(() => {
  vi.stubEnv('SETUP_TOKEN', MOCK_TOKEN);
  mockState = {
    ...DEPLOYED_STATE,
    steps: { ...DEPLOYED_STATE.steps },
  };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/dashboard/reconfigure', () => {
  it('returns 401 without auth', async () => {
    const { POST } = await import('../reconfigure/route');
    const res = await POST(createUnauthRequest());
    expect(res.status).toBe(401);
  });

  it('sets deployed to false', async () => {
    const { writeState } = await import('@/lib/state');
    const { POST } = await import('../reconfigure/route');

    const res = await POST(createAuthRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(writeState).toHaveBeenCalledWith(expect.objectContaining({ deployed: false }));
  });

  it('sets currentStep to review', async () => {
    const { writeState } = await import('@/lib/state');
    const { POST } = await import('../reconfigure/route');
    await POST(createAuthRequest());

    expect(writeState).toHaveBeenCalledWith(expect.objectContaining({ currentStep: 'review' }));
  });

  it('resets deploy and review steps', async () => {
    const { writeState } = await import('@/lib/state');
    const { POST } = await import('../reconfigure/route');
    await POST(createAuthRequest());

    expect(writeState).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: expect.objectContaining({
          deploy: { completed: false },
          review: { completed: false },
        }),
      }),
    );
  });

  it('preserves configuration data', async () => {
    const { writeState } = await import('@/lib/state');
    const { POST } = await import('../reconfigure/route');
    await POST(createAuthRequest());

    expect(writeState).toHaveBeenCalledWith(
      expect.objectContaining({
        welcome: { language: 'en' },
        domain: { use_domain: true, domain: 'example.com' },
        steps: expect.objectContaining({
          welcome: { completed: true },
          domain: { completed: true },
          llm: { completed: true },
          blog: { completed: true },
          social: { completed: true },
        }),
      }),
    );
  });
});
