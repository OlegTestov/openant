import { exec } from 'child_process';
import { promisify } from 'util';
import { readFile } from 'fs/promises';
import { AdapterError } from '@/lib/errors';
import { getCaddyfilePath } from '@/lib/caddy';

const execAsync = promisify(exec);

function getServiceUrls(): { ghost: string; nocodb: string; n8n: string } {
  return {
    ghost: process.env.GHOST_INTERNAL_URL || 'http://ghost:2368',
    nocodb: process.env.NOCODB_INTERNAL_URL || 'http://nocodb:8080',
    n8n: process.env.N8N_INTERNAL_URL || 'http://n8n:5678',
  };
}

async function waitForUrl(
  url: string,
  name: string,
  maxRetries = 30,
  delayMs = 2000,
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000), redirect: 'manual' });
      if (res.status < 400) return;
    } catch {
      // not ready yet
    }
    if (i < maxRetries - 1) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new AdapterError('docker', 'waitForService', `${name} did not become ready at ${url}`);
}

export async function startServices(): Promise<void> {
  const urls = getServiceUrls();

  // Services are started by install-dev.sh before the wizard runs.
  // The wizard container does not have docker CLI, so we can only
  // verify that services are healthy, not start them.
  try {
    const checks = await Promise.all([
      fetch(urls.ghost + '/ghost/api/admin/site/', {
        signal: AbortSignal.timeout(2000),
        redirect: 'manual',
      }).then((r) => r.status < 400),
      fetch(urls.nocodb + '/api/v1/health', { signal: AbortSignal.timeout(2000) }).then(
        (r) => r.ok,
      ),
      fetch(urls.n8n + '/healthz', { signal: AbortSignal.timeout(2000) }).then((r) => r.ok),
    ]);
    if (checks.every(Boolean)) {
      return;
    }
  } catch {
    // At least one service not reachable
  }

  // If services aren't healthy, wait for them to come up
  await Promise.all([
    waitForUrl(urls.ghost + '/ghost/api/admin/site/', 'Ghost'),
    waitForUrl(urls.nocodb + '/api/v1/health', 'NocoDB'),
    waitForUrl(urls.n8n + '/healthz', 'n8n'),
  ]);
}

/**
 * Reload Caddy config via its Admin API (POST /load with Caddyfile).
 * Caddy must have `admin 0.0.0.0:2019` in its global options block.
 * Falls back to docker exec CLI for environments without Admin API access.
 */
export async function reloadCaddy(): Promise<void> {
  const caddyAdminUrl = process.env.CADDY_ADMIN_URL || 'http://caddy:2019';

  // Method 1: Caddy Admin API — graceful hot reload, no Docker access needed
  try {
    const caddyfile = await readFile(getCaddyfilePath(), 'utf-8');

    const res = await fetch(`${caddyAdminUrl}/load`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/caddyfile', Origin: 'http://0.0.0.0:2019' },
      body: caddyfile,
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) return;
    console.warn(`[caddy] Admin API returned ${res.status}, falling back to docker exec`);
  } catch {
    // Admin API not available — fall through
  }

  // Method 2: docker exec CLI (works on host with Docker installed)
  try {
    await execAsync('docker exec openant-caddy caddy reload --config /etc/caddy/Caddyfile');
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (msg.includes('No such container') || msg.includes('not found')) {
      console.warn('[caddy] Container not found, skipping reload (local dev mode)');
      return;
    }
    throw new AdapterError('caddy', 'reload', 'Failed to reload Caddy configuration', error);
  }
}
