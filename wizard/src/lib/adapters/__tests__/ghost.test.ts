import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import { createGhostAdapter, createGhostJwt } from '../ghost';
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
  vi.stubEnv('GHOST_INTERNAL_URL', 'http://ghost:2368');
  vi.stubEnv('GHOST_ADMIN_API_KEY', 'key-id:' + 'ab'.repeat(32));
  vi.stubEnv('GHOST_CONTENT_API_KEY', 'content-key-123');
  mockFetch.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('createGhostJwt', () => {
  const testKey = 'test-key-id:' + 'ab'.repeat(32);

  it('creates valid JWT with correct header (alg, typ, kid)', () => {
    const jwt = createGhostJwt(testKey);
    const [headerB64] = jwt.split('.');
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString());

    expect(header).toEqual({ alg: 'HS256', typ: 'JWT', kid: 'test-key-id' });
  });

  it('sets iat and exp in payload', () => {
    const jwt = createGhostJwt(testKey);
    const [, payloadB64] = jwt.split('.');
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

    expect(payload).toHaveProperty('iat');
    expect(payload).toHaveProperty('exp');
    expect(payload).toHaveProperty('aud', '/admin/');
    expect(payload.exp - payload.iat).toBe(300);
  });

  it('produces base64url-encoded segments', () => {
    const jwt = createGhostJwt(testKey);
    const segments = jwt.split('.');

    expect(segments).toHaveLength(3);
    for (const segment of segments) {
      expect(segment).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it('signs with HMAC-SHA256 using hex-decoded secret', () => {
    const jwt = createGhostJwt(testKey);
    const [header, payload, signature] = jwt.split('.');
    const secret = 'ab'.repeat(32);

    const hmac = crypto.createHmac('sha256', Buffer.from(secret, 'hex'));
    hmac.update(`${header}.${payload}`);
    const expectedSignature = hmac.digest('base64url');

    expect(signature).toBe(expectedSignature);
  });
});

describe('createGhostAdapter', () => {
  describe('healthCheck', () => {
    it('returns true when Ghost responds with 200', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({ site: {} }));
      const adapter = createGhostAdapter();

      expect(await adapter.healthCheck()).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith('http://ghost:2368/ghost/api/admin/site/', {
        redirect: 'manual',
      });
    });

    it('returns true when Ghost responds with 301 redirect', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 301 }));
      const adapter = createGhostAdapter();

      expect(await adapter.healthCheck()).toBe(true);
    });

    it('returns false when Ghost is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      const adapter = createGhostAdapter();

      expect(await adapter.healthCheck()).toBe(false);
    });

    it('returns false when Ghost responds with 500', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 500 }));
      const adapter = createGhostAdapter();

      expect(await adapter.healthCheck()).toBe(false);
    });
  });

  describe('setup', () => {
    const config = {
      title: 'My Blog',
      description: 'A test blog',
      language: 'en',
      url: 'https://blog.example.com',
      adminEmail: 'admin@example.com',
    };

    const integrationResponse = mockResponse({
      integrations: [
        {
          name: 'openant',
          api_keys: [
            { id: 'content-key-id', secret: 'content-secret', type: 'content' },
            {
              id: 'admin-key-id',
              secret: `admin-key-id:${'ab'.repeat(32)}`,
              type: 'admin',
            },
          ],
        },
      ],
    });

    beforeEach(() => {
      // Clear API keys so fast path doesn't trigger in full setup tests
      delete process.env.GHOST_ADMIN_API_KEY;
      delete process.env.GHOST_CONTENT_API_KEY;
    });

    const themeSettingsResponse = mockResponse({
      custom_theme_settings: [
        { id: 'ts-1', key: 'navigation_layout', value: 'Logo in the middle' },
        { id: 'ts-2', key: 'header_style', value: 'Landing' },
        { id: 'ts-3', key: 'background_image', value: true },
        { id: 'ts-4', key: 'show_author', value: true },
        { id: 'ts-5', key: 'show_post_metadata', value: true },
        { id: 'ts-6', key: 'show_related_articles', value: true },
      ],
    });

    function mockSetupSequence() {
      // Step 1: Setup (create admin) — succeeds (no cookie in response)
      mockFetch.mockResolvedValueOnce(mockResponse({ users: [{ id: 'user-1' }] }));

      // Step 2: Sign in (get session cookie) — fallback since setup had no cookie
      mockFetch.mockResolvedValueOnce(
        mockResponse('', {
          headers: { 'set-cookie': 'ghost-admin-api-session=abc123; Path=/ghost; HttpOnly' },
        }),
      );

      // Step 3: List integrations (finds existing)
      mockFetch.mockResolvedValueOnce(integrationResponse);

      // Step 4: Update settings
      mockFetch.mockResolvedValueOnce(mockResponse({ settings: [] }));

      // Step 5: GET custom theme settings
      mockFetch.mockResolvedValueOnce(themeSettingsResponse);

      // Step 6: PUT custom theme settings
      mockFetch.mockResolvedValueOnce(mockResponse({ custom_theme_settings: [] }));

      // Step 7: GET posts (list default posts to delete)
      mockFetch.mockResolvedValueOnce(
        mockResponse({ posts: [{ id: 'default-post-1', title: 'Coming soon' }] }),
      );

      // Step 8: DELETE default post
      mockFetch.mockResolvedValueOnce(mockResponse(null, { status: 204 }));
    }

    it('creates admin account via setup endpoint', async () => {
      mockSetupSequence();
      const adapter = createGhostAdapter();

      await adapter.setup(config);

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe('http://ghost:2368/ghost/api/admin/authentication/setup/');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body as string);
      expect(body.setup[0]).toMatchObject({
        name: 'Admin',
        email: 'admin@example.com',
        blogTitle: 'My Blog',
      });
      expect(body.setup[0].password).toBeTruthy();
    });

    it('signs in after setup to get session cookie', async () => {
      mockSetupSequence();
      const adapter = createGhostAdapter();

      await adapter.setup(config);

      const [url, opts] = mockFetch.mock.calls[1];
      expect(url).toBe('http://ghost:2368/ghost/api/admin/session/');
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body as string);
      expect(body.username).toBe('admin@example.com');
      expect(body.password).toBeTruthy();
    });

    it('fetches existing integration and extracts API keys', async () => {
      mockSetupSequence();
      const adapter = createGhostAdapter();

      await adapter.setup(config);

      const [url] = mockFetch.mock.calls[2];
      expect(url).toBe('http://ghost:2368/ghost/api/admin/integrations/?include=api_keys');
    });

    it('updates site settings (title, description, locale, navigation, members)', async () => {
      mockSetupSequence();
      const adapter = createGhostAdapter();

      await adapter.setup(config);

      const [url, opts] = mockFetch.mock.calls[3];
      expect(url).toBe('http://ghost:2368/ghost/api/admin/settings/');
      expect(opts.method).toBe('PUT');
      expect(opts.headers).toHaveProperty('Cookie', 'ghost-admin-api-session=abc123');
      const body = JSON.parse(opts.body as string);
      expect(body.settings).toEqual([
        { key: 'title', value: 'My Blog' },
        { key: 'description', value: 'A test blog' },
        { key: 'locale', value: 'en' },
        { key: 'codeinjection_head', value: '' },
        { key: 'navigation', value: '[]' },
        { key: 'secondary_navigation', value: '[]' },
        { key: 'members_signup_access', value: 'none' },
      ]);
    });

    it('configures custom theme settings during setup', async () => {
      mockSetupSequence();
      const adapter = createGhostAdapter();

      await adapter.setup(config);

      // GET custom theme settings
      const [getUrl] = mockFetch.mock.calls[4];
      expect(getUrl).toBe('http://ghost:2368/ghost/api/admin/custom_theme_settings/');

      // PUT custom theme settings with updated values
      const [putUrl, putOpts] = mockFetch.mock.calls[5];
      expect(putUrl).toBe('http://ghost:2368/ghost/api/admin/custom_theme_settings/');
      expect(putOpts.method).toBe('PUT');
      const body = JSON.parse(putOpts.body as string);
      const byKey = Object.fromEntries(
        body.custom_theme_settings.map((s: { key: string; value: unknown }) => [s.key, s.value]),
      );
      expect(byKey.navigation_layout).toBe('Logo on the left');
      expect(byKey.header_style).toBe('Search');
      expect(byKey.background_image).toBe(false);
      expect(byKey.show_author).toBe(false);
      expect(byKey.show_post_metadata).toBe(false);
      // Unchanged settings keep their original values
      expect(byKey.show_related_articles).toBe(true);
    });

    it('deletes default posts during setup', async () => {
      mockSetupSequence();
      const adapter = createGhostAdapter();

      await adapter.setup(config);

      // GET posts
      const [getUrl] = mockFetch.mock.calls[6];
      expect(getUrl).toBe('http://ghost:2368/ghost/api/admin/posts/?limit=all');

      // DELETE post
      const [delUrl, delOpts] = mockFetch.mock.calls[7];
      expect(delUrl).toBe('http://ghost:2368/ghost/api/admin/posts/default-post-1/');
      expect(delOpts.method).toBe('DELETE');
    });

    it('returns adminApiKey and contentApiKey', async () => {
      mockSetupSequence();
      const adapter = createGhostAdapter();

      const result = await adapter.setup(config);

      expect(result.adminApiKey).toBe(`admin-key-id:${'ab'.repeat(32)}`);
      expect(result.adminApiKey).toContain(':');
      expect(result.contentApiKey).toBe('content-secret');
    });

    it('recovers when Ghost is already set up (403)', async () => {
      // Step 1: Setup returns 403 (already completed)
      mockFetch.mockResolvedValueOnce(
        mockResponse('Setup already completed', { ok: false, status: 403 }),
      );
      // Step 2: Sign in succeeds
      mockFetch.mockResolvedValueOnce(
        mockResponse('', {
          headers: { 'set-cookie': 'ghost-admin-api-session=abc123; Path=/ghost; HttpOnly' },
        }),
      );
      // Step 3: List integrations returns existing
      mockFetch.mockResolvedValueOnce(integrationResponse);
      // Step 4: Update settings
      mockFetch.mockResolvedValueOnce(mockResponse({ settings: [] }));
      // Step 5-6: Custom theme settings
      mockFetch.mockResolvedValueOnce(themeSettingsResponse);
      mockFetch.mockResolvedValueOnce(mockResponse({ custom_theme_settings: [] }));
      // Step 7-8: Delete posts
      mockFetch.mockResolvedValueOnce(mockResponse({ posts: [{ id: 'p1' }] }));
      mockFetch.mockResolvedValueOnce(mockResponse(null, { status: 204 }));

      const adapter = createGhostAdapter();
      const result = await adapter.setup(config);

      expect(result.adminApiKey).toBe(`admin-key-id:${'ab'.repeat(32)}`);
      expect(result.contentApiKey).toBe('content-secret');
    });

    it('creates integration when none exists', async () => {
      // Setup succeeds
      mockFetch.mockResolvedValueOnce(mockResponse({ users: [{ id: 'user-1' }] }));
      // Sign in
      mockFetch.mockResolvedValueOnce(
        mockResponse('', {
          headers: { 'set-cookie': 'ghost-admin-api-session=abc123; Path=/ghost; HttpOnly' },
        }),
      );
      // List integrations — no openant integration found
      mockFetch.mockResolvedValueOnce(mockResponse({ integrations: [] }));
      // Create integration
      mockFetch.mockResolvedValueOnce(integrationResponse);
      // Update settings
      mockFetch.mockResolvedValueOnce(mockResponse({ settings: [] }));
      // Custom theme settings
      mockFetch.mockResolvedValueOnce(themeSettingsResponse);
      mockFetch.mockResolvedValueOnce(mockResponse({ custom_theme_settings: [] }));
      // Delete posts
      mockFetch.mockResolvedValueOnce(mockResponse({ posts: [{ id: 'p1' }] }));
      mockFetch.mockResolvedValueOnce(mockResponse(null, { status: 204 }));

      const adapter = createGhostAdapter();
      const result = await adapter.setup(config);

      // 4th call should be POST to create integration
      const [url, opts] = mockFetch.mock.calls[3];
      expect(url).toBe('http://ghost:2368/ghost/api/admin/integrations/');
      expect(opts.method).toBe('POST');
      expect(result.adminApiKey).toContain(':');
    });

    it('throws AdapterError when Ghost setup fails', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Server Error', { ok: false, status: 500 }));
      const adapter = createGhostAdapter();

      await expect(adapter.setup(config)).rejects.toThrow(AdapterError);
    });

    it('throws AdapterError when 403 and sign-in fails', async () => {
      // Setup returns 403
      mockFetch.mockResolvedValueOnce(
        mockResponse('Setup already completed', { ok: false, status: 403 }),
      );
      // Sign in fails (wrong password)
      mockFetch.mockResolvedValueOnce(mockResponse('Unauthorized', { ok: false, status: 401 }));

      const adapter = createGhostAdapter();
      await expect(adapter.setup(config)).rejects.toThrow('already configured but login failed');
    });

    it('uses fast path with JWT when valid API keys exist in env', async () => {
      vi.stubEnv('GHOST_ADMIN_API_KEY', 'key-id:' + 'ab'.repeat(32));
      vi.stubEnv('GHOST_CONTENT_API_KEY', 'content-key-123');

      // Setup status check — Ghost is already set up
      mockFetch.mockResolvedValueOnce(mockResponse({ setup: [{ status: true }] }));
      // Site verification succeeds
      mockFetch.mockResolvedValueOnce(mockResponse({ site: {} }));
      // Update settings via JWT
      mockFetch.mockResolvedValueOnce(mockResponse({ settings: [] }));

      const adapter = createGhostAdapter();
      const result = await adapter.setup(config);

      expect(result.adminApiKey).toBe('key-id:' + 'ab'.repeat(32));
      expect(result.contentApiKey).toBe('content-key-123');
      // 3 calls: setup status + site verification + settings update (no setup/signIn)
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch.mock.calls[0][0]).toBe(
        'http://ghost:2368/ghost/api/admin/authentication/setup/',
      );
      expect(mockFetch.mock.calls[2][0]).toBe('http://ghost:2368/ghost/api/admin/settings/');
    });

    it('falls through to full setup when API keys are invalid', async () => {
      vi.stubEnv('GHOST_ADMIN_API_KEY', 'bad-key:' + 'ab'.repeat(32));
      vi.stubEnv('GHOST_CONTENT_API_KEY', 'bad-content-key');

      // Setup status check — Ghost is already set up
      mockFetch.mockResolvedValueOnce(mockResponse({ setup: [{ status: true }] }));
      // Site verification fails (invalid key)
      mockFetch.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 401 }));
      // Full setup sequence follows
      mockSetupSequence();

      const adapter = createGhostAdapter();
      const result = await adapter.setup(config);

      expect(result.adminApiKey).toBe(`admin-key-id:${'ab'.repeat(32)}`);
      // 10 calls: setup status + site verify (failed) + full setup sequence (8)
      expect(mockFetch).toHaveBeenCalledTimes(10);
    });

    it('skips fast path when Ghost needs setup despite keys in env', async () => {
      vi.stubEnv('GHOST_ADMIN_API_KEY', 'key-id:' + 'ab'.repeat(32));
      vi.stubEnv('GHOST_CONTENT_API_KEY', 'content-key-123');

      // Setup status check — Ghost needs setup (DB was wiped)
      mockFetch.mockResolvedValueOnce(mockResponse({ setup: [{ status: false }] }));
      // Full setup sequence follows (fast path skipped)
      mockSetupSequence();

      const adapter = createGhostAdapter();
      const result = await adapter.setup(config);

      expect(result.adminApiKey).toBe(`admin-key-id:${'ab'.repeat(32)}`);
      // 9 calls: setup status + full setup sequence (8)
      expect(mockFetch).toHaveBeenCalledTimes(9);
      // Second call should be POST to create admin (not site verification)
      expect(mockFetch.mock.calls[1][0]).toBe(
        'http://ghost:2368/ghost/api/admin/authentication/setup/',
      );
      expect(mockFetch.mock.calls[1][1].method).toBe('POST');
    });

    it('uses cookie from setup response when available (skips signIn)', async () => {
      // Setup returns 201 WITH a cookie
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { users: [{ id: 'user-1' }] },
          {
            headers: { 'set-cookie': 'ghost-admin-api-session=from-setup; Path=/ghost; HttpOnly' },
          },
        ),
      );
      // List integrations
      mockFetch.mockResolvedValueOnce(integrationResponse);
      // Update settings
      mockFetch.mockResolvedValueOnce(mockResponse({ settings: [] }));
      // Custom theme settings
      mockFetch.mockResolvedValueOnce(themeSettingsResponse);
      mockFetch.mockResolvedValueOnce(mockResponse({ custom_theme_settings: [] }));
      // Delete posts
      mockFetch.mockResolvedValueOnce(mockResponse({ posts: [{ id: 'p1' }] }));
      mockFetch.mockResolvedValueOnce(mockResponse(null, { status: 204 }));

      const adapter = createGhostAdapter();
      await adapter.setup(config);

      // No signIn call — 7 calls: setup + list integrations + settings + theme + delete posts
      expect(mockFetch).toHaveBeenCalledTimes(7);
      // Settings call uses cookie from setup response
      expect(mockFetch.mock.calls[2][1].headers.Cookie).toBe('ghost-admin-api-session=from-setup');
    });
  });

  describe('uploadTheme', () => {
    const sessionCookie = 'ghost-admin-api-session=theme-upload';

    function mockSignIn() {
      mockFetch.mockResolvedValueOnce(
        mockResponse({}, { headers: { 'set-cookie': `${sessionCookie}; Path=/ghost; HttpOnly` } }),
      );
    }

    it('sends POST to /themes/upload/ with session auth and file', async () => {
      const { promises: mockFs } = await import('fs');
      vi.spyOn(mockFs, 'readFile').mockResolvedValueOnce(Buffer.from('fake-zip'));

      mockSignIn();
      // POST /themes/upload/ — upload succeeds
      mockFetch.mockResolvedValueOnce(
        mockResponse({ themes: [{ name: 'openant-source', active: false }] }),
      );
      // PUT /themes/openant-source/activate/ — activate succeeds
      mockFetch.mockResolvedValueOnce(
        mockResponse({ themes: [{ name: 'openant-source', active: true }] }),
      );
      // GET /custom_theme_settings/ — return defaults
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          custom_theme_settings: [
            { id: '1', key: 'navigation_layout', value: 'Logo in the middle' },
            { id: '2', key: 'header_style', value: 'Highlight' },
          ],
        }),
      );
      // PUT /custom_theme_settings/ — update succeeds
      mockFetch.mockResolvedValueOnce(mockResponse({}));

      const adapter = createGhostAdapter();
      await adapter.uploadTheme('/app/themes/openant-source.zip');

      expect(mockFetch).toHaveBeenCalledTimes(5);
      // Call 0: sign-in
      expect(mockFetch.mock.calls[0][0]).toContain('/ghost/api/admin/session/');
      // Call 1: upload
      const [url, opts] = mockFetch.mock.calls[1];
      expect(url).toContain('/ghost/api/admin/themes/upload/');
      expect(opts.method).toBe('POST');
      expect(opts.headers.Cookie).toBe(sessionCookie);
      expect(opts.body).toBeInstanceOf(FormData);
      // Call 2: activate
      expect(mockFetch.mock.calls[2][0]).toContain(
        '/ghost/api/admin/themes/openant-source/activate/',
      );
      expect(mockFetch.mock.calls[2][1].method).toBe('PUT');
      // Call 3: get custom theme settings
      expect(mockFetch.mock.calls[3][0]).toContain('/ghost/api/admin/custom_theme_settings/');
      // Call 4: put custom theme settings
      expect(mockFetch.mock.calls[4][0]).toContain('/ghost/api/admin/custom_theme_settings/');
      expect(mockFetch.mock.calls[4][1].method).toBe('PUT');
    });

    it('throws AdapterError when sign-in fails', async () => {
      // Sign-in returns no cookie
      mockFetch.mockResolvedValueOnce(
        mockResponse({ errors: [{ message: 'Unauthorized' }] }, { ok: false, status: 401 }),
      );

      const adapter = createGhostAdapter();
      await expect(adapter.uploadTheme('/app/themes/openant-source.zip')).rejects.toThrow(
        'Failed to sign in for theme upload',
      );
    });

    it('throws AdapterError on upload failure', async () => {
      const { promises: mockFs } = await import('fs');
      vi.spyOn(mockFs, 'readFile').mockResolvedValueOnce(Buffer.from('fake-zip'));

      mockSignIn();
      // POST /themes/upload/ — fails
      mockFetch.mockResolvedValueOnce(mockResponse('Server Error', { ok: false, status: 500 }));

      const adapter = createGhostAdapter();
      await expect(adapter.uploadTheme('/app/themes/openant-source.zip')).rejects.toThrow(
        'Failed to upload theme',
      );
    });
  });

  describe('publishPost', () => {
    const post = {
      title: 'Test Post',
      html: '<p>Hello world</p>',
      tags: ['tech', 'news'],
      metaTitle: 'Test Meta',
      metaDescription: 'Meta description',
      featureImage: 'https://example.com/image.jpg',
    };

    it('sends POST with JWT Authorization header', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          posts: [{ id: 'post-1', url: 'https://blog.example.com/test-post/', slug: 'test-post' }],
        }),
      );
      const adapter = createGhostAdapter();

      await adapter.publishPost(post);

      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers.Authorization).toMatch(/^Ghost /);
    });

    it('formats post body correctly (posts array)', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          posts: [{ id: 'post-1', url: 'https://blog.example.com/test-post/', slug: 'test-post' }],
        }),
      );
      const adapter = createGhostAdapter();

      await adapter.publishPost(post);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
      expect(body.posts[0]).toMatchObject({
        title: 'Test Post',
        html: '<p>Hello world</p>',
        status: 'published',
        tags: [{ name: 'tech' }, { name: 'news' }],
        meta_title: 'Test Meta',
        meta_description: 'Meta description',
        feature_image: 'https://example.com/image.jpg',
      });
    });

    it('returns id, url, slug from response', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          posts: [{ id: 'post-1', url: 'https://blog.example.com/test-post/', slug: 'test-post' }],
        }),
      );
      const adapter = createGhostAdapter();

      const result = await adapter.publishPost(post);

      expect(result).toEqual({
        id: 'post-1',
        url: 'https://blog.example.com/test-post/',
        slug: 'test-post',
      });
    });

    it('throws AdapterError on 400/500 response', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse('Bad Request', { ok: false, status: 400 }));
      const adapter = createGhostAdapter();

      await expect(adapter.publishPost(post)).rejects.toThrow(AdapterError);
    });

    it('throws AdapterError when GHOST_ADMIN_API_KEY not set', async () => {
      delete process.env.GHOST_ADMIN_API_KEY;
      const adapter = createGhostAdapter();

      await expect(adapter.publishPost(post)).rejects.toThrow('GHOST_ADMIN_API_KEY not set');
    });
  });

  describe('getPostUrl', () => {
    it('fetches post URL from Content API', async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({
          posts: [{ url: 'https://blog.example.com/my-post/' }],
        }),
      );
      const adapter = createGhostAdapter();

      const url = await adapter.getPostUrl('post-123');

      expect(mockFetch).toHaveBeenCalledWith(
        'http://ghost:2368/ghost/api/content/posts/post-123/?key=content-key-123',
      );
      expect(url).toBe('https://blog.example.com/my-post/');
    });

    it('throws AdapterError on failure', async () => {
      mockFetch.mockResolvedValueOnce(mockResponse({}, { ok: false, status: 404 }));
      const adapter = createGhostAdapter();

      await expect(adapter.getPostUrl('bad-id')).rejects.toThrow(AdapterError);
    });

    it('throws AdapterError when GHOST_CONTENT_API_KEY not set', async () => {
      delete process.env.GHOST_CONTENT_API_KEY;
      const adapter = createGhostAdapter();

      await expect(adapter.getPostUrl('post-1')).rejects.toThrow('GHOST_CONTENT_API_KEY not set');
    });
  });
});
