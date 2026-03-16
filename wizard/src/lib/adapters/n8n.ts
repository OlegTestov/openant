import crypto from 'crypto';
import type {
  AutomationAdapter,
  AutomationConfig,
  AutomationSetupResult,
  CredentialData,
  WorkflowParams,
} from './types';
import { AdapterError } from '@/lib/errors';

interface N8nWorkflowNode {
  type?: string;
  name?: string;
  parameters?: Record<string, unknown>;
  credentials?: Record<string, { id: string; name?: string }>;
}

interface N8nWorkflow {
  name?: string;
  nodes?: N8nWorkflowNode[];
  connections?: unknown;
  settings?: Record<string, unknown>;
  staticData?: unknown;
  [key: string]: unknown;
}

function getN8nUrl(): string {
  return process.env.N8N_INTERNAL_URL || 'http://n8n:5678';
}

function getApiKey(operation: string): string {
  const apiKey = process.env.N8N_API_KEY;
  if (!apiKey) throw new AdapterError('n8n', operation, 'N8N_API_KEY not set');
  return apiKey;
}

export function createN8nAdapter(): AutomationAdapter {
  return {
    async healthCheck() {
      try {
        const res = await fetch(`${getN8nUrl()}/healthz`);
        return res.ok;
      } catch {
        return false;
      }
    },

    async setup(config: AutomationConfig): Promise<AutomationSetupResult> {
      const baseUrl = getN8nUrl();

      // Fast path: if we already have a valid API key, verify and return it
      const existingApiKey = process.env.N8N_API_KEY;
      if (existingApiKey) {
        try {
          const testRes = await fetch(`${baseUrl}/api/v1/workflows`, {
            headers: { 'X-N8N-API-KEY': existingApiKey },
          });
          if (testRes.ok) {
            return { apiKey: existingApiKey };
          }
        } catch {
          // Key invalid or n8n unreachable — fall through to full setup
        }
      }

      // n8n requires: min 8 chars, at least 1 uppercase, at least 1 number
      let password: string;
      if (process.env.N8N_ADMIN_PASSWORD) {
        password = process.env.N8N_ADMIN_PASSWORD;
      } else {
        const hash = crypto
          .createHash('sha256')
          .update(`n8n-admin-${process.env.SETUP_TOKEN || 'openant-default'}`)
          .digest('hex')
          .slice(0, 20);
        password = `N${hash}!`;
      }

      // Step 1: Create owner (skip if already exists)
      const setupRes = await fetch(`${baseUrl}/rest/owner/setup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: config.adminEmail,
          firstName: 'Admin',
          lastName: 'User',
          password,
        }),
      });
      if (!setupRes.ok && setupRes.status !== 400) {
        const error = await setupRes.text();
        throw new AdapterError('n8n', 'setup', `Owner setup failed: ${setupRes.status} ${error}`);
      }
      // If 400, check if it's "already exists" vs validation error
      if (setupRes.status === 400) {
        const errorText = await setupRes.text();
        const isAlreadySetUp =
          errorText.toLowerCase().includes('already') || errorText.toLowerCase().includes('set up');
        if (!isAlreadySetUp) {
          throw new AdapterError('n8n', 'setup', `Owner setup rejected: ${errorText}`);
        }
      }

      // Step 2: Sign in to get session cookie
      const loginRes = await fetch(`${baseUrl}/rest/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailOrLdapLoginId: config.adminEmail, password }),
      });
      if (!loginRes.ok) {
        const error = await loginRes.text();
        throw new AdapterError('n8n', 'setup', `Login failed: ${loginRes.status} ${error}`);
      }
      const cookie = loginRes.headers.get('set-cookie')?.split(';')[0];
      if (!cookie) {
        throw new AdapterError('n8n', 'setup', 'Login did not return a session cookie');
      }

      // Step 3: Check for existing API keys (skip masked ones — n8n masks existing keys with *)
      const listRes = await fetch(`${baseUrl}/rest/api-keys`, {
        headers: { Cookie: cookie },
      });
      if (listRes.ok) {
        const listData = (await listRes.json()) as {
          data?: Array<{ apiKey?: string; rawApiKey?: string; id?: string }>;
        };
        const validKey = listData.data?.find(
          (k) =>
            (k.rawApiKey && !k.rawApiKey.includes('*')) || (k.apiKey && !k.apiKey.includes('*')),
        );
        if (validKey) {
          return { apiKey: validKey.rawApiKey ?? validKey.apiKey ?? '' };
        }

        // Delete masked/invalid keys so we can create a fresh one
        if (listData.data) {
          for (const key of listData.data) {
            if (key.id) {
              await fetch(`${baseUrl}/rest/api-keys/${key.id}`, {
                method: 'DELETE',
                headers: { Cookie: cookie },
              });
            }
          }
        }
      }

      // Step 4: Create API key (n8n 2.x requires label, scopes, expiresAt)
      const tenYearsMs = Date.now() + 10 * 365 * 24 * 60 * 60 * 1000;
      const apiKeyRes = await fetch(`${baseUrl}/rest/api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookie },
        body: JSON.stringify({
          label: 'openant',
          scopes: [
            'workflow:create',
            'workflow:read',
            'workflow:update',
            'workflow:delete',
            'workflow:list',
            'workflow:execute',
            'workflow:activate',
            'workflow:deactivate',
            'credential:create',
            'credential:read',
            'credential:list',
            'credential:delete',
          ],
          expiresAt: tenYearsMs,
        }),
      });
      if (!apiKeyRes.ok) {
        const error = await apiKeyRes.text();
        throw new AdapterError(
          'n8n',
          'setup',
          `API key creation failed: ${apiKeyRes.status} ${error}`,
        );
      }
      const apiKeyData = (await apiKeyRes.json()) as {
        data: { apiKey?: string; rawApiKey?: string };
      };
      const newApiKey = apiKeyData.data.rawApiKey ?? apiKeyData.data.apiKey ?? '';
      return { apiKey: newApiKey };
    },

    async createCredential(cred: CredentialData) {
      const apiKey = getApiKey('createCredential');

      // Delete existing credentials with same name+type to prevent duplicates on re-deploy
      const listRes = await fetch(`${getN8nUrl()}/api/v1/credentials`, {
        headers: { 'X-N8N-API-KEY': apiKey },
      });
      if (listRes.ok) {
        const listData = (await listRes.json()) as {
          data?: Array<{ id: string; name: string; type: string }>;
        };
        const existing = listData.data?.filter((c) => c.name === cred.name && c.type === cred.type);
        if (existing) {
          for (const old of existing) {
            await fetch(`${getN8nUrl()}/api/v1/credentials/${old.id}`, {
              method: 'DELETE',
              headers: { 'X-N8N-API-KEY': apiKey },
            });
          }
        }
      }

      const res = await fetch(`${getN8nUrl()}/api/v1/credentials`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-N8N-API-KEY': apiKey,
        },
        body: JSON.stringify({
          name: cred.name,
          type: cred.type,
          data: cred.data,
        }),
      });

      if (!res.ok) {
        const error = await res.text();
        throw new AdapterError('n8n', 'createCredential', `n8n API error: ${res.status} ${error}`);
      }

      const data = (await res.json()) as { id: string };
      return data.id;
    },

    async importWorkflow(template: object, params: WorkflowParams) {
      const apiKey = getApiKey('importWorkflow');

      // Deep clone to avoid mutating the original template
      const workflow = JSON.parse(JSON.stringify(template)) as N8nWorkflow;

      // Structured substitution on nodes
      if (workflow.nodes) {
        for (const node of workflow.nodes) {
          // Schedule Trigger: set interval
          if (node.type === 'n8n-nodes-base.scheduleTrigger' && node.parameters) {
            const rule = node.parameters.rule as
              | { interval?: Array<{ minutesInterval?: number }> }
              | undefined;
            if (rule?.interval?.[0]) {
              rule.interval[0].minutesInterval = params.scheduleIntervalMinutes;
            }
          }

          // OpenAI node: set model (n8n uses modelId as resource locator)
          if (
            (node.type === 'n8n-nodes-base.openAi' ||
              node.type === '@n8n/n8n-nodes-langchain.openAi') &&
            node.parameters
          ) {
            const modelId = node.parameters.modelId as
              | { __rl?: boolean; value?: string }
              | undefined;
            if (modelId && typeof modelId === 'object') {
              modelId.value = params.llmModel;
            } else {
              node.parameters.modelId = { __rl: true, mode: 'id', value: params.llmModel };
            }
          }

          // HTTP Request (Make.com): set webhook URL
          if (
            node.type === 'n8n-nodes-base.httpRequest' &&
            node.name?.includes('Make') &&
            node.parameters
          ) {
            node.parameters.url = params.makeWebhookUrl || 'https://hook.placeholder.invalid';
          }

          // Substitute credential IDs by credential name
          if (node.credentials) {
            for (const [, credValue] of Object.entries(node.credentials)) {
              if (credValue.name && params.credentialIds[credValue.name]) {
                credValue.id = params.credentialIds[credValue.name];
              }
            }
          }
        }
      }

      // String-level substitution for language, tone, NocoDB, Ghost, and LLM markers
      const serialized = JSON.stringify(workflow)
        .replace(/\{\{BLOG_LANGUAGE\}\}/g, params.blogLanguage)
        .replace(/\{\{BLOG_TONE\}\}/g, params.blogTone)
        .replace(/\{\{NOCODB_BASE_ID\}\}/g, params.nocodbBaseId ?? '')
        .replace(/\{\{NOCODB_TABLE_ID\}\}/g, params.nocodbTableId ?? '')
        .replace(/\{\{NOCODB_PROMPTS_TABLE_ID\}\}/g, params.nocodbPromptsTableId ?? '')
        .replace(/\{\{GHOST_ADMIN_API_KEY\}\}/g, params.ghostAdminApiKey ?? '')
        .replace(/\{\{GHOST_API_URL\}\}/g, params.ghostApiUrl ?? params.ghostUrl ?? '')
        .replace(/\{\{GHOST_URL\}\}/g, params.ghostUrl ?? '')
        .replace(/\{\{LLM_API_URL\}\}/g, params.llmApiUrl ?? '')
        .replace(/\{\{LLM_API_KEY\}\}/g, params.llmApiKey ?? '')
        .replace(/\{\{LLM_IMAGE_MODEL\}\}/g, params.llmImageModel ?? '')
        .replace(/\{\{MAKE_WEBHOOK_URL\}\}/g, params.makeWebhookUrl ?? '')
        .replace(/\{\{PINTEREST_BOARD\}\}/g, params.pinterestBoard ?? '')
        .replace(/\{\{TELEGRAM_BOT_TOKEN\}\}/g, params.telegramBotToken ?? '')
        .replace(/\{\{TELEGRAM_CHAT_ID\}\}/g, params.telegramChatId ?? '')
        .replace(/\{\{NOCODB_AUTH_TOKEN\}\}/g, params.nocodbAuthToken ?? '');
      const finalWorkflow = JSON.parse(serialized) as N8nWorkflow;

      // Ensure required fields are present for n8n API
      if (!finalWorkflow.settings) {
        finalWorkflow.settings = {};
      }

      // Check if a workflow with the same name already exists → update instead of create
      const workflowName = finalWorkflow.name || 'Generate & Publish Article';
      const listRes = await fetch(`${getN8nUrl()}/api/v1/workflows`, {
        headers: { 'X-N8N-API-KEY': apiKey },
      });
      let existingId: string | null = null;
      if (listRes.ok) {
        const listData = (await listRes.json()) as {
          data?: Array<{ id: string; name: string; active: boolean }>;
        };
        const existing = listData.data?.find((w) => w.name === workflowName);
        if (existing) {
          existingId = existing.id;
          if (existing.active) {
            const deactivateRes = await fetch(
              `${getN8nUrl()}/api/v1/workflows/${existing.id}/deactivate`,
              {
                method: 'POST',
                headers: { 'X-N8N-API-KEY': apiKey },
              },
            );
            if (!deactivateRes.ok) {
              console.warn(`Failed to deactivate workflow ${existing.id}: ${deactivateRes.status}`);
            }
          }
        }
      }

      let res: Response;
      if (existingId) {
        res = await fetch(`${getN8nUrl()}/api/v1/workflows/${existingId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'X-N8N-API-KEY': apiKey,
          },
          body: JSON.stringify({
            name: finalWorkflow.name,
            nodes: finalWorkflow.nodes,
            connections: finalWorkflow.connections,
            settings: finalWorkflow.settings,
            staticData: finalWorkflow.staticData,
          }),
        });
      } else {
        res = await fetch(`${getN8nUrl()}/api/v1/workflows`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-N8N-API-KEY': apiKey,
          },
          body: JSON.stringify(finalWorkflow),
        });
      }

      if (!res.ok) {
        const error = await res.text();
        throw new AdapterError('n8n', 'importWorkflow', `Import failed: ${res.status} ${error}`);
      }

      const data = (await res.json()) as { id: string };
      return data.id;
    },

    async activateWorkflow(workflowId: string) {
      const apiKey = getApiKey('activateWorkflow');

      const res = await fetch(`${getN8nUrl()}/api/v1/workflows/${workflowId}/activate`, {
        method: 'POST',
        headers: { 'X-N8N-API-KEY': apiKey },
      });

      if (!res.ok) {
        throw new AdapterError('n8n', 'activateWorkflow', `Activation failed: ${res.status}`);
      }
    },

    async reactivateWorkflows() {
      const apiKey = getApiKey('reactivateWorkflows');
      const url = getN8nUrl();

      const res = await fetch(`${url}/api/v1/workflows`, {
        headers: { 'X-N8N-API-KEY': apiKey },
      });
      if (!res.ok) return;

      const { data } = (await res.json()) as {
        data: Array<{ id: string; active: boolean }>;
      };
      const active = data.filter((wf) => wf.active);

      for (const wf of active) {
        try {
          await fetch(`${url}/api/v1/workflows/${wf.id}/deactivate`, {
            method: 'POST',
            headers: { 'X-N8N-API-KEY': apiKey },
          });
          await fetch(`${url}/api/v1/workflows/${wf.id}/activate`, {
            method: 'POST',
            headers: { 'X-N8N-API-KEY': apiKey },
          });
        } catch {
          // Best-effort — don't fail the restart if one workflow fails
        }
      }
    },
  };
}
