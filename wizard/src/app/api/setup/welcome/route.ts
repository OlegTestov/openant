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

    // Managed mode: auto-fill LLM step (key is pre-configured via cloud-init)
    if (process.env.INSTANCE_MODE === 'managed') {
      state.llm = {
        provider: 'managed',
        api_url: process.env.LLM_API_URL || '',
        api_key: process.env.LLM_API_KEY || '',
        model: process.env.LLM_MODEL || '',
        image_model: process.env.LLM_IMAGE_MODEL || '',
      };
      state.steps.llm = { completed: true };
    }

    await writeState(state);

    return Response.json({ success: true });
  }),
);
