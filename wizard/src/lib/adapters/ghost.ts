import crypto from 'crypto';
import { promises as fs } from 'fs';
import type { BlogAdapter, BlogConfig, PostData, PublishedPost, BlogSetupResult } from './types';
import { AdapterError } from '@/lib/errors';

function getGhostUrl(): string {
  return process.env.GHOST_INTERNAL_URL || 'http://ghost:2368';
}

/** Ghost sets Secure cookies when its URL is HTTPS, so session-based auth
 *  must go through the external HTTPS URL (via Caddy) to receive Set-Cookie. */
function getGhostAuthUrl(): string {
  return process.env.GHOST_URL || getGhostUrl();
}

function getAdminPassword(): string {
  if (process.env.GHOST_ADMIN_PASSWORD) return process.env.GHOST_ADMIN_PASSWORD;
  const token = process.env.SETUP_TOKEN || 'openant-default';
  return crypto.createHash('sha256').update(`ghost-admin-${token}`).digest('hex').slice(0, 32);
}

async function signIn(ghostUrl: string, email: string, password: string): Promise<string | null> {
  const authUrl = getGhostAuthUrl();
  const res = await fetch(`${authUrl}/ghost/api/admin/session/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: authUrl },
    body: JSON.stringify({ username: email, password }),
  });
  // Ghost may return 500 (EmailError) even on successful auth — check cookie first
  const raw = res.headers.get('set-cookie');
  if (raw) return raw.split(';')[0];
  if (!res.ok) return null;
  return null;
}

async function getOrCreateIntegration(
  ghostUrl: string,
  sessionCookie: string,
  origin: string,
): Promise<BlogSetupResult> {
  const headers = { 'Content-Type': 'application/json', Cookie: sessionCookie, Origin: origin };

  // Check for existing integration first
  const listRes = await fetch(`${ghostUrl}/ghost/api/admin/integrations/?include=api_keys`, {
    headers,
  });
  if (listRes.ok) {
    const listData = (await listRes.json()) as {
      integrations: Array<{
        name: string;
        api_keys: Array<{ secret: string; type: string }>;
      }>;
    };
    const existing = listData.integrations.find((i) => i.name === 'openant');
    if (existing) {
      const adminKey = existing.api_keys.find((k) => k.type === 'admin');
      const contentKey = existing.api_keys.find((k) => k.type === 'content');
      if (adminKey && contentKey) {
        return { adminApiKey: adminKey.secret, contentApiKey: contentKey.secret };
      }
    }
  }

  // Create new integration
  const createRes = await fetch(`${ghostUrl}/ghost/api/admin/integrations/`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ integrations: [{ name: 'openant' }] }),
  });
  if (!createRes.ok) {
    const error = await createRes.text();
    throw new AdapterError(
      'ghost',
      'setup',
      `Failed to create integration: ${createRes.status} ${error}`,
    );
  }

  const data = (await createRes.json()) as {
    integrations: Array<{
      api_keys: Array<{ secret: string; type: string }>;
    }>;
  };
  const integration = data.integrations[0];
  const adminKey = integration.api_keys.find((k) => k.type === 'admin');
  const contentKey = integration.api_keys.find((k) => k.type === 'content');
  if (!adminKey || !contentKey) {
    throw new AdapterError('ghost', 'setup', 'Missing admin or content API key');
  }
  return { adminApiKey: adminKey.secret, contentApiKey: contentKey.secret };
}

function requireAdminJwt(operation: string): string {
  const adminApiKey = process.env.GHOST_ADMIN_API_KEY;
  if (!adminApiKey) {
    throw new AdapterError('ghost', operation, 'GHOST_ADMIN_API_KEY not set');
  }
  return createGhostJwt(adminApiKey);
}

async function assertOk(res: Response, operation: string, message: string): Promise<void> {
  if (!res.ok) {
    const body = await res.text();
    throw new AdapterError('ghost', operation, `${message}: ${res.status} ${body}`);
  }
}

export function createGhostJwt(adminApiKey: string): string {
  const [id, secret] = adminApiKey.split(':');

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: id })).toString(
    'base64url',
  );
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      iat: now,
      exp: now + 300,
      aud: '/admin/',
    }),
  ).toString('base64url');

  const hmac = crypto.createHmac('sha256', Buffer.from(secret, 'hex'));
  hmac.update(`${header}.${payload}`);
  const signature = hmac.digest('base64url');

  return `${header}.${payload}.${signature}`;
}

const SEARCH_PLACEHOLDER_TRANSLATIONS: Record<string, string> = {
  ru: 'Поиск по записям, тегам и авторам',
  es: 'Buscar publicaciones, etiquetas y autores',
  de: 'Beiträge, Tags und Autoren durchsuchen',
  fr: 'Rechercher des articles, tags et auteurs',
};

function buildCodeInjectionSettings(language: string): Array<{ key: string; value: string }> {
  const settings: Array<{ key: string; value: string }> = [];

  // Clear legacy dark mode CSS injection (now built into theme)
  settings.push({ key: 'codeinjection_head', value: '' });

  // Search placeholder translation (injected in footer)
  const translation = SEARCH_PLACEHOLDER_TRANSLATIONS[language];
  if (translation) {
    const script = '<script>' +
      `(function(){var p='${translation}';` +
      "document.querySelectorAll('button[data-ghost-search].gh-form-input').forEach(function(b){" +
      'if(b.textContent.trim()!==p)b.textContent=p})' +
      '})();' +
      '</script>';
    settings.push({ key: 'codeinjection_foot', value: script });
  }

  return settings;
}

const GHOST_SETTINGS = [
  { key: 'navigation', value: '[]' },
  { key: 'secondary_navigation', value: '[]' },
  { key: 'members_signup_access', value: 'none' },
];

const THEME_SETTINGS: Record<string, string | boolean> = {
  navigation_layout: 'Logo on the left',
  header_style: 'Search',
  background_image: false,
  show_author: false,
  show_post_metadata: false,
};

async function updateSettingsWithJwt(
  ghostUrl: string,
  jwt: string,
  config: BlogConfig,
): Promise<void> {
  const res = await fetch(`${ghostUrl}/ghost/api/admin/settings/`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Ghost ${jwt}`,
    },
    body: JSON.stringify({
      settings: [
        { key: 'title', value: config.title },
        { key: 'description', value: config.description },
        { key: 'locale', value: config.language },
        ...buildCodeInjectionSettings(config.language),
        ...GHOST_SETTINGS,
      ],
    }),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new AdapterError('ghost', 'setup', `Failed to update settings: ${res.status} ${error}`);
  }
}

async function updateCustomThemeSettings(
  ghostUrl: string,
  headers: Record<string, string>,
): Promise<void> {
  const getRes = await fetch(`${ghostUrl}/ghost/api/admin/custom_theme_settings/`, { headers });
  if (!getRes.ok) return; // Skip silently if endpoint unavailable

  const data = (await getRes.json()) as {
    custom_theme_settings: Array<{ id: string; key: string; value: unknown }>;
  };

  const updated = data.custom_theme_settings.map((s) =>
    s.key in THEME_SETTINGS ? { ...s, value: THEME_SETTINGS[s.key] } : s,
  );

  await fetch(`${ghostUrl}/ghost/api/admin/custom_theme_settings/`, {
    method: 'PUT',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ custom_theme_settings: updated }),
  });
}

async function deleteAllPosts(ghostUrl: string, headers: Record<string, string>): Promise<void> {
  const res = await fetch(`${ghostUrl}/ghost/api/admin/posts/?limit=all`, { headers });
  if (!res.ok) return;

  const data = (await res.json()) as { posts: Array<{ id: string }> };
  for (const post of data.posts) {
    await fetch(`${ghostUrl}/ghost/api/admin/posts/${post.id}/`, {
      method: 'DELETE',
      headers,
    }).catch(() => {}); // ignore errors
  }
}

async function ghostNeedsSetup(ghostUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${ghostUrl}/ghost/api/admin/authentication/setup/`);
    if (res.ok) {
      const data = (await res.json()) as { setup: Array<{ status: boolean }> };
      return data.setup?.[0]?.status === false;
    }
  } catch {
    // Can't determine — assume needs setup to be safe
  }
  return true;
}

export function createGhostAdapter(): BlogAdapter {
  return {
    async healthCheck() {
      try {
        const res = await fetch(`${getGhostUrl()}/ghost/api/admin/site/`);
        return res.ok;
      } catch {
        return false;
      }
    },

    async setup(config: BlogConfig): Promise<BlogSetupResult> {
      const ghostUrl = getGhostUrl();

      // Fast path: if Ghost is already set up and we have valid API keys, use JWT auth
      const existingAdminKey = process.env.GHOST_ADMIN_API_KEY;
      const existingContentKey = process.env.GHOST_CONTENT_API_KEY;
      if (existingAdminKey && existingContentKey && !(await ghostNeedsSetup(ghostUrl))) {
        try {
          const jwt = createGhostJwt(existingAdminKey);
          const testRes = await fetch(`${ghostUrl}/ghost/api/admin/site/`, {
            headers: { Authorization: `Ghost ${jwt}` },
          });
          if (testRes.ok) {
            // Keys are valid — try to update settings (may fail with 501 for JWT auth)
            try {
              await updateSettingsWithJwt(ghostUrl, jwt, config);
            } catch {
              // Ghost doesn't support settings update via integration JWT — skip silently
            }
            return { adminApiKey: existingAdminKey, contentApiKey: existingContentKey };
          }
        } catch {
          // Keys invalid or Ghost unreachable — fall through to full setup
        }
      }

      // Full setup path: fresh Ghost instance
      // Ghost sets Secure cookies when configured with HTTPS URL, so session-based
      // requests must go through the external HTTPS URL to receive Set-Cookie headers.
      const authUrl = getGhostAuthUrl();
      const password = getAdminPassword();

      // Step 1: Create admin account
      const setupRes = await fetch(`${authUrl}/ghost/api/admin/authentication/setup/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: authUrl },
        body: JSON.stringify({
          setup: [
            {
              name: 'Admin',
              email: config.adminEmail,
              password,
              blogTitle: config.title,
            },
          ],
        }),
      });

      // Get session cookie from setup response (Ghost sets it on 201)
      let sessionCookie = setupRes.headers.get('set-cookie')?.split(';')[0] ?? null;

      if (setupRes.ok) {
        // Fresh setup succeeded — cookie should be in the response
        if (!sessionCookie) {
          // Fallback: sign in explicitly
          sessionCookie = await signIn(ghostUrl, config.adminEmail, password);
        }
        if (!sessionCookie) {
          throw new AdapterError('ghost', 'setup', 'Failed to get session after setup');
        }
      } else if (setupRes.status === 403) {
        // Already set up — try to sign in with deterministic password
        sessionCookie = await signIn(ghostUrl, config.adminEmail, password);
        if (!sessionCookie) {
          throw new AdapterError(
            'ghost',
            'setup',
            'Ghost is already configured but login failed. This usually means email sending is not configured. Reset Ghost data and retry: docker compose down ghost ghost-db && docker volume rm the ghost volumes, then retry.',
          );
        }
      } else {
        const error = await setupRes.text();
        throw new AdapterError('ghost', 'setup', `Ghost setup failed: ${setupRes.status} ${error}`);
      }

      // Step 2: Get or create integration API keys (via auth URL for cookie support)
      const keys = await getOrCreateIntegration(authUrl, sessionCookie, authUrl);

      // Step 3: Update site settings (via auth URL for cookie support)
      const settingsRes = await fetch(`${authUrl}/ghost/api/admin/settings/`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Cookie: sessionCookie,
          Origin: authUrl,
        },
        body: JSON.stringify({
          settings: [
            { key: 'title', value: config.title },
            { key: 'description', value: config.description },
            { key: 'locale', value: config.language },
            ...buildCodeInjectionSettings(config.language),
            ...GHOST_SETTINGS,
          ],
        }),
      });

      if (!settingsRes.ok) {
        const error = await settingsRes.text();
        throw new AdapterError(
          'ghost',
          'setup',
          `Failed to update settings: ${settingsRes.status} ${error}`,
        );
      }

      // Step 4: Configure custom theme settings (session cookie only, not available via JWT)
      await updateCustomThemeSettings(authUrl, {
        Cookie: sessionCookie,
        Origin: authUrl,
      });

      // Step 5: Delete default posts (e.g. "Coming soon")
      await deleteAllPosts(authUrl, {
        Cookie: sessionCookie,
        Origin: authUrl,
      });

      return keys;
    },

    async uploadTheme(themePath: string): Promise<void> {
      const jwt = requireAdminJwt('uploadTheme');
      const ghostUrl = getGhostUrl();
      const headers = { Authorization: `Ghost ${jwt}` };

      // Skip upload if the theme is already installed and active
      const listRes = await fetch(`${ghostUrl}/ghost/api/admin/themes/`, { headers });
      if (listRes.ok) {
        const data = (await listRes.json()) as {
          themes: Array<{ name: string; active: boolean }>;
        };
        if (data.themes.some((t) => t.name === 'openant-source' && t.active)) return;
      }

      const fileBuffer = await fs.readFile(themePath);
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([fileBuffer], { type: 'application/zip' }),
        'openant-source.zip',
      );
      const res = await fetch(`${ghostUrl}/ghost/api/admin/themes/upload/`, {
        method: 'POST',
        headers,
        body: formData,
      });
      await assertOk(res, 'uploadTheme', 'Failed to upload theme');
    },

    async publishPost(post: PostData): Promise<PublishedPost> {
      const jwt = requireAdminJwt('publishPost');

      const res = await fetch(`${getGhostUrl()}/ghost/api/admin/posts/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Ghost ${jwt}`,
        },
        body: JSON.stringify({
          posts: [
            {
              title: post.title,
              html: post.html,
              status: 'published',
              tags: post.tags?.map((name) => ({ name })),
              meta_title: post.metaTitle,
              meta_description: post.metaDescription,
              feature_image: post.featureImage,
            },
          ],
        }),
      });
      await assertOk(res, 'publishPost', 'Ghost API error');

      const data = (await res.json()) as {
        posts: Array<{ id: string; url: string; slug: string }>;
      };
      const published = data.posts[0];

      return { id: published.id, url: published.url, slug: published.slug };
    },

    async getPostUrl(postId: string) {
      const contentApiKey = process.env.GHOST_CONTENT_API_KEY;
      if (!contentApiKey) {
        throw new AdapterError('ghost', 'getPostUrl', 'GHOST_CONTENT_API_KEY not set');
      }

      const res = await fetch(
        `${getGhostUrl()}/ghost/api/content/posts/${postId}/?key=${contentApiKey}`,
      );

      if (!res.ok) {
        throw new AdapterError('ghost', 'getPostUrl', `Failed to get post: ${res.status}`);
      }

      const data = (await res.json()) as { posts: Array<{ url: string }> };
      return data.posts[0].url;
    },
  };
}
