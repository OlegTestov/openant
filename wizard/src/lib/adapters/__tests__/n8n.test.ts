import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createN8nAdapter } from '../n8n';
import { AdapterError } from '@/lib/errors';

function mockResponse(
  body: unknown,
  options: { ok?: boolean; status?: number; headers?: Record<string, string> } = {},
) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: {
      get: (name: string) => options.headers?.[name.toLowerCase()] ?? null,
    },
  };
}

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  vi.stubEnv('N8N_API_KEY', 'test-api-key');
  vi.stubEnv('N8N_INTERNAL_URL', 'http://n8n:5678');
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('createN8nAdapter', () => {
  describe('healthCheck', () => {
    it('returns true when n8n responds with 200', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}));
      const adapter = createN8nAdapter();

      expect(await adapter.healthCheck()).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('http://n8n:5678/healthz');
    });

    it('returns false when n8n is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const adapter = createN8nAdapter();

      expect(await adapter.healthCheck()).toBe(false);
    });

    it('returns false when n8n responds with 500', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 500 }));
      const adapter = createN8nAdapter();

      expect(await adapter.healthCheck()).toBe(false);
    });
  });

  describe('setup', () => {
    const config = { adminEmail: 'admin@openant.local' };

    beforeEach(() => {
      // Clear API key so fast path doesn't trigger in full setup tests
      delete process.env.N8N_API_KEY;
    });

    function mockSetupSequence() {
      // Step 1: Owner setup
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'user-1' }));
      // Step 2: Login (with session cookie)
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          {},
          {
            headers: { 'set-cookie': 'n8n-auth=session123; Path=/; HttpOnly' },
          },
        ),
      );
      // Step 3: List API keys (none found)
      mockFetch.mockResolvedValueOnce(mockResponse({ data: [] }));
      // Step 4: Create API key
      mockFetch.mockResolvedValueOnce(mockResponse({ data: { apiKey: 'n8n-api-key-123' } }));
    }

    it('creates owner account', async () => {
      mockSetupSequence();
      const adapter = createN8nAdapter();

      await adapter.setup(config);

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://n8n:5678/rest/owner/setup');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body as string);
      expect(body.email).toBe('admin@openant.local');
      expect(body.password).toBeTruthy();
    });

    it('signs in after owner setup', async () => {
      mockSetupSequence();
      const adapter = createN8nAdapter();

      await adapter.setup(config);

      const [url, opts] = mockFetch.mock.calls[1];
      expect(url).toBe('http://n8n:5678/rest/login');
      expect(opts.method).toBe('POST');
    });

    it('returns apiKey from newly created key', async () => {
      mockSetupSequence();
      const adapter = createN8nAdapter();

      const result = await adapter.setup(config);

      expect(result).toEqual({ apiKey: 'n8n-api-key-123' });
    });

    it('reuses existing API key when one exists', async () => {
      // Owner setup
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'user-1' }));
      // Login
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          {},
          {
            headers: { 'set-cookie': 'n8n-auth=session123; Path=/; HttpOnly' },
          },
        ),
      );
      // List API keys — finds existing
      mockFetch.mockResolvedValueOnce(mockResponse({ data: [{ apiKey: 'existing-key-456' }] }));

      const adapter = createN8nAdapter();
      const result = await adapter.setup(config);

      expect(result).toEqual({ apiKey: 'existing-key-456' });
      // Should not create a new key (only 3 fetch calls, not 4)
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('recovers when owner already exists (400)', async () => {
      // Owner setup fails — already exists
      mockFetch.mockResolvedValueOnce(
        mockResponse({ message: 'Owner already set up' }, { ok: false, status: 400 }),
      );
      // Login succeeds
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          {},
          {
            headers: { 'set-cookie': 'n8n-auth=session123; Path=/; HttpOnly' },
          },
        ),
      );
      // List API keys
      mockFetch.mockResolvedValueOnce(mockResponse({ data: [] }));
      // Create API key
      mockFetch.mockResolvedValueOnce(mockResponse({ data: { apiKey: 'new-key-789' } }));

      const adapter = createN8nAdapter();
      const result = await adapter.setup(config);

      expect(result).toEqual({ apiKey: 'new-key-789' });
    });

    it('throws AdapterError on non-recoverable owner setup failure', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse('Internal Server Error', { ok: false, status: 500 }),
      );
      const adapter = createN8nAdapter();

      await expect(adapter.setup(config)).rejects.toThrow(AdapterError);
    });

    it('throws AdapterError when login fails', async () => {
      // Owner setup succeeds
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'user-1' }));
      // Login fails
      mockFetch.mockResolvedValueOnce(mockResponse('Unauthorized', { ok: false, status: 401 }));

      const adapter = createN8nAdapter();
      await expect(adapter.setup(config)).rejects.toThrow(AdapterError);
    });

    it('uses fast path when valid API key exists in env', async () => {
      vi.stubEnv('N8N_API_KEY', 'valid-api-key');

      // Workflows list succeeds (key is valid)
      mockFetch.mockResolvedValueOnce(mockResponse({ data: [] }));

      const adapter = createN8nAdapter();
      const result = await adapter.setup(config);

      expect(result).toEqual({ apiKey: 'valid-api-key' });
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('falls through to full setup when API key is invalid', async () => {
      vi.stubEnv('N8N_API_KEY', 'invalid-key');

      // Key verification fails
      mockFetch.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 401 }));
      // Full setup sequence follows
      mockSetupSequence();

      const adapter = createN8nAdapter();
      const result = await adapter.setup(config);

      expect(result).toEqual({ apiKey: 'n8n-api-key-123' });
      // 5 calls: verify (failed) + owner setup + login + list keys + create key
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it('skips masked API keys when listing existing keys', async () => {
      // Owner setup
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'user-1' }));
      // Login
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          {},
          {
            headers: { 'set-cookie': 'n8n-auth=session123; Path=/; HttpOnly' },
          },
        ),
      );
      // List API keys — all masked
      mockFetch.mockResolvedValueOnce(mockResponse({ data: [{ apiKey: 'eyJhb****' }] }));
      // Create API key (since all existing are masked)
      mockFetch.mockResolvedValueOnce(mockResponse({ data: { apiKey: 'new-fresh-key' } }));

      const adapter = createN8nAdapter();
      const result = await adapter.setup(config);

      expect(result).toEqual({ apiKey: 'new-fresh-key' });
    });
  });

  describe('createCredential', () => {
    it('sends POST with correct body and X-N8N-API-KEY header', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'cred-123' }));
      const adapter = createN8nAdapter();

      await adapter.createCredential({
        name: 'OpenAI',
        type: 'openAiApi',
        data: { apiKey: 'sk-test' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        'http://n8n:5678/api/v1/credentials',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-N8N-API-KEY': 'test-api-key',
          }),
        }),
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body).toEqual({
        name: 'OpenAI',
        type: 'openAiApi',
        data: { apiKey: 'sk-test' },
      });
    });

    it('returns credential ID from response', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'cred-456' }));
      const adapter = createN8nAdapter();

      const id = await adapter.createCredential({
        name: 'Test',
        type: 'test',
        data: {},
      });

      expect(id).toBe('cred-456');
    });

    it('throws AdapterError when N8N_API_KEY not set', async () => {
      vi.stubEnv('N8N_API_KEY', '');
      delete process.env.N8N_API_KEY;
      const adapter = createN8nAdapter();

      await expect(
        adapter.createCredential({ name: 'Test', type: 'test', data: {} }),
      ).rejects.toThrow(AdapterError);
    });

    it('throws AdapterError on API error', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Bad Request', { ok: false, status: 400 }));
      const adapter = createN8nAdapter();

      await expect(
        adapter.createCredential({ name: 'Test', type: 'test', data: {} }),
      ).rejects.toThrow(AdapterError);
    });
  });

  describe('importWorkflow', () => {
    const template = {
      name: 'Test Workflow',
      nodes: [
        {
          type: 'n8n-nodes-base.scheduleTrigger',
          name: 'Schedule',
          parameters: {
            rule: { interval: [{ minutesInterval: 30 }] },
          },
        },
        {
          type: 'n8n-nodes-base.openAi',
          name: 'OpenAI',
          parameters: { modelId: { __rl: true, mode: 'id', value: 'gpt-3.5-turbo' } },
          credentials: { openAiApi: { id: 'placeholder', name: 'LLM API' } },
        },
        {
          type: 'n8n-nodes-base.httpRequest',
          name: 'Make Webhook',
          parameters: { url: '' },
        },
        {
          type: 'n8n-nodes-base.code',
          name: 'Prompt',
          parameters: {
            code: 'Write in {{BLOG_LANGUAGE}} with {{BLOG_TONE}} tone',
          },
        },
      ],
    };

    const params = {
      credentialIds: { 'LLM API': 'real-cred-id' },
      scheduleIntervalMinutes: 60,
      llmModel: 'gpt-4o-mini',
      blogLanguage: 'English',
      blogTone: 'professional',
      makeWebhookUrl: 'https://hook.make.com/test',
    };

    it('does not mutate original template', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'wf-1' }));
      const adapter = createN8nAdapter();
      const originalJson = JSON.stringify(template);

      await adapter.importWorkflow(template, params);

      expect(JSON.stringify(template)).toBe(originalJson);
    });

    it('substitutes scheduleIntervalMinutes in Schedule Trigger', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'wf-1' }));
      const adapter = createN8nAdapter();

      await adapter.importWorkflow(template, params);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      const scheduleNode = body.nodes.find(
        (n: { type: string }) => n.type === 'n8n-nodes-base.scheduleTrigger',
      );
      expect(scheduleNode.parameters.rule.interval[0].minutesInterval).toBe(60);
    });

    it('substitutes llmModel in OpenAI node', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'wf-1' }));
      const adapter = createN8nAdapter();

      await adapter.importWorkflow(template, params);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      const openAiNode = body.nodes.find(
        (n: { type: string }) => n.type === 'n8n-nodes-base.openAi',
      );
      expect(openAiNode.parameters.modelId.value).toBe('gpt-4o-mini');
    });

    it('substitutes makeWebhookUrl in HTTP Request node', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'wf-1' }));
      const adapter = createN8nAdapter();

      await adapter.importWorkflow(template, params);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      const httpNode = body.nodes.find(
        (n: { type: string }) => n.type === 'n8n-nodes-base.httpRequest',
      );
      expect(httpNode.parameters.url).toBe('https://hook.make.com/test');
    });

    it('substitutes credentialIds in node.credentials', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'wf-1' }));
      const adapter = createN8nAdapter();

      await adapter.importWorkflow(template, params);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      const openAiNode = body.nodes.find(
        (n: { type: string }) => n.type === 'n8n-nodes-base.openAi',
      );
      expect(openAiNode.credentials.openAiApi.id).toBe('real-cred-id');
    });

    it('substitutes NOCODB_PROMPTS_TABLE_ID marker', async () => {
      const templateWithPrompts = {
        ...template,
        nodes: [
          ...template.nodes,
          {
            type: 'n8n-nodes-base.httpRequest',
            name: 'Get Prompts',
            parameters: {
              url: 'http://nocodb:8080/api/v2/tables/{{NOCODB_PROMPTS_TABLE_ID}}/records',
            },
          },
        ],
      };

      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'wf-1' }));
      const adapter = createN8nAdapter();

      await adapter.importWorkflow(templateWithPrompts, {
        ...params,
        nocodbPromptsTableId: 'prompts-table-xyz',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      const promptsNode = body.nodes.find(
        (n: { name: string }) => n.name === 'Get Prompts',
      );
      expect(promptsNode.parameters.url).toBe(
        'http://nocodb:8080/api/v2/tables/prompts-table-xyz/records',
      );
    });

    it('substitutes blogLanguage and blogTone markers', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'wf-1' }));
      const adapter = createN8nAdapter();

      await adapter.importWorkflow(template, params);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      const codeNode = body.nodes.find((n: { type: string }) => n.type === 'n8n-nodes-base.code');
      expect(codeNode.parameters.code).toBe('Write in English with professional tone');
    });

    it('sends POST with modified workflow JSON', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'wf-1' }));
      const adapter = createN8nAdapter();

      await adapter.importWorkflow(template, params);

      expect(mockFetch).toHaveBeenCalledWith(
        'http://n8n:5678/api/v1/workflows',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-N8N-API-KEY': 'test-api-key',
          }),
        }),
      );
    });

    it('returns workflow ID', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'wf-42' }));
      const adapter = createN8nAdapter();

      const id = await adapter.importWorkflow(template, params);

      expect(id).toBe('wf-42');
    });
  });

  describe('activateWorkflow', () => {
    it('sends POST to activate endpoint', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}));
      const adapter = createN8nAdapter();

      await adapter.activateWorkflow('wf-1');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://n8n:5678/api/v1/workflows/wf-1/activate',
        expect.objectContaining({
          method: 'POST',
          headers: { 'X-N8N-API-KEY': 'test-api-key' },
        }),
      );
    });

    it('throws AdapterError on failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 404 }));
      const adapter = createN8nAdapter();

      await expect(adapter.activateWorkflow('wf-bad')).rejects.toThrow(AdapterError);
    });
  });
});
