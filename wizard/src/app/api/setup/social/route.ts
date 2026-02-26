import { z } from 'zod';
import { withAuth } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';
import { readState, writeState } from '@/lib/state';

export const socialSchema = z.object({
  make_webhook_url: z.string().url().optional().or(z.literal('')),
  pinterest_enabled: z.boolean(),
  threads_enabled: z.boolean(),
});

export const POST = withAuth(
  apiHandler(async (req: Request) => {
    const body = socialSchema.parse(await req.json());
    const state = await readState();

    state.social = {
      make_webhook_url: body.make_webhook_url || undefined,
      pinterest_enabled: body.pinterest_enabled,
      threads_enabled: body.threads_enabled,
    };
    state.steps.social = { completed: true };
    state.currentStep = 'review';

    await writeState(state);

    return Response.json({ success: true });
  }),
);
