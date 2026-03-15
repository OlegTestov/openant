import { z } from 'zod';
import { withAuth } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';
import { readState, writeState } from '@/lib/state';
import { testWebhook } from '@/lib/test-connections';

export const socialSchema = z.object({
  make_webhook_url: z.string().url().optional().or(z.literal('')),
  pinterest_enabled: z.boolean(),
  threads_enabled: z.boolean(),
  board: z.string().optional().or(z.literal('')),
});

export const POST = withAuth(
  apiHandler(async (req: Request) => {
    const body = socialSchema.parse(await req.json());
    const state = await readState();

    state.social = {
      make_webhook_url: body.make_webhook_url || undefined,
      pinterest_enabled: body.pinterest_enabled,
      threads_enabled: body.threads_enabled,
      board: body.board || undefined,
    };
    state.steps.social = { completed: true };
    state.currentStep = 'review';

    await writeState(state);

    const webhookUrl = body.make_webhook_url;
    const testResult = webhookUrl ? await testWebhook(webhookUrl) : undefined;

    return Response.json({
      success: true,
      data: testResult ? { test_result: testResult } : undefined,
    });
  }),
);
