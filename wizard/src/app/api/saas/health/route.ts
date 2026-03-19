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

  let autopublish: { workflowActive: boolean } | null = null;
  const n8nApiKey = process.env.N8N_API_KEY;
  if (n8n && n8nApiKey) {
    try {
      const n8nUrl = process.env.N8N_INTERNAL_URL || 'http://n8n:5678';
      const wfRes = await fetch(`${n8nUrl}/api/v1/workflows`, {
        headers: { 'X-N8N-API-KEY': n8nApiKey },
        signal: AbortSignal.timeout(5000),
      });
      if (wfRes.ok) {
        const wfData = (await wfRes.json()) as { data?: Array<{ active: boolean }> };
        const hasActive = wfData.data?.some((w) => w.active) ?? false;
        autopublish = { workflowActive: hasActive };
      }
    } catch {
      /* skip — n8n API not reachable */
    }
  }

  let telegram: Record<string, unknown> | null = null;
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (botToken) {
    try {
      const whRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
      const whInfo = (await whRes.json()) as {
        result?: {
          url?: string;
          pending_update_count?: number;
          last_error_message?: string;
          last_error_date?: number;
        };
      };
      const r = whInfo.result;
      telegram = {
        webhookActive: !!r?.url,
        pendingUpdates: r?.pending_update_count ?? 0,
        lastError: r?.last_error_message ?? null,
        lastErrorAge: r?.last_error_date ? Math.round(Date.now() / 1000 - r.last_error_date) : null,
      };
    } catch {
      telegram = { webhookActive: false, error: 'unreachable' };
    }
  }

  return Response.json({
    wizard: 'healthy',
    ghost: ghost ? 'healthy' : 'unhealthy',
    nocodb: nocodb ? 'healthy' : 'unhealthy',
    n8n: n8n ? 'healthy' : 'unhealthy',
    autopublish,
    telegram,
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
