import { withAuth } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';
import { createAdapters } from '@/lib/adapters';
import { readState } from '@/lib/state';
import { getServiceCredentials } from '@/lib/credentials';
import { getEffectiveDomain, getServiceDomains } from '@/lib/domain';

async function checkCaddy(): Promise<boolean> {
  try {
    const res = await fetch('http://caddy:80', {
      signal: AbortSignal.timeout(3000),
      redirect: 'manual',
    });
    // Caddy with domain config redirects HTTP→HTTPS (3xx), which counts as alive
    return res.ok || res.status === 404 || (res.status >= 300 && res.status < 400);
  } catch {
    return false;
  }
}

export const GET = withAuth(
  apiHandler(async () => {
    const adapters = createAdapters();

    const [ghost, nocodb, n8n] = await Promise.all([
      adapters.blog
        .healthCheck()
        .then((ok) => (ok ? 'healthy' : 'unhealthy'))
        .catch(() => 'unhealthy' as const),
      adapters.table
        .healthCheck()
        .then((ok) => (ok ? 'healthy' : 'unhealthy'))
        .catch(() => 'unhealthy' as const),
      adapters.automation
        .healthCheck()
        .then((ok) => (ok ? 'healthy' : 'unhealthy'))
        .catch(() => 'unhealthy' as const),
    ]);

    let caddy: 'healthy' | 'unhealthy';
    try {
      const ok = await checkCaddy();
      caddy = ok ? 'healthy' : 'unhealthy';
    } catch {
      caddy = 'unhealthy';
    }

    const state = await readState();
    const effectiveDomain = getEffectiveDomain(state);
    const ip = process.env.SERVER_IP || 'localhost';

    const isSaasMode = process.env.OPENANT_SAAS_MODE === 'true';
    const saasDomain = process.env.DOMAIN;

    let urls: { blog: string; table: string; n8n: string };
    if (isSaasMode && saasDomain) {
      // SaaS mode: always link to auto-generated subdomains (DNS pre-configured, always works)
      urls = {
        blog: `https://${saasDomain}`,
        table: `https://table.${saasDomain}`,
        n8n: `https://auto.${saasDomain}`,
      };
    } else {
      const domains = getServiceDomains(state);
      urls = domains
        ? {
            blog: `https://${domains.ghost}`,
            table: `https://${domains.nocodb}`,
            n8n: `https://${domains.n8n}`,
          }
        : {
            blog: `http://${ip}`,
            table: `http://${ip}:8080`,
            n8n: `http://${ip}:5678`,
          };
    }

    const credentials = getServiceCredentials(
      process.env.SETUP_TOKEN || '',
      effectiveDomain ?? undefined,
    );

    return Response.json({
      success: true,
      data: {
        ghost,
        nocodb,
        n8n,
        caddy,
        urls,
        credentials: {
          ghost: { ...credentials.ghost, adminUrl: `${urls.blog}/ghost/` },
          nocodb: credentials.nocodb,
          n8n: credentials.n8n,
        },
        saas_mode: process.env.OPENANT_SAAS_MODE === 'true',
      },
    });
  }),
);
