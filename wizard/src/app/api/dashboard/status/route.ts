import { withAuth } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';
import { createAdapters } from '@/lib/adapters';
import { readEnv } from '@/lib/config';
import { getServiceCredentials } from '@/lib/credentials';

function getEnvPath(): string {
  return process.env.ENV_FILE_PATH || '/app/.env';
}

async function checkCaddy(): Promise<boolean> {
  try {
    const res = await fetch('http://caddy:80', {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok || res.status === 404;
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

    const env = await readEnv(getEnvPath());
    const domain = env.DOMAIN || null;
    const ip = process.env.SERVER_IP || 'localhost';

    const urls = domain
      ? {
          blog: `https://${domain}`,
          table: `https://table.${domain}`,
          n8n: `https://auto.${domain}`,
        }
      : {
          blog: `http://${ip}`,
          table: `http://${ip}:8080`,
          n8n: `http://${ip}:5678`,
        };

    const credentials = getServiceCredentials(process.env.SETUP_TOKEN || '', domain || undefined);

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
