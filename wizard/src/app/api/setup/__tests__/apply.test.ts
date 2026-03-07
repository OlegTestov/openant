import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SetupState } from '@/types/setup';

const MOCK_TOKEN = 'test-token-123';

const FULL_STATE: SetupState = {
  currentStep: 'deploy',
  deployed: false,
  steps: {
    welcome: { completed: true },
    domain: { completed: true },
    llm: { completed: true },
    blog: { completed: true },
    social: { completed: true },
    review: { completed: true },
    deploy: { completed: false },
  },
  welcome: { language: 'en' },
  domain: { use_domain: true, domain: 'example.com' },
  llm: {
    provider: 'openai',
    api_url: 'https://api.openai.com/v1',
    api_key: 'sk-test-key',
    model: 'gpt-4o-mini',
  },
  blog: {
    title: 'My Blog',
    description: 'A great blog',
    language: 'en',
    tone: 'professional',
    publish_interval_minutes: 60,
  },
  social: {
    make_webhook_url: 'https://hook.make.com/abc',
    pinterest_enabled: true,
    threads_enabled: false,
  },
};

let mockState: SetupState;

const mockBlogSetup = vi.fn(() =>
  Promise.resolve({
    adminApiKey: 'mock-admin-key',
    contentApiKey: 'mock-content-key',
  }),
);
const mockUploadTheme = vi.fn(() => Promise.resolve());
const mockTableSetup = vi.fn(() =>
  Promise.resolve({
    authToken: 'mock-noco-token',
    projectId: 'mock-project-id',
    tableId: 'mock-table-id',
    promptsTableId: 'mock-prompts-table-id',
  }),
);
const mockAutomationSetup = vi.fn(() => Promise.resolve({ apiKey: 'mock-n8n-api-key' }));
const mockCreateCredential = vi.fn(() => Promise.resolve('mock-cred-id'));
const mockImportWorkflow = vi.fn(() => Promise.resolve('mock-workflow-id'));
const mockActivateWorkflow = vi.fn(() => Promise.resolve());

vi.mock('@/lib/state', () => ({
  readState: vi.fn(() => Promise.resolve(mockState)),
  writeState: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/config', () => ({
  readEnv: vi.fn(() => Promise.resolve({})),
  writeEnv: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/caddy', () => ({
  generateCaddyfile: vi.fn(() => 'mock caddyfile'),
  writeCaddyfile: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/docker', () => ({
  startServices: vi.fn(() => Promise.resolve()),
  reloadCaddy: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/lib/adapters', () => ({
  createAdapters: vi.fn(() => ({
    blog: { setup: mockBlogSetup, uploadTheme: mockUploadTheme },
    table: { setup: mockTableSetup },
    automation: {
      setup: mockAutomationSetup,
      createCredential: mockCreateCredential,
      importWorkflow: mockImportWorkflow,
      activateWorkflow: mockActivateWorkflow,
    },
  })),
}));

const { mockReadFile } = vi.hoisted(() => ({
  mockReadFile: vi.fn(() => Promise.resolve('{}')),
}));

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
    default: {
      ...(actual as object),
      promises: {
        ...((actual as Record<string, unknown>).promises as object),
        readFile: mockReadFile,
      },
    },
    promises: {
      ...((actual as Record<string, unknown>).promises as object),
      readFile: mockReadFile,
    },
  };
});

interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}

async function readSSEEvents(response: Response): Promise<SSEEvent[]> {
  const text = await response.text();
  const blocks = text.split('\n\n').filter(Boolean);
  return blocks.map((block) => {
    const eventMatch = block.match(/^event: (.+)$/m);
    const dataMatch = block.match(/^data: (.+)$/m);
    return {
      event: eventMatch?.[1] ?? '',
      data: dataMatch ? (JSON.parse(dataMatch[1]) as Record<string, unknown>) : {},
    };
  });
}

function createRequest(startFrom?: number): Request {
  const url = startFrom
    ? `http://localhost/api/setup/apply?startFrom=${startFrom}`
    : 'http://localhost/api/setup/apply';
  return new Request(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
  });
}

function createUnauthRequest(): Request {
  return new Request('http://localhost/api/setup/apply', {
    method: 'POST',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('SETUP_TOKEN', MOCK_TOKEN);
  vi.stubEnv('SERVER_IP', '1.2.3.4');
  mockState = JSON.parse(JSON.stringify(FULL_STATE)) as SetupState;
  mockReadFile.mockImplementation(() => Promise.resolve('{}'));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('POST /api/setup/apply', () => {
  it('returns SSE stream with correct Content-Type', async () => {
    const { POST } = await import('../apply/route');
    const res = await POST(createRequest());

    expect(res.headers.get('Content-Type')).toBe('text/event-stream');
    expect(res.headers.get('Cache-Control')).toBe('no-cache');

    await res.text();
  });

  it('returns 401 without auth token', async () => {
    const { POST } = await import('../apply/route');
    const res = await POST(createUnauthRequest());

    expect(res.status).toBe(401);
  });

  it('returns 400 when blog config is missing', async () => {
    mockState = { ...mockState, blog: undefined };

    const { POST } = await import('../apply/route');
    const res = await POST(createRequest());
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('returns 400 when llm config is missing', async () => {
    mockState = { ...mockState, llm: undefined };

    const { POST } = await import('../apply/route');
    const res = await POST(createRequest());
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('executes all 12 steps in order', async () => {
    const { POST } = await import('../apply/route');
    const res = await POST(createRequest());
    const events = await readSSEEvents(res);

    const stepEvents = events.filter((e) => e.event === 'step');
    expect(stepEvents).toHaveLength(24); // 12 running + 12 completed

    for (let i = 1; i <= 12; i++) {
      const runningIdx = stepEvents.findIndex(
        (e) => e.data.step === i && e.data.status === 'running',
      );
      const completedIdx = stepEvents.findIndex(
        (e) => e.data.step === i && e.data.status === 'completed',
      );
      expect(runningIdx).toBeGreaterThanOrEqual(0);
      expect(completedIdx).toBeGreaterThan(runningIdx);
    }
  });

  it('emits "running" then "completed" for each step', async () => {
    const { POST } = await import('../apply/route');
    const res = await POST(createRequest());
    const events = await readSSEEvents(res);

    const stepEvents = events.filter((e) => e.event === 'step');

    for (let i = 0; i < stepEvents.length; i += 2) {
      expect(stepEvents[i].data.status).toBe('running');
      expect(stepEvents[i + 1].data.status).toBe('completed');
      expect(stepEvents[i].data.step).toBe(stepEvents[i + 1].data.step);
    }
  });

  it('emits "complete" event with URLs after all steps', async () => {
    const { POST } = await import('../apply/route');
    const res = await POST(createRequest());
    const events = await readSSEEvents(res);

    const completeEvent = events.find((e) => e.event === 'complete');
    expect(completeEvent).toBeDefined();
    expect(completeEvent?.data.success).toBe(true);

    const urls = completeEvent?.data.urls as Record<string, string>;
    expect(urls.blog).toBe('https://blog.example.com');
    expect(urls.table).toBe('https://table.example.com');
    expect(urls.n8n).toBe('https://auto.example.com');
    expect(urls.dashboard).toBeUndefined();

    const credentials = completeEvent?.data.credentials as Record<string, Record<string, string>>;
    expect(credentials).toBeDefined();
    expect(credentials.ghost).toHaveProperty('email');
    expect(credentials.ghost).toHaveProperty('password');
    expect(credentials.ghost.adminUrl).toBe('https://blog.example.com/ghost/');
    expect(credentials.nocodb).toHaveProperty('email');
    expect(credentials.n8n).toHaveProperty('email');
  });

  it('emits "error" event when a step fails', async () => {
    mockBlogSetup.mockRejectedValueOnce(new Error('Ghost API unavailable'));

    const { POST } = await import('../apply/route');
    const res = await POST(createRequest());
    const events = await readSSEEvents(res);

    const errorEvent = events.find((e) => e.event === 'error');
    expect(errorEvent).toBeDefined();
    expect(errorEvent?.data.step).toBe(5);
    expect(errorEvent?.data.error).toBe('Ghost API unavailable');
    expect(errorEvent?.data.recoverable).toBe(true);
  });

  it('stops pipeline after error (subsequent steps not executed)', async () => {
    mockBlogSetup.mockRejectedValueOnce(new Error('Ghost API unavailable'));

    const { POST } = await import('../apply/route');
    const res = await POST(createRequest());
    const events = await readSSEEvents(res);

    const stepEvents = events.filter((e) => e.event === 'step');
    const maxStep = Math.max(...stepEvents.map((e) => e.data.step as number));

    // Steps 1-4 completed, step 5 started (running) but failed
    expect(maxStep).toBe(5);

    // No complete event
    expect(events.find((e) => e.event === 'complete')).toBeUndefined();
  });

  it('supports startFrom parameter to resume from specific step', async () => {
    const { POST } = await import('../apply/route');
    const res = await POST(createRequest(4));
    const events = await readSSEEvents(res);

    const stepEvents = events.filter((e) => e.event === 'step');
    const stepNumbers = stepEvents.map((e) => e.data.step as number);

    // Steps 1-3 should not appear
    expect(stepNumbers).not.toContain(1);
    expect(stepNumbers).not.toContain(2);
    expect(stepNumbers).not.toContain(3);

    // Step 4 should be the first
    expect(stepNumbers[0]).toBe(4);
  });

  it('step 1: writes .env with correct variables', async () => {
    const { POST } = await import('../apply/route');
    const { writeEnv } = await import('@/lib/config');
    const res = await POST(createRequest());

    await res.text();

    expect(writeEnv).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        DOMAIN: 'example.com',
        GHOST_URL: 'https://blog.example.com',
        LLM_API_KEY: 'sk-test-key',
        LLM_MODEL: 'gpt-4o-mini',
        BLOG_TITLE: 'My Blog',
        BLOG_LANG: 'en',
        PUBLISH_INTERVAL_MINUTES: '60',
      }),
    );
  });

  it('step 2: generates correct Caddyfile based on domain config', async () => {
    const { POST } = await import('../apply/route');
    const { generateCaddyfile } = await import('@/lib/caddy');
    const res = await POST(createRequest());

    await res.text();

    expect(generateCaddyfile).toHaveBeenCalledWith(
      {
        ghost: 'blog.example.com',
        nocodb: 'table.example.com',
        n8n: 'auto.example.com',
        wizard: 'setup.example.com',
      },
      undefined,
      false,
      true,
    );
  });

  it('step 3: calls startServices()', async () => {
    const { POST } = await import('../apply/route');
    const { startServices } = await import('@/lib/docker');
    const res = await POST(createRequest());

    await res.text();

    expect(startServices).toHaveBeenCalled();
  });

  it('step 4: calls reloadCaddy()', async () => {
    const { POST } = await import('../apply/route');
    const { reloadCaddy } = await import('@/lib/docker');
    const res = await POST(createRequest());

    await res.text();

    expect(reloadCaddy).toHaveBeenCalled();
  });

  it('step 5: calls adapters.blog.setup() with correct config', async () => {
    const { POST } = await import('../apply/route');
    const res = await POST(createRequest());

    await res.text();

    expect(mockBlogSetup).toHaveBeenCalledWith({
      title: 'My Blog',
      description: 'A great blog',
      language: 'en',
      url: 'https://blog.example.com',
      adminEmail: 'admin@example.com',
    });
  });

  it('step 8: calls adapters.table.setup()', async () => {
    const { POST } = await import('../apply/route');
    const res = await POST(createRequest());

    await res.text();

    expect(mockTableSetup).toHaveBeenCalledWith(
      expect.objectContaining({
        adminEmail: 'admin@example.com',
      }),
    );
  });

  it('step 9: calls adapters.automation.setup()', async () => {
    const { POST } = await import('../apply/route');
    const res = await POST(createRequest());

    await res.text();

    expect(mockAutomationSetup).toHaveBeenCalledWith(
      expect.objectContaining({
        adminEmail: 'admin@example.com',
      }),
    );
  });

  it('step 10: creates 2 credentials in n8n', async () => {
    const { POST } = await import('../apply/route');
    const res = await POST(createRequest());

    await res.text();

    expect(mockCreateCredential).toHaveBeenCalledTimes(2);
    expect(mockCreateCredential).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'LLM API', type: 'openAiApi' }),
    );
    expect(mockCreateCredential).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'NocoDB', type: 'httpHeaderAuth' }),
    );
  });

  it('step 11: imports and activates generate-article workflow', async () => {
    const { POST } = await import('../apply/route');
    const res = await POST(createRequest());

    await res.text();

    expect(mockImportWorkflow).toHaveBeenCalledTimes(1);
    expect(mockActivateWorkflow).toHaveBeenCalledTimes(1);
  });

  it('step 11: passes nocodbPromptsTableId and pinterestBoard in workflow params', async () => {
    mockState.social = {
      make_webhook_url: 'https://hook.make.com/abc',
      pinterest_enabled: true,
      threads_enabled: false,
      board: 'My Pins',
    };

    const { POST } = await import('../apply/route');
    const res = await POST(createRequest());

    await res.text();

    expect(mockImportWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        nocodbPromptsTableId: 'mock-prompts-table-id',
        pinterestBoard: 'My Pins',
      }),
    );
  });

  it('step 11: passes undefined pinterestBoard when social.board not set', async () => {
    mockState.social = {
      pinterest_enabled: false,
      threads_enabled: false,
    };

    const { POST } = await import('../apply/route');
    const res = await POST(createRequest());

    await res.text();

    expect(mockImportWorkflow).toHaveBeenCalledTimes(1);
    expect(mockImportWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        pinterestBoard: undefined,
      }),
    );
  });

  it('step 12: sets deployed=true in state.json', async () => {
    const { POST } = await import('../apply/route');
    const { writeState } = await import('@/lib/state');
    const res = await POST(createRequest());

    await res.text();

    expect(writeState).toHaveBeenCalledWith(
      expect.objectContaining({
        deployed: true,
        steps: expect.objectContaining({
          deploy: { completed: true },
        }),
      }),
    );
  });

  it('step 12: writes adapter keys to .env', async () => {
    const { POST } = await import('../apply/route');
    const { writeEnv } = await import('@/lib/config');
    const res = await POST(createRequest());

    await res.text();

    // writeEnv is called 5 times: step 1 (initial), step 5 (ghost keys), step 8 (noco keys), step 9 (n8n key), step 12 (final merge)
    expect(writeEnv).toHaveBeenCalledTimes(5);
    expect(writeEnv).toHaveBeenLastCalledWith(
      expect.any(String),
      expect.objectContaining({
        GHOST_ADMIN_API_KEY: 'mock-admin-key',
        GHOST_CONTENT_API_KEY: 'mock-content-key',
        GHOST_ADMIN_EMAIL: expect.stringContaining('admin@'),
        NOCODB_AUTH_TOKEN: 'mock-noco-token',
        NOCODB_BASE_ID: 'mock-project-id',
        NOCODB_TABLE_ID: 'mock-table-id',
        N8N_API_KEY: 'mock-n8n-api-key',
      }),
    );
  });

  it('builds correct URLs for IP mode', async () => {
    mockState.domain = { use_domain: false };

    const { POST } = await import('../apply/route');
    const res = await POST(createRequest());
    const events = await readSSEEvents(res);

    const completeEvent = events.find((e) => e.event === 'complete');
    const urls = completeEvent?.data.urls as Record<string, string>;

    expect(urls.blog).toBe('http://1.2.3.4');
    expect(urls.table).toBe('http://1.2.3.4:8080');
    expect(urls.n8n).toBe('http://1.2.3.4:5678');
    expect(urls.dashboard).toBeUndefined();
  });
});
