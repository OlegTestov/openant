import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ArticleRow } from '@/lib/adapters/types';

const MOCK_TOKEN = 'test-token-123';

const queuedArticle: ArticleRow = {
  id: '1',
  topic: 'Test Topic',
  status: 'queue',
  createdAt: '2026-01-01T00:00:00Z',
};

const draftArticle: ArticleRow = {
  id: '2',
  topic: 'Draft Topic',
  status: 'draft',
  createdAt: '2026-01-02T00:00:00Z',
};

const publishedArticle: ArticleRow = {
  id: '3',
  topic: 'Published Topic',
  status: 'published',
  ghostUrl: 'https://example.com/post',
  createdAt: '2026-01-03T00:00:00Z',
};

const mockListArticles = vi.fn().mockResolvedValue([queuedArticle, draftArticle, publishedArticle]);
const mockUpdateStatus = vi.fn().mockResolvedValue(undefined);

vi.mock('@/lib/adapters', () => ({
  createAdapters: () => ({
    table: { listArticles: mockListArticles, updateStatus: mockUpdateStatus },
  }),
}));

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${MOCK_TOKEN}`, 'Content-Type': 'application/json' };
}

beforeEach(() => {
  vi.stubEnv('SETUP_TOKEN', MOCK_TOKEN);
  mockListArticles.mockResolvedValue([queuedArticle, draftArticle, publishedArticle]);
  mockUpdateStatus.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('GET /api/dashboard/articles', () => {
  it('returns 401 without auth', async () => {
    const { GET } = await import('../articles/route');
    const res = await GET(new Request('http://localhost/api/dashboard/articles'));
    expect(res.status).toBe(401);
  });

  it('returns article list', async () => {
    const { GET } = await import('../articles/route');
    const res = await GET(
      new Request('http://localhost/api/dashboard/articles', {
        headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(3);
  });
});

describe('PATCH /api/dashboard/articles', () => {
  it('marks queued article as draft', async () => {
    const { PATCH } = await import('../articles/route');
    const res = await PATCH(
      new Request('http://localhost/api/dashboard/articles', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ id: '1', draft: true }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockUpdateStatus).toHaveBeenCalledWith('1', 'draft');
  });

  it('removes draft status (back to queue)', async () => {
    const { PATCH } = await import('../articles/route');
    const res = await PATCH(
      new Request('http://localhost/api/dashboard/articles', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ id: '2', draft: false }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(mockUpdateStatus).toHaveBeenCalledWith('2', 'queue');
  });

  it('rejects toggling published article', async () => {
    const { PATCH } = await import('../articles/route');
    const res = await PATCH(
      new Request('http://localhost/api/dashboard/articles', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ id: '3', draft: true }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('STATUS_NOT_ALLOWED');
  });

  it('returns 404 for unknown article', async () => {
    const { PATCH } = await import('../articles/route');
    const res = await PATCH(
      new Request('http://localhost/api/dashboard/articles', {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify({ id: '999', draft: true }),
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.code).toBe('NOT_FOUND');
  });

  it('returns 401 without auth', async () => {
    const { PATCH } = await import('../articles/route');
    const res = await PATCH(
      new Request('http://localhost/api/dashboard/articles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: '1', draft: true }),
      }),
    );
    expect(res.status).toBe(401);
  });
});
