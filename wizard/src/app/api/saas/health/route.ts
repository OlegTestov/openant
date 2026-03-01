import { apiHandler } from '@/lib/api-handler';
import { createAdapters } from '@/lib/adapters';
import { readState } from '@/lib/state';
import { getEffectiveDomain, getServiceDomains } from '@/lib/domain';

export const GET = apiHandler(async () => {
  if (process.env.OPENANT_SAAS_MODE !== 'true') {
    return Response.json({ error: 'SaaS mode not enabled' }, { status: 404 });
  }

  const adapters = createAdapters();

  const [ghost, nocodb, n8n] = await Promise.all([
    adapters.blog.healthCheck().catch(() => false),
    adapters.table.healthCheck().catch(() => false),
    adapters.automation.healthCheck().catch(() => false),
  ]);

  let stats: Record<string, number> | null;
  try {
    stats = await adapters.table.getStats();
  } catch {
    stats = null;
  }

  const state = await readState();
  const effectiveDomain = getEffectiveDomain(state);
  const serviceDomains = getServiceDomains(state);

  return Response.json({
    wizard: 'healthy',
    ghost: ghost ? 'healthy' : 'unhealthy',
    nocodb: nocodb ? 'healthy' : 'unhealthy',
    n8n: n8n ? 'healthy' : 'unhealthy',
    stats: stats
      ? {
          articles_queue: stats.queue,
          articles_published: stats.published,
          articles_completed: stats.completed,
          articles_error: stats.error,
        }
      : null,
    deployed: state.deployed ?? false,
    effective_domain: effectiveDomain,
    service_domains: serviceDomains
      ? { ghost: serviceDomains.ghost, nocodb: serviceDomains.nocodb, n8n: serviceDomains.n8n }
      : null,
  });
});
