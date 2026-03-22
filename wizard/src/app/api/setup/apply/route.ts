import { promises as fs } from 'fs';
import { withAuth } from '@/lib/auth';
import { readState, writeState } from '@/lib/state';
import { readEnv, writeEnv } from '@/lib/config';
import { generateCaddyfile, writeCaddyfile, writeSeoFiles } from '@/lib/caddy';
import { startServices, reloadCaddy } from '@/lib/docker';
import { createAdapters } from '@/lib/adapters';
import { createSSEStream, sendSSEEvent, closeSSE } from '@/lib/sse';
import { getServiceCredentials } from '@/lib/credentials';
import { getEffectiveDomain, getServiceDomains, getCustomDomains, isSaasMode } from '@/lib/domain';
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
  ghostAdminEmail?: string;
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
  { label: 'Uploading custom theme' },
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

async function readWorkflowTemplate(name: string): Promise<object> {
  const basePath = getWorkflowTemplatesPath();
  const content = await fs.readFile(`${basePath}/${name}.template.json`, 'utf-8');
  return JSON.parse(content) as object;
}

function isManaged(): boolean {
  return process.env.INSTANCE_MODE === 'managed';
}

function buildEnvVars(state: SetupState): Record<string, string> {
  const domains = getServiceDomains(state);
  const serverIp = process.env.SERVER_IP || '';
  const managed = isManaged();

  return {
    DOMAIN: getEffectiveDomain(state) ?? '',
    GHOST_URL: domains ? `https://${domains.ghost}` : `http://${serverIp}`,
    NOCODB_PUBLIC_URL: domains ? `https://${domains.nocodb}` : `http://${serverIp}:8080`,
    N8N_HOST: domains ? domains.n8n : serverIp,
    N8N_WEBHOOK_URL: domains ? `https://${domains.n8n}` : `http://${serverIp}:5678`,

    // Managed mode: LLM vars already set by cloud-init; BYOK mode: from wizard state
    LLM_API_URL: managed ? process.env.LLM_API_URL || '' : (state.llm?.api_url ?? ''),
    LLM_API_KEY: managed ? process.env.LLM_API_KEY || '' : (state.llm?.api_key ?? ''),
    LLM_MODEL: managed ? process.env.LLM_MODEL || '' : (state.llm?.model ?? ''),
    LLM_IMAGE_MODEL: managed ? process.env.LLM_IMAGE_MODEL || '' : (state.llm?.image_model ?? ''),

    BLOG_TITLE: state.blog?.title ?? '',
    BLOG_DESCRIPTION: state.blog?.description ?? '',
    BLOG_LANG: state.blog?.language ?? '',
    BLOG_TONE: state.blog?.tone ?? '',
    PUBLISH_INTERVAL_MINUTES: String(state.blog?.publish_interval_minutes ?? 60),

    MAKE_WEBHOOK_URL: state.social?.make_webhook_url ?? '',
    PINTEREST_ENABLED: String(state.social?.pinterest_enabled ?? false),
    THREADS_ENABLED: String(state.social?.threads_enabled ?? false),

    TELEGRAM_BOT_TOKEN: state.telegram?.bot_token ?? process.env.TELEGRAM_BOT_TOKEN ?? '',
    // TELEGRAM_CHAT_ID removed — NocoDB Prompts.TelegramChatId is the source of truth
  };
}

function buildUrls(state: SetupState): Record<string, string> {
  const domains = getServiceDomains(state);
  const ip = process.env.SERVER_IP || 'localhost';

  const urls: Record<string, string> = {
    blog: domains ? `https://${domains.ghost}` : `http://${ip}`,
    table: domains ? `https://${domains.nocodb}` : `http://${ip}:8080`,
  };

  if (!isManaged()) {
    urls.n8n = domains ? `https://${domains.n8n}` : `http://${ip}:5678`;
  }

  return urls;
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
      const domains = getServiceDomains(state);
      const customDomains = getCustomDomains(state);
      const caddyfile = generateCaddyfile(
        domains,
        process.env.INSTANCE_MODE,
        isSaasMode(),
        customDomains,
      );
      await writeCaddyfile(caddyfile);
      if (domains) {
        await writeSeoFiles(domains.ghost);
      }
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
      const svcDomains = getServiceDomains(state);
      const blogUrl = svcDomains
        ? `https://${svcDomains.ghost}`
        : `http://${process.env.SERVER_IP}`;
      const effectiveDomain = getEffectiveDomain(state);
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

      // Make admin email available for theme upload (session auth)
      const adminEmail = `admin@${effectiveDomain || 'openant.local'}`;
      ctx.ghostAdminEmail = adminEmail;
      process.env.GHOST_ADMIN_EMAIL = adminEmail;

      // Persist keys immediately so retries can recover
      const currentEnv = await readEnv(getEnvPath());
      await writeEnv(getEnvPath(), {
        ...currentEnv,
        GHOST_ADMIN_API_KEY: ghostResult.adminApiKey,
        GHOST_CONTENT_API_KEY: ghostResult.contentApiKey,
        GHOST_ADMIN_EMAIL: adminEmail,
      });
      break;
    }

    case 6: {
      const themePath = process.env.THEME_PATH || '/app/themes/openant-source.zip';
      await adapters.blog.uploadTheme(themePath);
      break;
    }

    case 7: {
      // Ghost adapter.setup() already configures title/description/locale
      // This step exists for pipeline progress visibility
      break;
    }

    case 8: {
      const nocoResult = await adapters.table.setup({
        adminEmail: `admin@${getEffectiveDomain(state) || 'openant.local'}`,
        blogLanguage: state.blog?.language,
        blogTone: state.blog?.tone,
      });
      ctx.nocoKeys = nocoResult;

      // Make keys available for subsequent steps and dashboard
      process.env.NOCODB_AUTH_TOKEN = nocoResult.authToken;
      process.env.NOCODB_BASE_ID = nocoResult.projectId;
      process.env.NOCODB_TABLE_ID = nocoResult.tableId;
      process.env.NOCODB_PROMPTS_TABLE_ID = nocoResult.promptsTableId;

      // Persist keys immediately so retries can recover
      const curEnv = await readEnv(getEnvPath());
      await writeEnv(getEnvPath(), {
        ...curEnv,
        NOCODB_AUTH_TOKEN: nocoResult.authToken,
        NOCODB_BASE_ID: nocoResult.projectId,
        NOCODB_TABLE_ID: nocoResult.tableId,
        NOCODB_PROMPTS_TABLE_ID: nocoResult.promptsTableId,
      });
      break;
    }

    case 9: {
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

    case 10: {
      // Managed mode: LLM credentials from env; BYOK: from wizard state
      const llmApiKey = isManaged() ? process.env.LLM_API_KEY || '' : (state.llm?.api_key ?? '');
      const llmApiUrl = isManaged() ? process.env.LLM_API_URL || '' : (state.llm?.api_url ?? '');

      // Create all credentials in parallel (independent n8n API calls)
      const credPromises: Array<Promise<[string, string]>> = [
        adapters.automation
          .createCredential({
            name: 'LLM API',
            type: 'openAiApi',
            data: {
              apiKey: llmApiKey,
              url: llmApiUrl,
              headerName: 'Authorization',
              headerValue: `Bearer ${llmApiKey}`,
            },
          })
          .then((id) => ['LLM API', id]),
        adapters.automation
          .createCredential({
            name: 'NocoDB',
            type: 'httpHeaderAuth',
            data: { name: 'xc-token', value: ctx.nocoKeys?.authToken ?? '' },
          })
          .then((id) => ['NocoDB', id]),
      ];

      const telegramToken = state.telegram?.bot_token;
      if (telegramToken) {
        credPromises.push(
          adapters.automation
            .createCredential({
              name: 'Telegram Bot',
              type: 'telegramApi',
              data: { accessToken: telegramToken },
            })
            .then((id) => ['Telegram Bot', id]),
        );
      }

      const credResults = await Promise.all(credPromises);
      ctx.credentialIds = Object.fromEntries(credResults);
      break;
    }

    case 11: {
      const generateTemplate = await readWorkflowTemplate('generate-article');

      const customDomains = getCustomDomains(state);
      const saasDomains = getServiceDomains(state);
      const envVars = buildEnvVars(state);

      // Public links (Pinterest, Telegram) use custom domain if available
      const ghostDomain = customDomains?.ghost ?? saasDomains?.ghost;
      const ghostUrl = ghostDomain ? `https://${ghostDomain}` : envVars.GHOST_URL;

      const workflowParams: WorkflowParams = {
        credentialIds: ctx.credentialIds ?? {},
        scheduleIntervalMinutes: state.blog?.publish_interval_minutes ?? 60,
        llmModel: isManaged() ? process.env.LLM_MODEL || '' : (state.llm?.model ?? ''),
        llmApiUrl: isManaged() ? process.env.LLM_API_URL || '' : (state.llm?.api_url ?? ''),
        llmApiKey: isManaged() ? process.env.LLM_API_KEY || '' : (state.llm?.api_key ?? ''),
        llmImageModel: isManaged()
          ? process.env.LLM_IMAGE_MODEL || ''
          : (state.llm?.image_model ?? ''),
        blogLanguage: state.blog?.language ?? '',
        blogTone: state.blog?.tone ?? '',
        makeWebhookUrl: state.social?.make_webhook_url,
        pinterestBoard: state.social?.board,
        defaultLink: state.blog?.default_link,
        nocodbBaseId: ctx.nocoKeys?.projectId,
        nocodbTableId: ctx.nocoKeys?.tableId,
        nocodbPromptsTableId: ctx.nocoKeys?.promptsTableId,
        ghostAdminApiKey: ctx.ghostKeys?.adminApiKey,
        ghostUrl,
        // Admin API always uses SaaS domain (Caddy internal TLS, no Let's Encrypt dependency)
        ghostApiUrl: saasDomains ? `https://${saasDomains.ghost}` : envVars.GHOST_URL,
        telegramBotToken: state.telegram?.bot_token || process.env.TELEGRAM_BOT_TOKEN,
        // telegramChatId removed — NocoDB Prompts.TelegramChatId is the source of truth
        nocodbAuthToken: ctx.nocoKeys?.authToken,
      };

      const importAndActivate = async (template: object) => {
        const id = await adapters.automation.importWorkflow(template, workflowParams);
        await adapters.automation.activateWorkflow(id);
      };

      const workflows = [importAndActivate(generateTemplate)];

      // Import and activate telegram-bot workflow (only if bot token is configured)
      if (state.telegram?.bot_token) {
        const telegramTemplate = await readWorkflowTemplate('telegram-bot');
        workflows.push(importAndActivate(telegramTemplate));
      }

      await Promise.all(workflows);
      break;
    }

    case 12: {
      const additionalEnv: Record<string, string> = {
        GHOST_ADMIN_API_KEY: ctx.ghostKeys?.adminApiKey ?? '',
        GHOST_CONTENT_API_KEY: ctx.ghostKeys?.contentApiKey ?? '',
        GHOST_ADMIN_EMAIL: ctx.ghostAdminEmail ?? '',
        NOCODB_AUTH_TOKEN: ctx.nocoKeys?.authToken ?? '',
        NOCODB_BASE_ID: ctx.nocoKeys?.projectId ?? '',
        NOCODB_TABLE_ID: ctx.nocoKeys?.tableId ?? '',
        NOCODB_PROMPTS_TABLE_ID: ctx.nocoKeys?.promptsTableId ?? '',
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
    Math.min(DEPLOY_STEPS.length, parseInt(url.searchParams.get('startFrom') || '1', 10)),
  );

  const state = await readState();

  const managed = process.env.INSTANCE_MODE === 'managed';
  if (!state.blog || (!managed && !state.llm)) {
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
      if (savedEnv.GHOST_ADMIN_EMAIL) {
        ctx.ghostAdminEmail = savedEnv.GHOST_ADMIN_EMAIL;
        process.env.GHOST_ADMIN_EMAIL = savedEnv.GHOST_ADMIN_EMAIL;
      }
    }
    if (savedEnv.NOCODB_AUTH_TOKEN && savedEnv.NOCODB_BASE_ID && savedEnv.NOCODB_TABLE_ID) {
      ctx.nocoKeys = {
        authToken: savedEnv.NOCODB_AUTH_TOKEN,
        projectId: savedEnv.NOCODB_BASE_ID,
        tableId: savedEnv.NOCODB_TABLE_ID,
        promptsTableId: savedEnv.NOCODB_PROMPTS_TABLE_ID ?? '',
      };
      process.env.NOCODB_AUTH_TOKEN = savedEnv.NOCODB_AUTH_TOKEN;
      process.env.NOCODB_BASE_ID = savedEnv.NOCODB_BASE_ID;
      process.env.NOCODB_TABLE_ID = savedEnv.NOCODB_TABLE_ID;
      if (savedEnv.NOCODB_PROMPTS_TABLE_ID) {
        process.env.NOCODB_PROMPTS_TABLE_ID = savedEnv.NOCODB_PROMPTS_TABLE_ID;
      }
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
      const credentialsResult: Record<string, unknown> = {
        ghost: { ...credentials.ghost, adminUrl: `${urls.blog}/ghost/` },
        nocodb: credentials.nocodb,
      };
      if (!isManaged()) {
        credentialsResult.n8n = credentials.n8n;
      }
      sendSSEEvent(controller, 'complete', {
        success: true,
        urls,
        credentials: credentialsResult,
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
