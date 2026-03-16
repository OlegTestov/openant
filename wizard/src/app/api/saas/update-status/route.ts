import { promises as fs } from 'fs';
import path from 'path';
import { apiHandler } from '@/lib/api-handler';
import { withAuth } from '@/lib/auth';

const STATUS_PATH = path.join(
  path.dirname(process.env.STATE_PATH || '/app/data/state.json'),
  'update-status.json',
);

export const GET = withAuth(
  apiHandler(async () => {
    try {
      const raw = await fs.readFile(STATUS_PATH, 'utf-8');
      const data = JSON.parse(raw);

      // If status is "running" but wizard restarted (timestamp > 30s ago),
      // the update completed — wizard container was rebuilt and is now serving.
      if (data.status === 'running' && Date.now() - data.timestamp > 30_000) {
        const done = { status: 'done', timestamp: Date.now() };
        await fs.writeFile(STATUS_PATH, JSON.stringify(done));
        return Response.json({ success: true, data: done });
      }

      return Response.json({ success: true, data });
    } catch {
      return Response.json({ success: true, data: { status: 'idle' } });
    }
  }),
);
