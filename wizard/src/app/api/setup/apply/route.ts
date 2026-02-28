import { promises as fs } from 'fs';
import { withAuth } from '@/lib/auth';
import { readState, writeState } from '@/lib/state';
import { readEnv, writeEnv } from '@/lib/config';
import { generateCaddyfile, writeCaddyfile } from '@/lib/caddy';
import { startServices, reloadCaddy } from '@/lib/docker';
import { createAdapters } from '@/lib/adapters';
import { createSSEStream, sendSSEEvent, closeSSE } from '@/lib/sse';
import { getServiceCredentials } from '@/lib/credentials';
import type { SetupState } from '@/types/setup';
import type { Adapters } from '@/lib/adapters';
import type {
  AutomationSetupResult,
  BlogSetupResult,
  TableSetupResult,
  WorkflowParams,
} from '@/lib/adapters/types';

interface DeployContext {
  ghostKeys?: BlogSetupResult;
  nocoKeys?: TableSetupResult;
  n8nKeys?: AutomationSetupResult;
  credentialIds?: Record<string, string>;
}

const DEPLOY_STEPS = [
  { label: 'Saving configuration to .env' },
  { label: 'Generating Caddyfile' },
  { label: 'Checking services' },
  { label: 'Reloading Caddy' },
  { label: 'Creating Ghost admin account' },
  { label: 'Configuring Ghost settings' },
  { label: 'Creating NocoDB table' },
  { label: 'Setting up n8n' },
  { label: 'Creating n8n credentials' },
  { label: 'Importing n8n workflows' },
  { label: 'Finalizing setup' },
];

function getEnvPath(): string {
  return process.env.ENV_FILE_PATH || '/app/.env';
}

function getWorkflowTemplatesPath(): string {
  return process.env.WORKFLOW_TEMPLATES_PATH || '/app/n8n/workflows';
}

/** Resolve domain from wizard state, falling back to DOMAIN env var (set by cloud-init in SaaS mode) */
function getEffectiveDomain(state: SetupState): string | null {
  if (state.domain?.use_domain) {
    return state.domain.domain ?? null;
  }
  return process.env.DOMAIN || null;
}

async function readWorkflowTemplate(name: string): Promise<object> {
  const basePath = getWorkflowTemplatesPath();
  const content = await fs.readFile(`${basePath}/${name}.template.json`, 'utf-8');
  return JSON.parse(content) as object;
}

function buildEnvVars(state: SetupState): Record<string, string> {
  const domain = getEffectiveDomain(state) ?? '';
  const serverIp = process.env.SERVER_IP || '';

  return {
    DOMAIN: domain,
    GHOST_URL: domain ? `https://${domain}` : `http://${serverIp}`,
    NOCODB_PUBLIC_URL: domain ? `https://table.${domain}` : `http://${serverIp}:8080`,
    N8N_HOST: domain ? `auto.${domain}` : serverIp,
    N8N_WEBHOOK_URL: domain ? `https://auto.${domain}` : `http://${serverIp}:5678`,

    LLM_API_URL: state.llm?.api_url ?? '',
    LLM_API_KEY: state.llm?.api_key ?? '',
    LLM_MODEL: state.llm?.model ?? '',

    BLOG_TITLE: state.blog?.title ?? '',
    BLOG_DESCRIPTION: state.blog?.description ?? '',
    BLOG_LANG: state.blog?.language ?? '',
    BLOG_TONE: state.blog?.tone ?? '',
    PUBLISH_INTERVAL_MINUTES: String(state.blog?.publish_interval_minutes ?? 60),

    MAKE_WEBHOOK_URL: state.social?.make_webhook_url ?? '',
    PINTEREST_ENABLED: String(state.social?.pinterest_enabled ?? false),
    THREADS_ENABLED: String(state.social?.threads_enabled ?? false),
  };
}

function buildUrls(state: SetupState): Record<string, string> {
  const domain = getEffectiveDomain(state);
  const ip = process.env.SERVER_IP || 'localhost';

  return {
    blog: domain ? `https://${domain}` : `http://${ip}`,
    table: domain ? `https://table.${domain}` : `http://${ip}:8080`,
    n8n: domain ? `https://auto.${domain}` : `http://${ip}:5678`,
  };
}

async function executeDeployStep(
  step: number,
  state: SetupState,
  adapters: Adapters,
  ctx: DeployContext,
): Promise<void> {
  switch (step) {
    case 1: {
      const envVars = buildEnvVars(state);
      // Merge with existing .env to preserve adapter keys from previous runs
      const existingEnv = await readEnv(getEnvPath());
      await writeEnv(getEnvPath(), { ...existingEnv, ...envVars });
      break;
    }

    case 2: {
      const domain = getEffectiveDomain(state);
      const caddyfile = generateCaddyfile(domain);
      await writeCaddyfile(caddyfile);
      break;
    }

    case 3: {
      await startServices();
      break;
    }

    case 4: {
      await reloadCaddy();
      break;
    }

    case 5: {
      const effectiveDomain = getEffectiveDomain(state);
      const blogUrl = effectiveDomain
        ? `https://${effectiveDomain}`
        : `http://${process.env.SERVER_IP}`;
      const ghostResult = await adapters.blog.setup({
        title: state.blog?.title ?? '',
        description: state.blog?.description ?? '',
        language: state.blog?.language ?? '',
        url: blogUrl,
        adminEmail: `admin@${effectiveDomain || 'openant.local'}`,
      });
      ctx.ghostKeys = ghostResult;

      // Make keys available for subsequent steps and dashboard
      process.env.GHOST_ADMIN_API_KEY = ghostResult.adminApiKey;
      process.env.GHOST_CONTENT_API_KEY = ghostResult.contentApiKey;

      // Persist keys immediately so retries can recover
      const currentEnv = await readEnv(getEnvPath());
      await writeEnv(getEnvPath(), {
        ...currentEnv,
        GHOST_ADMIN_API_KEY: ghostResult.adminApiKey,
        GHOST_CONTENT_API_KEY: ghostResult.contentApiKey,
      });
      break;
    }

    case 6: {
      // Ghost adapter.setup() already configures title/description/locale
      // This step exists for pipeline progress visibility
      break;
    }

    case 7: {
      const nocoResult = await adapters.table.setup({
        adminEmail: `admin@${getEffectiveDomain(state) || 'openant.local'}`,
      });
      ctx.nocoKeys = nocoResult;

      // Make keys available for subsequent steps and dashboard
      process.env.NOCODB_AUTH_TOKEN = nocoResult.authToken;
      process.env.NOCODB_BASE_ID = nocoResult.projectId;
      process.env.NOCODB_TABLE_ID = nocoResult.tableId;

      // Persist keys immediately so retries can recover
      const curEnv = await readEnv(getEnvPath());
      await writeEnv(getEnvPath(), {
        ...curEnv,
        NOCODB_AUTH_TOKEN: nocoResult.authToken,
        NOCODB_BASE_ID: nocoResult.projectId,
        NOCODB_TABLE_ID: nocoResult.tableId,
      });
      break;
    }

    case 8: {
      const n8nResult = await adapters.automation.setup({
        adminEmail: `admin@${getEffectiveDomain(state) || 'openant.local'}`,
      });
      ctx.n8nKeys = n8nResult;

      // Make the API key available for subsequent steps
      process.env.N8N_API_KEY = n8nResult.apiKey;

      // Persist key immediately so retries can recover
      const n8nEnv = await readEnv(getEnvPath());
      await writeEnv(getEnvPath(), {
        ...n8nEnv,
        N8N_API_KEY: n8nResult.apiKey,
      });
      break;
    }

    case 9: {
      const llmApiKey = state.llm?.api_key ?? '';
      const llmCredId = await adapters.automation.createCredential({
        name: 'LLM API',
        type: 'openAiApi',
        data: {
          apiKey: llmApiKey,
          url: state.llm?.api_url ?? '',
          headerName: 'Authorization',
          headerValue: `Bearer ${llmApiKey}`,
        },
      });
      const nocoCredId = await adapters.automation.createCredential({
        name: 'NocoDB',
        type: 'httpHeaderAuth',
        data: { name: 'xc-auth', value: ctx.nocoKeys?.authToken ?? '' },
      });
      ctx.credentialIds = {
        'LLM API': llmCredId,
        NocoDB: nocoCredId,
      };
      break;
    }

    case 10: {
      const generateTemplate = await readWorkflowTemplate('generate-article');
      const promoteTemplate = await readWorkflowTemplate('promote-article');

      const workflowParams: WorkflowParams = {
        credentialIds: ctx.credentialIds ?? {},
        scheduleIntervalMinutes: state.blog?.publish_interval_minutes ?? 60,
        llmModel: state.llm?.model ?? '',
        blogLanguage: state.blog?.language ?? '',
        blogTone: state.blog?.tone ?? '',
        makeWebhookUrl: state.social?.make_webhook_url,
        nocodbBaseId: ctx.nocoKeys?.projectId,
        nocodbTableId: ctx.nocoKeys?.tableId,
        ghostAdminApiKey: ctx.ghostKeys?.adminApiKey,
        ghostUrl: buildEnvVars(state).GHOST_URL,
      };

      const genId = await adapters.automation.importWorkflow(generateTemplate, workflowParams);
      await adapters.automation.activateWorkflow(genId);

      if (state.social?.make_webhook_url) {
        const promoId = await adapters.automation.importWorkflow(promoteTemplate, workflowParams);
        await adapters.automation.activateWorkflow(promoId);
      }
      break;
    }

    case 11: {
      const additionalEnv: Record<string, string> = {
        GHOST_ADMIN_API_KEY: ctx.ghostKeys?.adminApiKey ?? '',
        GHOST_CONTENT_API_KEY: ctx.ghostKeys?.contentApiKey ?? '',
        NOCODB_AUTH_TOKEN: ctx.nocoKeys?.authToken ?? '',
        NOCODB_BASE_ID: ctx.nocoKeys?.projectId ?? '',
        NOCODB_TABLE_ID: ctx.nocoKeys?.tableId ?? '',
        N8N_API_KEY: ctx.n8nKeys?.apiKey ?? '',
      };
      const currentEnv = await readEnv(getEnvPath());
      await writeEnv(getEnvPath(), { ...currentEnv, ...additionalEnv });

      state.deployed = true;
      state.steps.deploy = { completed: true };
      await writeState(state);
      break;
    }
  }
}

// SSE endpoint — uses withAuth only (not apiHandler, since response is a stream, not JSON)
export const POST = withAuth(async (req: Request) => {
  const url = new URL(req.url);
  const startFrom = Math.max(
    1,
    Math.min(11, parseInt(url.searchParams.get('startFrom') || '1', 10)),
  );

  const state = await readState();

  if (!state.blog || !state.llm) {
    return Response.json(
      { success: false, error: 'Incomplete configuration: blog and LLM settings are required' },
      { status: 400 },
    );
  }

  const adapters = createAdapters();
  const { stream, controller } = createSSEStream();

  const total = DEPLOY_STEPS.length;

  (async () => {
    const ctx: DeployContext = {};

    // Hydrate context and process.env from previously saved adapter keys
    const savedEnv = await readEnv(getEnvPath());
    if (savedEnv.GHOST_ADMIN_API_KEY && savedEnv.GHOST_CONTENT_API_KEY) {
      ctx.ghostKeys = {
        adminApiKey: savedEnv.GHOST_ADMIN_API_KEY,
        contentApiKey: savedEnv.GHOST_CONTENT_API_KEY,
      };
      process.env.GHOST_ADMIN_API_KEY = savedEnv.GHOST_ADMIN_API_KEY;
      process.env.GHOST_CONTENT_API_KEY = savedEnv.GHOST_CONTENT_API_KEY;
    }
    if (savedEnv.NOCODB_AUTH_TOKEN && savedEnv.NOCODB_BASE_ID && savedEnv.NOCODB_TABLE_ID) {
      ctx.nocoKeys = {
        authToken: savedEnv.NOCODB_AUTH_TOKEN,
        projectId: savedEnv.NOCODB_BASE_ID,
        tableId: savedEnv.NOCODB_TABLE_ID,
      };
      process.env.NOCODB_AUTH_TOKEN = savedEnv.NOCODB_AUTH_TOKEN;
      process.env.NOCODB_BASE_ID = savedEnv.NOCODB_BASE_ID;
      process.env.NOCODB_TABLE_ID = savedEnv.NOCODB_TABLE_ID;
    }
    if (savedEnv.N8N_API_KEY) {
      ctx.n8nKeys = { apiKey: savedEnv.N8N_API_KEY };
      process.env.N8N_API_KEY = savedEnv.N8N_API_KEY;
    }

    let currentStepIndex = startFrom;

    try {
      for (let i = startFrom; i <= total; i++) {
        currentStepIndex = i;
        const stepLabel = DEPLOY_STEPS[i - 1].label;

        sendSSEEvent(controller, 'step', { step: i, total, label: stepLabel, status: 'running' });

        await executeDeployStep(i, state, adapters, ctx);

        sendSSEEvent(controller, 'step', {
          step: i,
          total,
          label: stepLabel,
          status: 'completed',
        });
      }

      const urls = buildUrls(state);
      const credentials = getServiceCredentials(
        process.env.SETUP_TOKEN || '',
        getEffectiveDomain(state) ?? undefined,
      );
      sendSSEEvent(controller, 'complete', {
        success: true,
        urls,
        credentials: {
          ghost: { ...credentials.ghost, adminUrl: `${urls.blog}/ghost/` },
          nocodb: credentials.nocodb,
          n8n: credentials.n8n,
        },
      });
    } catch (error) {
      sendSSEEvent(controller, 'error', {
        step: currentStepIndex,
        label: DEPLOY_STEPS[currentStepIndex - 1].label,
        error: error instanceof Error ? error.message : 'Unknown error',
        recoverable: true,
      });
    } finally {
      closeSSE(controller);
    }
  })();

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
});
