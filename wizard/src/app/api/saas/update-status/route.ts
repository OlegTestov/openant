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
      return Response.json({ success: true, data });
    } catch {
      return Response.json({ success: true, data: { status: 'idle' } });
    }
  }),
);
