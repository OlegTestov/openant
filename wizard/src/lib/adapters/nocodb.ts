import crypto from 'crypto';
import type {
  TableAdapter,
  TableConfig,
  TableSetupResult,
  ArticleRow,
  ArticleStatus,
} from './types';
import { AdapterError } from '@/lib/errors';

const ALL_STATUSES: ArticleStatus[] = [
  'generating',
  'publishing',
  'published',
  'promoting',
  'completed',
  'error',
];

function getNocoDbUrl(): string {
  return process.env.NOCODB_INTERNAL_URL || 'http://nocodb:8080';
}

function getEnvOrThrow(name: string, operation: string): string {
  const value = process.env[name];
  if (!value) throw new AdapterError('nocodb', operation, `${name} not set`);
  return value;
}

async function nocoFetch(
  url: string,
  authToken: string,
  options: RequestInit = {},
): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      'xc-auth': authToken,
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    },
  });
}

async function createBase(baseUrl: string, authToken: string): Promise<string> {
  const res = await nocoFetch(`${baseUrl}/api/v2/meta/bases/`, authToken, {
    method: 'POST',
    body: JSON.stringify({ title: 'openant' }),
  });
  if (!res.ok) {
    const error = await res.text();
    throw new AdapterError('nocodb', 'setup', `Failed to create base: ${res.status} ${error}`);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

async function createArticlesTable(
  baseUrl: string,
  authToken: string,
  baseId: string,
): Promise<string> {
  const tableRes = await nocoFetch(`${baseUrl}/api/v2/meta/bases/${baseId}/tables/`, authToken, {
    method: 'POST',
    body: JSON.stringify({
      title: 'Articles',
      columns: [
        { title: 'Title', uidt: 'SingleLineText' },
        { title: 'Description', uidt: 'LongText' },
        { title: 'Link', uidt: 'URL' },
      ],
    }),
  });
  if (!tableRes.ok) {
    const error = await tableRes.text();
    throw new AdapterError(
      'nocodb',
      'setup',
      `Failed to create table: ${tableRes.status} ${error}`,
    );
  }

  const tableData = (await tableRes.json()) as { id: string };
  const tableId = tableData.id;

  // Create additional columns
  const additionalColumns = [
    {
      title: 'Status',
      uidt: 'SingleSelect',
      colOptions: {
        options: ALL_STATUSES.map((s) => ({ title: s })),
      },
    },
    { title: 'GhostURL', uidt: 'URL' },
    { title: 'PinURL', uidt: 'URL' },
    { title: 'Error', uidt: 'LongText' },
  ];

  for (const col of additionalColumns) {
    const colRes = await nocoFetch(`${baseUrl}/api/v2/meta/tables/${tableId}/columns/`, authToken, {
      method: 'POST',
      body: JSON.stringify(col),
    });
    if (!colRes.ok) {
      const error = await colRes.text();
      throw new AdapterError(
        'nocodb',
        'setup',
        `Failed to create column "${col.title}": ${colRes.status} ${error}`,
      );
    }
  }

  return tableId;
}

export function createNocoDBAdapter(): TableAdapter {
  return {
    async healthCheck() {
      try {
        const res = await fetch(`${getNocoDbUrl()}/api/v1/health`);
        return res.ok;
      } catch {
        return false;
      }
    },

    async setup(config: TableConfig): Promise<TableSetupResult> {
      const baseUrl = getNocoDbUrl();
      const password =
        config.adminPassword ||
        crypto
          .createHash('sha256')
          .update(`nocodb-admin-${process.env.SETUP_TOKEN || 'openant-default'}`)
          .digest('hex')
          .slice(0, 32);

      // Step 1: Sign up user (or skip if already exists)
      const signupRes = await fetch(`${baseUrl}/api/v1/auth/user/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: config.adminEmail,
          password,
        }),
      });

      if (!signupRes.ok) {
        const errorText = await signupRes.text();
        const isUserExists = errorText.includes('User already exist');
        if (!isUserExists) {
          throw new AdapterError(
            'nocodb',
            'setup',
            `Signup failed: ${signupRes.status} ${errorText}`,
          );
        }
      }

      // Step 2: Sign in to get auth token
      const signinRes = await fetch(`${baseUrl}/api/v1/auth/user/signin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: config.adminEmail,
          password,
        }),
      });

      if (!signinRes.ok) {
        const error = await signinRes.text();
        throw new AdapterError('nocodb', 'setup', `Signin failed: ${signinRes.status} ${error}`);
      }

      const signinData = (await signinRes.json()) as { token: string };
      const authToken = signinData.token;

      // Step 3: Check for existing "openant" base, or create one
      let baseId: string;
      let allBases: Array<{ id: string; title: string }> = [];
      const listBasesRes = await nocoFetch(`${baseUrl}/api/v2/meta/bases/`, authToken);
      if (listBasesRes.ok) {
        const listData = (await listBasesRes.json()) as {
          list?: Array<{ id: string; title: string }>;
        };
        allBases = listData.list ?? [];
        const existing = allBases.find((b) => b.title === 'openant');
        if (existing) {
          baseId = existing.id;
        } else {
          baseId = await createBase(baseUrl, authToken);
        }
      } else {
        baseId = await createBase(baseUrl, authToken);
      }

      // Remove default bases (e.g. "Getting Started") to keep workspace clean
      for (const base of allBases) {
        if (base.id !== baseId) {
          await nocoFetch(`${baseUrl}/api/v2/meta/bases/${base.id}`, authToken, {
            method: 'DELETE',
          });
        }
      }

      // Step 4: Check for existing "Articles" table, or create one
      let tableId: string;
      let tableCreated = false;
      const listTablesRes = await nocoFetch(
        `${baseUrl}/api/v2/meta/bases/${baseId}/tables/`,
        authToken,
      );
      if (listTablesRes.ok) {
        const tablesData = (await listTablesRes.json()) as {
          list?: Array<{ id: string; title: string }>;
        };
        const existingTable = tablesData.list?.find((t) => t.title === 'Articles');
        if (existingTable) {
          tableId = existingTable.id;
        } else {
          tableId = await createArticlesTable(baseUrl, authToken, baseId);
          tableCreated = true;
        }
      } else {
        tableId = await createArticlesTable(baseUrl, authToken, baseId);
        tableCreated = true;
      }

      // Step 5: Insert a sample row so the user sees table structure
      if (tableCreated) {
        await nocoFetch(`${baseUrl}/api/v2/tables/${tableId}/records`, authToken, {
          method: 'POST',
          body: JSON.stringify({
            Title: 'Example: 10 Tips for Productive Remote Work',
            Description:
              'A practical guide covering workspace setup, time management, and communication best practices for remote teams.',
            Link: 'https://example.com/remote-work-tips',
          }),
        });
      }

      return { authToken, projectId: baseId, tableId };
    },

    async getNextQueued(): Promise<ArticleRow | null> {
      const authToken = getEnvOrThrow('NOCODB_AUTH_TOKEN', 'getNextQueued');
      const tableId = getEnvOrThrow('NOCODB_TABLE_ID', 'getNextQueued');
      const baseUrl = getNocoDbUrl();

      const res = await nocoFetch(
        `${baseUrl}/api/v2/tables/${tableId}/records?where=(Status,blank)&sort=CreatedAt&limit=1`,
        authToken,
        { method: 'GET' },
      );

      if (!res.ok) {
        throw new AdapterError('nocodb', 'getNextQueued', `NocoDB error: ${res.status}`);
      }

      const data = (await res.json()) as {
        list?: Array<Record<string, unknown>>;
      };

      if (!data.list || data.list.length === 0) return null;

      const row = data.list[0];
      return {
        id: String(row.Title),
        title: row.Title as string,
        description: (row.Description as string) || undefined,
        link: (row.Link as string) || undefined,
        status: (row.Status as ArticleStatus) || 'queue',
        ghostUrl: (row.GhostURL as string) || undefined,
        pinUrl: (row.PinURL as string) || undefined,
        error: (row.Error as string) || undefined,
        createdAt: row.CreatedAt as string,
      };
    },

    async updateStatus(
      rowId: string,
      status: ArticleStatus,
      extra?: Partial<ArticleRow>,
    ): Promise<void> {
      const authToken = getEnvOrThrow('NOCODB_AUTH_TOKEN', 'updateStatus');
      const tableId = getEnvOrThrow('NOCODB_TABLE_ID', 'updateStatus');
      const baseUrl = getNocoDbUrl();

      const body: Record<string, unknown> = { Title: rowId, Status: status };
      if (extra?.ghostUrl) body.GhostURL = extra.ghostUrl;
      if (extra?.pinUrl) body.PinURL = extra.pinUrl;
      if (extra?.error) body.Error = extra.error;

      const res = await nocoFetch(`${baseUrl}/api/v2/tables/${tableId}/records`, authToken, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        throw new AdapterError('nocodb', 'updateStatus', `NocoDB PATCH error: ${res.status}`);
      }
    },

    async getStats(): Promise<Record<ArticleStatus, number>> {
      const authToken = getEnvOrThrow('NOCODB_AUTH_TOKEN', 'getStats');
      const tableId = getEnvOrThrow('NOCODB_TABLE_ID', 'getStats');
      const baseUrl = getNocoDbUrl();

      // Count rows with blank status as "queue" (pending)
      const queueRes = await nocoFetch(
        `${baseUrl}/api/v2/tables/${tableId}/records?where=(Status,blank)&limit=1`,
        authToken,
        { method: 'GET' },
      );
      if (!queueRes.ok) {
        throw new AdapterError('nocodb', 'getStats', `NocoDB error: ${queueRes.status}`);
      }
      const queueData = (await queueRes.json()) as {
        pageInfo?: { totalRows?: number };
      };

      const results = await Promise.all(
        ALL_STATUSES.map(async (status) => {
          const res = await nocoFetch(
            `${baseUrl}/api/v2/tables/${tableId}/records?where=(Status,eq,${status})&limit=1`,
            authToken,
            { method: 'GET' },
          );

          if (!res.ok) {
            throw new AdapterError('nocodb', 'getStats', `NocoDB error: ${res.status}`);
          }

          const data = (await res.json()) as {
            pageInfo?: { totalRows?: number };
          };
          return [status, data.pageInfo?.totalRows ?? 0] as const;
        }),
      );

      return {
        ...Object.fromEntries(results),
        queue: queueData.pageInfo?.totalRows ?? 0,
      } as Record<ArticleStatus, number>;
    },
  };
}
