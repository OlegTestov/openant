import { describe, it, expect, beforeAll, vi } from 'vitest';
import { createGhostAdapter } from '@/lib/adapters/ghost';
import { waitForService, GHOST_URL } from './setup';

let adminApiKey: string;
let contentApiKey: string;
let publishedPostId: string;

beforeAll(async () => {
  vi.stubEnv('GHOST_INTERNAL_URL', GHOST_URL);
  await waitForService(`${GHOST_URL}/ghost/api/admin/site/`, 'Ghost');
});

describe('Ghost integration', () => {
  it('healthCheck returns true when Ghost is running', async () => {
    const adapter = createGhostAdapter();
    expect(await adapter.healthCheck()).toBe(true);
  });

  it('setup creates admin and returns API keys', async () => {
    const adapter = createGhostAdapter();
    const result = await adapter.setup({
      title: 'Integration Test Blog',
      description: 'Testing Ghost adapter',
      language: 'en',
      url: GHOST_URL,
      adminEmail: 'admin@openant.local',
    });

    expect(result.adminApiKey).toBeTruthy();
    expect(result.adminApiKey).toContain(':');
    expect(result.contentApiKey).toBeTruthy();

    adminApiKey = result.adminApiKey;
    contentApiKey = result.contentApiKey;
  });

  it('publishPost creates a real post in Ghost', async () => {
    vi.stubEnv('GHOST_ADMIN_API_KEY', adminApiKey);
    const adapter = createGhostAdapter();

    const result = await adapter.publishPost({
      title: 'Integration Test Post',
      html: '<p>This is an integration test article.</p>',
      tags: ['test'],
    });

    expect(result.id).toBeTruthy();
    expect(result.slug).toBeTruthy();
    expect(result.url).toBeTruthy();

    publishedPostId = result.id;
  });

  it('getPostUrl returns valid URL for published post', async () => {
    vi.stubEnv('GHOST_CONTENT_API_KEY', contentApiKey);
    const adapter = createGhostAdapter();

    const url = await adapter.getPostUrl(publishedPostId);
    expect(url).toBeTruthy();
    expect(url).toContain('http');
  });
});
