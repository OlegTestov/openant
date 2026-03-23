import { z } from 'zod';
import { withAuth } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';
import { createAdapters } from '@/lib/adapters';

const toggleDraftSchema = z.object({
  id: z.string().min(1),
  draft: z.boolean(),
});

export const GET = withAuth(
  apiHandler(async () => {
    const adapters = createAdapters();
    const articles = await adapters.table.listArticles();
    return Response.json({ success: true, data: articles });
  }),
);

export const PATCH = withAuth(
  apiHandler(async (req: Request) => {
    const body = toggleDraftSchema.parse(await req.json());
    const adapters = createAdapters();

    const articles = await adapters.table.listArticles();
    const article = articles.find((a) => a.id === body.id);

    if (!article) {
      return Response.json(
        { success: false, error: 'Article not found', code: 'NOT_FOUND' },
        { status: 404 },
      );
    }

    if (article.status !== 'queue' && article.status !== 'draft') {
      return Response.json(
        {
          success: false,
          error: 'Can only toggle draft for queued or draft articles',
          code: 'STATUS_NOT_ALLOWED',
        },
        { status: 400 },
      );
    }

    const newStatus = body.draft ? 'draft' : 'queue';
    await adapters.table.updateStatus(article.id, newStatus);

    return Response.json({ success: true });
  }),
);
