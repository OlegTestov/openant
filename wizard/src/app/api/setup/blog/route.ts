import { z } from 'zod';
import { withAuth } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';
import { readState, writeState } from '@/lib/state';

export const blogSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title must be 100 characters or less'),
  description: z.string().max(200, 'Description must be 200 characters or less').optional(),
  language: z.string().min(1, 'Language is required'),
  tone: z.enum(['professional', 'casual', 'academic']),
  publish_interval_minutes: z.number().int().min(10, 'Minimum interval is 10 minutes'),
  default_link: z.string().url().optional().or(z.literal('')),
});

export const POST = withAuth(
  apiHandler(async (req: Request) => {
    const body = blogSchema.parse(await req.json());
    const state = await readState();

    state.blog = body;
    state.steps.blog = { completed: true };
    state.currentStep = 'social';

    await writeState(state);

    return Response.json({ success: true });
  }),
);
