import { z } from 'zod';
import { withAuth } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';
import { readState, writeState } from '@/lib/state';
import { testLlmConnection } from '@/lib/test-connections';

export const llmSchema = z.object({
  provider: z.string(),
  api_url: z.string().url(),
  api_key: z.string().min(1, 'API key is required'),
  model: z.string().min(1, 'Model is required'),
  image_model: z.string().optional(),
});

export const POST = withAuth(
  apiHandler(async (req: Request) => {
    const body = llmSchema.parse(await req.json());
    const state = await readState();

    // Preserve existing API key if masked placeholder submitted
    if (body.api_key === '***' && state.llm?.api_key) {
      body.api_key = state.llm.api_key;
    }

    state.llm = body;
    state.steps.llm = { completed: true };
    state.currentStep = 'blog';

    await writeState(state);

    const testResult = await testLlmConnection(body.api_url, body.api_key, body.model);

    return Response.json({
      success: true,
      data: { test_result: testResult },
    });
  }),
);
