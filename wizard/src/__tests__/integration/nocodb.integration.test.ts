import { describe, it, expect, beforeAll, vi } from 'vitest';
import crypto from 'crypto';
import { createNocoDBAdapter } from '@/lib/adapters/nocodb';
import { waitForService, NOCODB_URL } from './setup';

let authToken: string;
let tableId: string;

const testEmail = `test-${crypto.randomBytes(4).toString('hex')}@openant.local`;
const testPassword = crypto.randomBytes(16).toString('hex');

beforeAll(async () => {
  vi.stubEnv('NOCODB_INTERNAL_URL', NOCODB_URL);
  await waitForService(`${NOCODB_URL}/api/v1/health`, 'NocoDB');
});

describe('NocoDB integration', () => {
  it('healthCheck returns true when NocoDB is running', async () => {
    const adapter = createNocoDBAdapter();
    expect(await adapter.healthCheck()).toBe(true);
  });

  it('setup creates base, table, and columns', async () => {
    const adapter = createNocoDBAdapter();
    const result = await adapter.setup({
      adminEmail: testEmail,
      adminPassword: testPassword,
    });

    expect(result.authToken).toBeTruthy();
    expect(result.projectId).toBeTruthy();
    expect(result.tableId).toBeTruthy();

    authToken = result.authToken;
    tableId = result.tableId;

    // Set env vars for subsequent adapter calls
    vi.stubEnv('NOCODB_AUTH_TOKEN', authToken);
    vi.stubEnv('NOCODB_TABLE_ID', tableId);
  });

  it('getNextQueued returns null on empty table', async () => {
    const adapter = createNocoDBAdapter();
    const result = await adapter.getNextQueued();
    expect(result).toBeNull();
  });

  it('updateStatus changes record status', async () => {
    // Insert a row via NocoDB API directly
    const insertRes = await fetch(`${NOCODB_URL}/api/v2/tables/${tableId}/records`, {
      method: 'POST',
      headers: {
        'xc-token': authToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ Topic: 'Test Article', Status: 'queue' }),
    });
    if (!insertRes.ok) {
      const errorBody = await insertRes.text();
      throw new Error(`NocoDB insert failed: ${insertRes.status} ${errorBody}`);
    }
    const inserted = (await insertRes.json()) as { Id: number };

    const adapter = createNocoDBAdapter();
    await adapter.updateStatus(String(inserted.Id), 'generating');

    // Verify via getNextQueued (should not find 'queue' status)
    const queued = await adapter.getNextQueued();
    expect(queued).toBeNull();
  });

  it('getStats returns correct counts', async () => {
    const adapter = createNocoDBAdapter();
    const stats = await adapter.getStats();

    expect(stats.generating).toBeGreaterThanOrEqual(1);
    expect(stats.queue).toBe(0);
  });
});
