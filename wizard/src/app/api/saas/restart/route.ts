import { apiHandler } from '@/lib/api-handler';
import { withAuth } from '@/lib/auth';
import { restartServices } from '@/lib/docker';

export const POST = withAuth(
  apiHandler(async () => {
    if (process.env.OPENANT_SAAS_MODE !== 'true') {
      return Response.json({ error: 'SaaS mode not enabled' }, { status: 404 });
    }

    await restartServices();

    return Response.json({ success: true });
  }),
);
