import { z } from 'zod';
import { apiHandler } from '@/lib/api-handler';
import { withAuth } from '@/lib/auth';
import { createAdapters } from '@/lib/adapters';

function saasGuard(): Response | null {
  if (process.env.OPENANT_SAAS_MODE !== 'true') {
    return Response.json({ error: 'SaaS mode not enabled' }, { status: 404 });
  }
  return null;
}

const updateSchema = z.object({
  articleTitle: z.string().optional(),
  articleText: z.string().optional(),
  articleImage: z.string().optional(),
  pinName: z.string().optional(),
  pinText: z.string().optional(),
  pinImage: z.string().optional(),
  threadText: z.string().optional(),
});

export const GET = withAuth(
  apiHandler(async () => {
    const guard = saasGuard();
    if (guard) return guard;

    const adapters = createAdapters();
    const prompts = await adapters.table.getPrompts();
    return Response.json({ success: true, data: prompts });
  }),
);

export const PATCH = withAuth(
  apiHandler(async (req) => {
    const guard = saasGuard();
    if (guard) return guard;

    const body = updateSchema.parse(await req.json());
    const adapters = createAdapters();
    await adapters.table.updatePrompts(body);
    return Response.json({ success: true });
  }),
);
