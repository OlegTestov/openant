export const GHOST_URL = process.env.GHOST_INTERNAL_URL || 'http://localhost:2368';
export const NOCODB_URL = process.env.NOCODB_INTERNAL_URL || 'http://localhost:8080';
export const N8N_URL = process.env.N8N_INTERNAL_URL || 'http://localhost:5678';

export async function waitForService(
  url: string,
  name: string,
  maxRetries = 30,
  delayMs = 2000,
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // Service not ready yet
    }
    if (i < maxRetries - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw new Error(`Service "${name}" not available at ${url} after ${maxRetries} retries`);
}

/**
 * Sets up n8n owner account and generates an API key.
 * n8n does not support pre-configured API keys via env vars —
 * the owner must be created via REST API first, then an API key generated.
 */
export async function setupN8nApiKey(baseUrl: string): Promise<string> {
  const email = 'admin@openant.local';
  const password = 'DevPassword123!';

  // Step 1: Create owner (may already exist — 400 is OK)
  const setupRes = await fetch(`${baseUrl}/rest/owner/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, firstName: 'Admin', lastName: 'User', password }),
  });
  if (!setupRes.ok && setupRes.status !== 400) {
    throw new Error(`n8n owner setup failed: ${setupRes.status} ${await setupRes.text()}`);
  }

  // Step 2: Login to get session cookie
  const loginRes = await fetch(`${baseUrl}/rest/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!loginRes.ok) {
    throw new Error(`n8n login failed: ${loginRes.status}`);
  }
  const cookie = loginRes.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('n8n login did not return a session cookie');

  // Step 3: Create API key
  const apiKeyRes = await fetch(`${baseUrl}/rest/api-keys`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
  });
  if (!apiKeyRes.ok) {
    throw new Error(`n8n API key creation failed: ${apiKeyRes.status}`);
  }
  const apiKeyData = (await apiKeyRes.json()) as { data: { apiKey: string } };
  return apiKeyData.data.apiKey;
}
