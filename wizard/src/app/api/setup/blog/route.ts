import { z } from 'zod';
import { withAuth } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';
import { readState, writeState } from '@/lib/state';
import { clampMinutesToMinutes } from '@/lib/normalize-interval';

export const blogSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title must be 100 characters or less'),
  description: z.string().max(200, 'Description must be 200 characters or less').optional(),
  language: z.string().min(1, 'Language is required'),
  tone: z.enum(['professional', 'casual', 'academic']),
  publish_interval_minutes: z.number().transform((v) => {
    const normalized = clampMinutesToMinutes(v);
    if (normalized !== v) {
      console.warn('[blog] publish_interval clamped:', { raw: v, normalized });
    }
    return normalized;
  }),
  default_link: z.string().url().optional().or(z.literal('')),
  default_link_name: z.string().max(200).optional().or(z.literal('')),
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
