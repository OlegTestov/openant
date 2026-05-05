import { withAuth } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';
import { readState } from '@/lib/state';
import { createAdapters } from '@/lib/adapters';
import { testLlmConnection, testTelegramToken, testWebhook } from '@/lib/test-connections';
import { checkDns as checkDnsResolve } from '@/lib/dns-check';
import { cleanCustomDomain } from '@/lib/domain';
import type { SetupState } from '@/types/setup';

interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  detail: string;
}

async function checkServices(): Promise<CheckResult> {
  const adapters = createAdapters();
  const [ghost, nocodb, n8n] = await Promise.all([
    adapters.blog.healthCheck().catch(() => false),
    adapters.table.healthCheck().catch(() => false),
    adapters.automation.healthCheck().catch(() => false),
  ]);

  const failed = [!ghost && 'Ghost', !nocodb && 'NocoDB', !n8n && 'n8n'].filter(Boolean);

  if (failed.length === 0) {
    return { name: 'services', status: 'pass', detail: 'All services healthy' };
  }
  return { name: 'services', status: 'fail', detail: `Unhealthy: ${failed.join(', ')}` };
}

async function checkLlm(
  llm: { api_url: string; api_key: string; model: string } | undefined,
  isManaged: boolean,
): Promise<CheckResult> {
  if (isManaged || !llm) {
    return { name: 'llm', status: 'skip', detail: '' };
  }
  const result = await testLlmConnection(llm.api_url, llm.api_key, llm.model);
  return {
    name: 'llm',
    status: result.connected ? 'pass' : 'fail',
    detail: result.connected ? `${result.latency_ms}ms` : (result.error ?? 'Failed'),
  };
}

async function checkTelegram(telegram: { bot_token?: string } | undefined): Promise<CheckResult> {
  if (!telegram?.bot_token) {
    return { name: 'telegram', status: 'skip', detail: '' };
  }
  const result = await testTelegramToken(telegram.bot_token);
  return {
    name: 'telegram',
    status: result.connected ? 'pass' : 'fail',
    detail: result.connected ? (result.bot_name ?? '') : (result.error ?? 'Failed'),
  };
}

async function checkDns(state: SetupState): Promise<CheckResult> {
  const cleanDomain = cleanCustomDomain(state);
  if (!cleanDomain) {
    return { name: 'dns', status: 'skip', detail: '' };
  }
  // Check the blog subdomain (e.g. blog.olegtestov.com), not the bare domain
  const prefix = state.domain?.ghost_prefix || 'blog';
  const blogDomain = prefix ? `${prefix}.${cleanDomain}` : cleanDomain;
  const serverIp = process.env.SERVER_IP || '';
  const result = await checkDnsResolve(blogDomain, serverIp);
  if (result.matches_server) {
    return { name: 'dns', status: 'pass', detail: blogDomain };
  }
  return {
    name: 'dns',
    status: 'fail',
    detail: result.resolved
      ? `${blogDomain}: ${result.ip} (expected ${serverIp})`
      : `${blogDomain}: DNS does not resolve`,
  };
}

async function checkWebhook(
  social: { make_webhook_url?: string } | undefined,
): Promise<CheckResult> {
  if (!social?.make_webhook_url) {
    return { name: 'webhook', status: 'skip', detail: '' };
  }
  const result = await testWebhook(social.make_webhook_url);
  return {
    name: 'webhook',
    status: result.connected ? 'pass' : 'fail',
    detail: result.connected ? 'Make.com' : (result.error ?? 'Failed'),
  };
}

export const POST = withAuth(
  apiHandler(async () => {
    const state = await readState();
    const isManaged = process.env.INSTANCE_MODE === 'managed';

    const checks = await Promise.all([
      checkServices(),
      checkLlm(state.llm, isManaged),
      checkTelegram(state.telegram),
      checkWebhook(state.social),
      checkDns(state),
    ]);

    return Response.json({ success: true, data: { checks } });
  }),
);
