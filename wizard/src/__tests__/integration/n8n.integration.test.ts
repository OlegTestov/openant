import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createN8nAdapter } from '@/lib/adapters/n8n';
import { waitForService, setupN8nApiKey, N8N_URL } from './setup';

let importedWorkflowId: string;

beforeAll(async () => {
  vi.stubEnv('N8N_INTERNAL_URL', N8N_URL);
  await waitForService(`${N8N_URL}/healthz`, 'n8n');
  const apiKey = await setupN8nApiKey(N8N_URL);
  vi.stubEnv('N8N_API_KEY', apiKey);
});

describe('n8n integration', () => {
  it('healthCheck returns true when n8n is running', async () => {
    const adapter = createN8nAdapter();
    expect(await adapter.healthCheck()).toBe(true);
  });

  it('createCredential creates a credential and returns ID', async () => {
    const adapter = createN8nAdapter();
    const id = await adapter.createCredential({
      name: 'Test LLM API',
      type: 'openAiApi',
      data: { apiKey: 'sk-test-integration' },
    });

    expect(id).toBeTruthy();
  });

  it('importWorkflow imports a workflow from template', async () => {
    const adapter = createN8nAdapter();

    const template = {
      name: 'Integration Test Workflow',
      nodes: [
        {
          type: 'n8n-nodes-base.scheduleTrigger',
          name: 'Schedule Trigger',
          typeVersion: 1.2,
          position: [250, 300],
          parameters: {
            rule: { interval: [{ field: 'minutes', minutesInterval: 300 }] },
          },
        },
      ],
      connections: {},
    };

    const id = await adapter.importWorkflow(template, {
      credentialIds: {},
      scheduleIntervalMinutes: 60,
      llmModel: 'gpt-4o-mini',
      blogLanguage: 'en',
      blogTone: 'professional',
    });

    expect(id).toBeTruthy();
    importedWorkflowId = id;
  });

  it('activateWorkflow activates imported workflow', async () => {
    const adapter = createN8nAdapter();
    await expect(adapter.activateWorkflow(importedWorkflowId)).resolves.not.toThrow();
  });
});
