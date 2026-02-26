import { withAuth } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';
import { createAdapters } from '@/lib/adapters';

export const GET = withAuth(
  apiHandler(async () => {
    const adapters = createAdapters();
    const stats = await adapters.table.getStats();

    return Response.json({
      success: true,
      data: stats,
    });
  }),
);
