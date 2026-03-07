import { readFile } from 'fs/promises';
import { join } from 'path';
import { withAuth } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';

export const GET = withAuth(
  apiHandler(async () => {
    const blueprint = await readFile(join(process.cwd(), '..', 'make', 'blueprint.json'), 'utf-8');
    return new Response(blueprint, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="openant-pinterest.json"',
      },
    });
  }),
);
