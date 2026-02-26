import { describe, it, expect } from 'vitest';
import { createMockGhostAdapter } from '../adapters/__mocks__/ghost';
import { createMockNocoDBAdapter } from '../adapters/__mocks__/nocodb';
import { createMockN8nAdapter } from '../adapters/__mocks__/n8n';

describe('Mock Ghost Adapter', () => {
  const adapter = createMockGhostAdapter();

  it('has all required methods', () => {
    expect(adapter.healthCheck).toBeTypeOf('function');
    expect(adapter.setup).toBeTypeOf('function');
    expect(adapter.publishPost).toBeTypeOf('function');
    expect(adapter.getPostUrl).toBeTypeOf('function');
  });

  it('healthCheck returns true', async () => {
    expect(await adapter.healthCheck()).toBe(true);
  });

  it('setup returns adminApiKey and contentApiKey', async () => {
    const result = await adapter.setup({
      title: 'Test',
      description: '',
      language: 'en',
      url: 'http://localhost',
      adminEmail: 'admin@test.com',
    });
    expect(result).toHaveProperty('adminApiKey');
    expect(result).toHaveProperty('contentApiKey');
  });

  it('publishPost returns id, url, slug', async () => {
    const result = await adapter.publishPost({ title: 'Test', html: '<p>Test</p>' });
    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('url');
    expect(result).toHaveProperty('slug');
  });

  it('getPostUrl returns a URL string', async () => {
    const url = await adapter.getPostUrl('mock-id');
    expect(url).toBeTypeOf('string');
    expect(url).toContain('http');
  });
});

describe('Mock NocoDB Adapter', () => {
  const adapter = createMockNocoDBAdapter();

  it('has all required methods', () => {
    expect(adapter.healthCheck).toBeTypeOf('function');
    expect(adapter.setup).toBeTypeOf('function');
    expect(adapter.getNextQueued).toBeTypeOf('function');
    expect(adapter.updateStatus).toBeTypeOf('function');
    expect(adapter.getStats).toBeTypeOf('function');
  });

  it('healthCheck returns true', async () => {
    expect(await adapter.healthCheck()).toBe(true);
  });

  it('setup returns authToken, projectId, tableId', async () => {
    const result = await adapter.setup({ adminEmail: 'test@test.com', adminPassword: 'pass' });
    expect(result).toHaveProperty('authToken');
    expect(result).toHaveProperty('projectId');
    expect(result).toHaveProperty('tableId');
  });

  it('getNextQueued returns null (empty queue)', async () => {
    expect(await adapter.getNextQueued()).toBeNull();
  });

  it('getStats returns counts for all statuses', async () => {
    const stats = await adapter.getStats();
    expect(stats).toHaveProperty('queue', 0);
    expect(stats).toHaveProperty('generating', 0);
    expect(stats).toHaveProperty('publishing', 0);
    expect(stats).toHaveProperty('published', 0);
    expect(stats).toHaveProperty('promoting', 0);
    expect(stats).toHaveProperty('completed', 0);
    expect(stats).toHaveProperty('error', 0);
  });
});

describe('Mock n8n Adapter', () => {
  const adapter = createMockN8nAdapter();

  it('has all required methods', () => {
    expect(adapter.healthCheck).toBeTypeOf('function');
    expect(adapter.createCredential).toBeTypeOf('function');
    expect(adapter.importWorkflow).toBeTypeOf('function');
    expect(adapter.activateWorkflow).toBeTypeOf('function');
  });

  it('healthCheck returns true', async () => {
    expect(await adapter.healthCheck()).toBe(true);
  });

  it('createCredential returns a string ID', async () => {
    const id = await adapter.createCredential({ name: 'test', type: 'test', data: {} });
    expect(id).toBeTypeOf('string');
  });

  it('importWorkflow returns a string ID', async () => {
    const id = await adapter.importWorkflow(
      {},
      {
        credentialIds: {},
        scheduleIntervalMinutes: 60,
        llmModel: 'gpt-4o-mini',
        blogLanguage: 'en',
        blogTone: 'professional',
      },
    );
    expect(id).toBeTypeOf('string');
  });

  it('activateWorkflow does not throw', async () => {
    await expect(adapter.activateWorkflow('mock-id')).resolves.toBeUndefined();
  });
});
