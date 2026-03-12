import { z } from 'zod';
import { withAuth } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';
import { readState, writeState } from '@/lib/state';

export const telegramSchema = z.object({
  bot_token: z.string().optional().or(z.literal('')),
  chat_id: z.string().optional().or(z.literal('')),
});

export const POST = withAuth(
  apiHandler(async (req: Request) => {
    const body = telegramSchema.parse(await req.json());
    const state = await readState();

    // Preserve existing bot token if masked placeholder submitted (same pattern as LLM route)
    const botToken =
      body.bot_token && body.bot_token.startsWith('•') && state.telegram?.bot_token
        ? state.telegram.bot_token
        : body.bot_token || undefined;

    state.telegram = {
      bot_token: botToken,
      chat_id: body.chat_id || undefined,
    };
    state.steps.telegram = { completed: true };
    state.currentStep = 'social';

    await writeState(state);

    return Response.json({ success: true });
  }),
);
