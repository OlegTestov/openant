import { z } from 'zod';
import { withAuth } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';
import { readState, writeState } from '@/lib/state';

export const welcomeSchema = z.object({
  language: z.enum(['en', 'ru']),
});

export const POST = withAuth(
  apiHandler(async (req: Request) => {
    const body = welcomeSchema.parse(await req.json());
    const state = await readState();

    state.welcome = body;
    state.steps.welcome = { completed: true };
    state.currentStep = 'domain';

    await writeState(state);

    return Response.json({ success: true });
  }),
);
