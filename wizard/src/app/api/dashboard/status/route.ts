import { withAuth } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';
import { createAdapters } from '@/lib/adapters';
import { readState } from '@/lib/state';
import { getServiceCredentials } from '@/lib/credentials';
import { getEffectiveDomain, getServiceDomains, isSaasMode } from '@/lib/domain';
import { checkDns } from '@/lib/dns-check';

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

    const [ghost, nocodb, n8n, caddy, state] = await Promise.all([
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
      checkCaddy()
        .then((ok): 'healthy' | 'unhealthy' => (ok ? 'healthy' : 'unhealthy'))
        .catch((): 'unhealthy' => 'unhealthy'),
      readState(),
    ]);
    const effectiveDomain = getEffectiveDomain(state);
    const ip = process.env.SERVER_IP || 'localhost';
    const managed = process.env.INSTANCE_MODE === 'managed';
    const domains = getServiceDomains(state);

    let urls: { blog: string; table: string; n8n?: string };
    if (domains) {
      urls = {
        blog: `https://${domains.ghost}`,
        table: `https://${domains.nocodb}`,
        ...(!managed && { n8n: `https://${domains.n8n}` }),
      };
    } else {
      urls = {
        blog: `http://${ip}`,
        table: `http://${ip}:8080`,
        ...(!managed && { n8n: `http://${ip}:5678` }),
      };
    }

    const credentials = getServiceCredentials(
      process.env.SETUP_TOKEN || '',
      effectiveDomain ?? undefined,
    );

    const credentialsResult: Record<string, unknown> = {
      ghost: { ...credentials.ghost, adminUrl: `${urls.blog}/ghost/` },
      nocodb: credentials.nocodb,
    };
    if (!managed) {
      credentialsResult.n8n = credentials.n8n;
    }

    const dnsCheck =
      state.domain?.use_domain && state.domain.domain
        ? await checkDns(state.domain.domain, ip)
        : null;

    return Response.json({
      success: true,
      data: {
        ghost,
        nocodb,
        n8n,
        caddy,
        urls,
        credentials: credentialsResult,
        saas_mode: isSaasMode(),
        dns_check: dnsCheck,
      },
    });
  }),
);
