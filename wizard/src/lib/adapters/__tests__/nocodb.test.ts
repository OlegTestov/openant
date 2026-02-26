import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createNocoDBAdapter } from '../nocodb';
import { AdapterError } from '@/lib/errors';

function mockResponse(body: unknown, options: { ok?: boolean; status?: number } = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  vi.stubEnv('NOCODB_INTERNAL_URL', 'http://nocodb:8080');
  vi.stubEnv('NOCODB_AUTH_TOKEN', 'test-auth-token');
  vi.stubEnv('NOCODB_TABLE_ID', 'tbl-123');
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('createNocoDBAdapter', () => {
  describe('healthCheck', () => {
    it('returns true when NocoDB responds with 200', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}));
      const adapter = createNocoDBAdapter();

      expect(await adapter.healthCheck()).toBe(true);
    });

    it('returns false when NocoDB is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const adapter = createNocoDBAdapter();

      expect(await adapter.healthCheck()).toBe(false);
    });
  });

  describe('setup', () => {
    const config = { adminEmail: 'admin@test.com', adminPassword: 'password123' };

    function mockSetupSequence() {
      // Step 1: Signup
      mockFetch.mockResolvedValueOnce(mockResponse({ token: 'signup-token' }));
      // Step 2: Signin
      mockFetch.mockResolvedValueOnce(mockResponse({ token: 'auth-token-123' }));
      // Step 3: List bases (none found)
      mockFetch.mockResolvedValueOnce(mockResponse({ list: [] }));
      // Step 4: Create base
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'base-id-1' }));
      // Step 5: List tables (none found)
      mockFetch.mockResolvedValueOnce(mockResponse({ list: [] }));
      // Step 6: Create table
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'table-id-1' }));
      // Step 7: Create columns (Status, GhostURL, PinURL, Error)
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'col-1' }));
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'col-2' }));
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'col-3' }));
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'col-4' }));
      // Step 8: Insert sample row
      mockFetch.mockResolvedValueOnce(mockResponse({ Id: 1 }));
    }

    it('signs up user', async () => {
      mockSetupSequence();
      const adapter = createNocoDBAdapter();

      await adapter.setup(config);

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://nocodb:8080/api/v1/auth/user/signup');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body as string);
      expect(body.email).toBe('admin@test.com');
    });

    it('signs in and gets auth token', async () => {
      mockSetupSequence();
      const adapter = createNocoDBAdapter();

      await adapter.setup(config);

      const [url, opts] = mockFetch.mock.calls[1];
      expect(url).toBe('http://nocodb:8080/api/v1/auth/user/signin');
      expect(opts.method).toBe('POST');
    });

    it('creates base "openant" when none exists', async () => {
      mockSetupSequence();
      const adapter = createNocoDBAdapter();

      await adapter.setup(config);

      // Call 2 = list bases, Call 3 = create base
      const [url, opts] = mockFetch.mock.calls[3];
      expect(url).toBe('http://nocodb:8080/api/v2/meta/bases/');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body as string);
      expect(body.title).toBe('openant');
    });

    it('creates table "Articles" with columns', async () => {
      mockSetupSequence();
      const adapter = createNocoDBAdapter();

      await adapter.setup(config);

      // Call 4 = list tables, Call 5 = create table
      const [url, opts] = mockFetch.mock.calls[5];
      expect(url).toBe('http://nocodb:8080/api/v2/meta/bases/base-id-1/tables/');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body as string);
      expect(body.title).toBe('Articles');
      expect(body.columns).toEqual([
        { title: 'Title', uidt: 'SingleLineText' },
        { title: 'Description', uidt: 'LongText' },
        { title: 'Link', uidt: 'URL' },
      ]);
    });

    it('configures Status field as SingleSelect with all options', async () => {
      mockSetupSequence();
      const adapter = createNocoDBAdapter();

      await adapter.setup(config);

      // Call 6 = first column (Status)
      const [url, opts] = mockFetch.mock.calls[6];
      expect(url).toBe('http://nocodb:8080/api/v2/meta/tables/table-id-1/columns/');
      const body = JSON.parse(opts.body as string);
      expect(body.title).toBe('Status');
      expect(body.uidt).toBe('SingleSelect');
      const optionTitles = body.colOptions.options.map((o: { title: string }) => o.title);
      expect(optionTitles).not.toContain('queue');
      expect(optionTitles).toContain('generating');
      expect(optionTitles).toContain('error');
    });

    it('returns authToken, projectId, tableId', async () => {
      mockSetupSequence();
      const adapter = createNocoDBAdapter();

      const result = await adapter.setup(config);

      expect(result).toEqual({
        authToken: 'auth-token-123',
        projectId: 'base-id-1',
        tableId: 'table-id-1',
      });
    });

    it('recovers when user already exists', async () => {
      // Signup fails with "User already exist"
      mockFetch.mockResolvedValueOnce(
        mockResponse({ msg: 'User already exist' }, { ok: false, status: 400 }),
      );
      // Signin succeeds
      mockFetch.mockResolvedValueOnce(mockResponse({ token: 'auth-token-123' }));
      // List bases — finds existing
      mockFetch.mockResolvedValueOnce(
        mockResponse({ list: [{ id: 'base-id-1', title: 'openant' }] }),
      );
      // List tables — finds existing
      mockFetch.mockResolvedValueOnce(
        mockResponse({ list: [{ id: 'table-id-1', title: 'Articles' }] }),
      );

      const adapter = createNocoDBAdapter();
      const result = await adapter.setup(config);

      expect(result).toEqual({
        authToken: 'auth-token-123',
        projectId: 'base-id-1',
        tableId: 'table-id-1',
      });
    });

    it('deletes default "Getting Started" base', async () => {
      // Signup
      mockFetch.mockResolvedValueOnce(mockResponse({ token: 'signup-token' }));
      // Signin
      mockFetch.mockResolvedValueOnce(mockResponse({ token: 'auth-token-123' }));
      // List bases — returns default "Getting Started"
      mockFetch.mockResolvedValueOnce(
        mockResponse({ list: [{ id: 'gs-base-id', title: 'Getting Started' }] }),
      );
      // Create "openant" base
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'base-id-1' }));
      // DELETE "Getting Started"
      mockFetch.mockResolvedValueOnce(mockResponse({}));
      // List tables (none found)
      mockFetch.mockResolvedValueOnce(mockResponse({ list: [] }));
      // Create table
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'table-id-1' }));
      // Create columns (Status, GhostURL, PinURL, Error)
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'col-1' }));
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'col-2' }));
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'col-3' }));
      mockFetch.mockResolvedValueOnce(mockResponse({ id: 'col-4' }));
      // Insert sample row
      mockFetch.mockResolvedValueOnce(mockResponse({ Id: 1 }));

      const adapter = createNocoDBAdapter();
      await adapter.setup(config);

      // Verify DELETE call for "Getting Started" base
      const deleteCall = mockFetch.mock.calls[4];
      expect(deleteCall[0]).toBe('http://nocodb:8080/api/v2/meta/bases/gs-base-id');
      expect(deleteCall[1].method).toBe('DELETE');
    });

    it('throws AdapterError on non-recoverable signup failure', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse('Internal Server Error', { ok: false, status: 500 }),
      );
      const adapter = createNocoDBAdapter();

      await expect(adapter.setup(config)).rejects.toThrow(AdapterError);
    });
  });

  describe('getNextQueued', () => {
    it('returns null when queue is empty', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ list: [] }));
      const adapter = createNocoDBAdapter();

      expect(await adapter.getNextQueued()).toBeNull();
    });

    it('returns ArticleRow when queue has items', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          list: [
            {
              Title: 'Test Article',
              Description: 'A test',
              Link: 'https://example.com',
              Status: null,
              GhostURL: null,
              PinURL: null,
              Error: null,
              CreatedAt: '2026-01-15T10:00:00Z',
            },
          ],
        }),
      );
      const adapter = createNocoDBAdapter();

      const row = await adapter.getNextQueued();

      expect(row).toEqual({
        id: 'Test Article',
        title: 'Test Article',
        description: 'A test',
        link: 'https://example.com',
        status: 'queue',
        ghostUrl: undefined,
        pinUrl: undefined,
        error: undefined,
        createdAt: '2026-01-15T10:00:00Z',
      });
    });

    it('returns oldest item (FIFO) via sort parameter', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ list: [] }));
      const adapter = createNocoDBAdapter();

      await adapter.getNextQueued();

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toContain('sort=CreatedAt');
      expect(url).toContain('limit=1');
      expect(url).toContain('where=(Status,blank)');
    });

    it('maps NocoDB fields to ArticleRow interface', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          list: [
            {
              Title: 'Article',
              Description: '',
              Link: '',
              Status: 'generating',
              GhostURL: 'https://blog.com/post',
              PinURL: 'https://pin.com/123',
              Error: 'some error',
              CreatedAt: '2026-01-01',
            },
          ],
        }),
      );
      const adapter = createNocoDBAdapter();

      const row = await adapter.getNextQueued();

      expect(row).toMatchObject({
        id: 'Article',
        title: 'Article',
        status: 'generating',
        ghostUrl: 'https://blog.com/post',
        pinUrl: 'https://pin.com/123',
        error: 'some error',
      });
    });
  });

  describe('updateStatus', () => {
    it('sends PATCH with correct status', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}));
      const adapter = createNocoDBAdapter();

      await adapter.updateStatus('42', 'publishing');

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/records');
      expect(opts.method).toBe('PATCH');
      const body = JSON.parse(opts.body as string);
      expect(body).toMatchObject({ Title: '42', Status: 'publishing' });
    });

    it('includes extra fields when provided (ghostUrl, pinUrl, error)', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}));
      const adapter = createNocoDBAdapter();

      await adapter.updateStatus('42', 'published', {
        ghostUrl: 'https://blog.com/post',
        pinUrl: 'https://pin.com/123',
        error: 'some error',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body).toMatchObject({
        GhostURL: 'https://blog.com/post',
        PinURL: 'https://pin.com/123',
        Error: 'some error',
      });
    });

    it('throws AdapterError on failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 500 }));
      const adapter = createNocoDBAdapter();

      await expect(adapter.updateStatus('42', 'error')).rejects.toThrow(AdapterError);
    });
  });

  describe('getStats', () => {
    it('returns count for each status (blank = queue)', async () => {
      // First call: blank status count (queue)
      mockFetch.mockResolvedValueOnce(mockResponse({ pageInfo: { totalRows: 5 } }));
      // Then 6 calls for each non-queue status
      const statuses = ['generating', 'publishing', 'published', 'promoting', 'completed', 'error'];
      for (let i = 0; i < statuses.length; i++) {
        mockFetch.mockResolvedValueOnce(mockResponse({ pageInfo: { totalRows: (i + 1) * 10 } }));
      }
      const adapter = createNocoDBAdapter();

      const stats = await adapter.getStats();

      expect(stats).toEqual({
        queue: 5,
        generating: 10,
        publishing: 20,
        published: 30,
        promoting: 40,
        completed: 50,
        error: 60,
      });
    });

    it('queries blank status for queue count', async () => {
      // blank + 6 statuses = 7 calls
      for (let i = 0; i < 7; i++) {
        mockFetch.mockResolvedValueOnce(mockResponse({ pageInfo: { totalRows: 0 } }));
      }
      const adapter = createNocoDBAdapter();

      await adapter.getStats();

      const firstUrl = mockFetch.mock.calls[0][0] as string;
      expect(firstUrl).toContain('where=(Status,blank)');
    });

    it('returns 0 for statuses with no records', async () => {
      for (let i = 0; i < 7; i++) {
        mockFetch.mockResolvedValueOnce(mockResponse({ pageInfo: { totalRows: 0 } }));
      }
      const adapter = createNocoDBAdapter();

      const stats = await adapter.getStats();

      expect(Object.values(stats).every((v) => v === 0)).toBe(true);
    });

    it('handles missing pageInfo gracefully', async () => {
      for (let i = 0; i < 7; i++) {
        mockFetch.mockResolvedValueOnce(mockResponse({}));
      }
      const adapter = createNocoDBAdapter();

      const stats = await adapter.getStats();

      expect(Object.values(stats).every((v) => v === 0)).toBe(true);
    });
  });
});
