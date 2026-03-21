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

const createSchema = z.object({
  topic: z.string().min(1),
  description: z.string().optional(),
  link: z.string().optional(),
  board: z.string().optional(),
});

const bulkCreateSchema = z.object({
  articles: z.array(createSchema).min(1).max(100),
});

const updateSchema = z.object({
  id: z.string().min(1),
  topic: z.string().min(1).optional(),
  description: z.string().optional(),
  link: z.string().optional(),
  board: z.string().optional(),
});

const deleteSchema = z.object({
  id: z.string().min(1),
});

export const GET = withAuth(
  apiHandler(async () => {
    const guard = saasGuard();
    if (guard) return guard;

    const adapters = createAdapters();
    const articles = await adapters.table.listArticles();
    return Response.json({ success: true, data: articles });
  }),
);

export const POST = withAuth(
  apiHandler(async (req) => {
    const guard = saasGuard();
    if (guard) return guard;

    const raw = await req.json();
    const adapters = createAdapters();

    // Bulk create: { articles: [...] }
    if ('articles' in raw) {
      const { articles } = bulkCreateSchema.parse(raw);
      const created = await adapters.table.createArticlesBulk(articles);
      return Response.json({ success: true, data: created });
    }

    // Single create: { topic, description?, link? }
    const body = createSchema.parse(raw);
    const article = await adapters.table.createArticle(body);
    return Response.json({ success: true, data: article });
  }),
);

export const PATCH = withAuth(
  apiHandler(async (req) => {
    const guard = saasGuard();
    if (guard) return guard;

    const body = updateSchema.parse(await req.json());
    const { id, ...input } = body;
    const adapters = createAdapters();
    await adapters.table.updateArticle(id, input);
    return Response.json({ success: true });
  }),
);

export const DELETE = withAuth(
  apiHandler(async (req) => {
    const guard = saasGuard();
    if (guard) return guard;

    const body = deleteSchema.parse(await req.json());
    const adapters = createAdapters();

    // Only allow deletion of articles in queue or error status
    const articles = await adapters.table.listArticles();
    const article = articles.find((a) => a.id === body.id);
    if (article && article.status !== 'queue' && article.status !== 'error') {
      return Response.json(
        { success: false, error: 'Cannot delete article in progress', code: 'DELETE_NOT_ALLOWED' },
        { status: 400 },
      );
    }

    await adapters.table.deleteArticle(body.id);
    return Response.json({ success: true });
  }),
);
