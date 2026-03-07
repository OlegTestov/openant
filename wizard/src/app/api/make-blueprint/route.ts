import { withAuth } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';
import blueprint from './blueprint.json';

const body = JSON.stringify(blueprint);

export const GET = withAuth(
  apiHandler(async () => {
    return new Response(body, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="openant-pinterest.json"',
      },
    });
  }),
);
