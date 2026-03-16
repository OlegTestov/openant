import { promises as fs } from 'fs';
import path from 'path';
import { apiHandler } from '@/lib/api-handler';
import { withAuth } from '@/lib/auth';
import { updateAndRestart } from '@/lib/docker';

const STATUS_PATH = path.join(process.env.STATE_PATH || '/app/data', 'update-status.json');

async function writeStatus(status: string, error?: string) {
  await fs.writeFile(STATUS_PATH, JSON.stringify({ status, error, timestamp: Date.now() }));
}

export const POST = withAuth(
  apiHandler(async () => {
    if (process.env.OPENANT_SAAS_MODE !== 'true') {
      return Response.json({ error: 'SaaS mode not enabled' }, { status: 404 });
    }

    // Check if already running
    try {
      const raw = await fs.readFile(STATUS_PATH, 'utf-8');
      const current = JSON.parse(raw);
      if (current.status === 'running' && Date.now() - current.timestamp < 600_000) {
        return Response.json({ success: true, data: { status: 'running' } });
      }
    } catch {
      // no status file — proceed
    }

    // Fire and forget — don't await
    writeStatus('running');
    updateAndRestart()
      .then(() => writeStatus('done'))
      .catch((err) => writeStatus('error', err instanceof Error ? err.message : 'Unknown error'));

    return Response.json({ success: true, data: { status: 'running' } });
  }),
);
