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
  id?: string;
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
          // n8n ignores minutesInterval values >= 60, so convert to hours when appropriate
          if (node.type === 'n8n-nodes-base.scheduleTrigger' && node.parameters) {
            const rule = node.parameters.rule as
              | {
                  interval?: Array<{
                    field?: string;
                    minutesInterval?: number;
                    hoursInterval?: number;
                  }>;
                }
              | undefined;
            if (rule?.interval?.[0]) {
              const minutes = params.scheduleIntervalMinutes;
              if (minutes >= 60 && minutes % 60 === 0) {
                rule.interval[0] = { field: 'hours', hoursInterval: minutes / 60 };
              } else {
                rule.interval[0] = { field: 'minutes', minutesInterval: minutes };
              }
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

      // Escape a value for safe insertion into a JSON-serialized string
      const jsonSafe = (val: string): string => JSON.stringify(val).slice(1, -1); // strips outer quotes, keeps escaped chars

      // String-level substitution for language, tone, NocoDB, Ghost, and LLM markers
      const serialized = JSON.stringify(workflow)
        .replace(/\{\{BLOG_LANGUAGE\}\}/g, jsonSafe(params.blogLanguage))
        .replace(/\{\{BLOG_TONE\}\}/g, jsonSafe(params.blogTone))
        .replace(/\{\{NOCODB_BASE_ID\}\}/g, jsonSafe(params.nocodbBaseId ?? ''))
        .replace(/\{\{NOCODB_TABLE_ID\}\}/g, jsonSafe(params.nocodbTableId ?? ''))
        .replace(/\{\{NOCODB_PROMPTS_TABLE_ID\}\}/g, jsonSafe(params.nocodbPromptsTableId ?? ''))
        .replace(/\{\{GHOST_ADMIN_API_KEY\}\}/g, jsonSafe(params.ghostAdminApiKey ?? ''))
        .replace(/\{\{GHOST_API_URL\}\}/g, jsonSafe(params.ghostApiUrl ?? params.ghostUrl ?? ''))
        .replace(/\{\{GHOST_URL\}\}/g, jsonSafe(params.ghostUrl ?? ''))
        .replace(/\{\{LLM_API_URL\}\}/g, jsonSafe(params.llmApiUrl ?? ''))
        .replace(/\{\{LLM_API_KEY\}\}/g, jsonSafe(params.llmApiKey ?? ''))
        .replace(/\{\{LLM_IMAGE_MODEL\}\}/g, jsonSafe(params.llmImageModel ?? ''))
        .replace(/\{\{MAKE_WEBHOOK_URL\}\}/g, jsonSafe(params.makeWebhookUrl ?? ''))
        .replace(/\{\{PINTEREST_BOARD\}\}/g, jsonSafe(params.pinterestBoard ?? ''))
        .replace(/\{\{DEFAULT_LINK\}\}/g, jsonSafe(params.defaultLink ?? ''))
        .replace(/\{\{DEFAULT_LINK_NAME\}\}/g, jsonSafe(params.defaultLinkName ?? ''))
        .replace(/\{\{TELEGRAM_BOT_TOKEN\}\}/g, jsonSafe(params.telegramBotToken ?? ''))
        // TELEGRAM_CHAT_ID removed — fetched from NocoDB at runtime
        .replace(/\{\{NOCODB_AUTH_TOKEN\}\}/g, jsonSafe(params.nocodbAuthToken ?? ''))
        .replace(/\{\{INDEXNOW_KEY\}\}/g, jsonSafe(params.indexNowKey ?? ''));
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
      let wasActive = false;
      if (listRes.ok) {
        const listData = (await listRes.json()) as {
          data?: Array<{ id: string; name: string; active: boolean }>;
        };
        const existing = listData.data?.find((w) => w.name === workflowName);
        if (existing) {
          existingId = existing.id;
          wasActive = existing.active;
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

          // Preserve existing node IDs so n8n's Telegram webhook secret_token
          // (derived from workflowId + nodeId) stays stable across updates.
          const existingRes = await fetch(`${getN8nUrl()}/api/v1/workflows/${existing.id}`, {
            headers: { 'X-N8N-API-KEY': apiKey },
          });
          if (existingRes.ok) {
            const existingWf = (await existingRes.json()) as N8nWorkflow;
            const existingNodes = existingWf.nodes ?? [];
            for (const node of finalWorkflow.nodes ?? []) {
              const match = existingNodes.find((n) => n.name === node.name && n.type === node.type);
              if (match?.id) {
                node.id = match.id;
              }
            }
          }
        }
      }

      // Best-effort re-activation. We deactivate an active workflow before the
      // PUT (n8n's `active` field is read-only on update), so we must turn it
      // back on afterwards — otherwise a reconfigure silently leaves the live
      // workflow disabled and publishing stops until the next stack restart.
      const reactivate = async (id: string) => {
        try {
          const r = await fetch(`${getN8nUrl()}/api/v1/workflows/${id}/activate`, {
            method: 'POST',
            headers: { 'X-N8N-API-KEY': apiKey },
          });
          if (!r.ok) {
            console.warn(`Failed to re-activate workflow ${id}: ${r.status}`);
          }
        } catch (err) {
          console.warn(`Failed to re-activate workflow ${id}:`, err);
        }
      };

      let res: Response;
      try {
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
      } catch (err) {
        // Network failure during update — restore prior active state so we don't
        // leave a previously-running workflow stranded as disabled.
        if (existingId && wasActive) await reactivate(existingId);
        throw err;
      }

      if (!res.ok) {
        const error = await res.text();
        // Update rejected — restore prior active state before surfacing the error.
        if (existingId && wasActive) await reactivate(existingId);
        throw new AdapterError('n8n', 'importWorkflow', `Import failed: ${res.status} ${error}`);
      }

      const data = (await res.json()) as { id: string };

      // Re-activate if it was active before we deactivated it for the update.
      if (wasActive) await reactivate(data.id);

      return data.id;
    },

    async activateWorkflow(workflowId: string) {
      const apiKey = getApiKey('activateWorkflow');

      const res = await fetch(`${getN8nUrl()}/api/v1/workflows/${workflowId}/activate`, {
        method: 'POST',
        headers: { 'X-N8N-API-KEY': apiKey },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new AdapterError(
          'n8n',
          'activateWorkflow',
          `Activation failed: ${res.status}${body ? ` — ${body}` : ''}`,
        );
      }
    },

    async reactivateWorkflows() {
      const apiKey = getApiKey('reactivateWorkflows');
      const url = getN8nUrl();
      const headers = { 'X-N8N-API-KEY': apiKey };

      // Wait for n8n API to be fully ready (lags behind /healthz)
      await new Promise((r) => setTimeout(r, 10_000));

      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          const res = await fetch(`${url}/api/v1/workflows`, { headers });
          if (!res.ok) {
            console.error(`[reactivate] Failed to list workflows: ${res.status}`);
            continue;
          }

          const { data } = (await res.json()) as {
            data: Array<{ id: string; active: boolean }>;
          };
          if (data.length === 0) return;

          for (const wf of data) {
            if (wf.active) {
              // Re-cycle active workflows to re-register webhooks
              await fetch(`${url}/api/v1/workflows/${wf.id}/deactivate`, {
                method: 'POST',
                headers,
              });
              // Let n8n fully unregister webhook before re-registering
              await new Promise((r) => setTimeout(r, 2000));
            }
            await fetch(`${url}/api/v1/workflows/${wf.id}/activate`, {
              method: 'POST',
              headers,
            });
          }

          // Verify Telegram webhook if bot token is configured
          const botToken = process.env.TELEGRAM_BOT_TOKEN;
          if (botToken) {
            await new Promise((r) => setTimeout(r, 3000));
            try {
              const whRes = await fetch(`https://api.telegram.org/bot${botToken}/getWebhookInfo`);
              const whInfo = (await whRes.json()) as {
                result?: { last_error_date?: number; last_error_message?: string };
              };
              const lastErr = whInfo.result?.last_error_date;
              if (lastErr && Date.now() / 1000 - lastErr < 60) {
                console.error(
                  `[reactivate] Telegram webhook error: ${whInfo.result?.last_error_message}`,
                );
                continue; // retry the whole cycle
              }
            } catch {
              // Telegram API unreachable — skip verification
            }
          }

          return; // success
        } catch (err) {
          console.error(`[reactivate] Attempt ${attempt + 1}/5 failed:`, err);
        }
        if (attempt < 4) {
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
      console.error('[reactivate] All 5 attempts exhausted');
    },
  };
}
