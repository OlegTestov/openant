import { z } from 'zod';
import { withAuth } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';
import { readState } from '@/lib/state';
import { fetchBufferChannels } from '@/lib/buffer';

const bufferSchema = z.object({
  api_key: z.string().min(1),
});

export const POST = withAuth(
  apiHandler(async (req: Request) => {
    const body = bufferSchema.parse(await req.json());

    // Status route masks the stored key as '***' — resolve it so
    // "Load channels" works when revisiting the step without retyping the key
    let apiKey = body.api_key;
    if (apiKey === '***') {
      const state = await readState();
      if (state.social?.buffer_api_key) {
        apiKey = state.social.buffer_api_key;
      }
    }

    try {
      const channels = await fetchBufferChannels(apiKey);
      return Response.json({ success: true, data: { channels } });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Buffer API request failed';
      return Response.json(
        { success: false, error: message, code: 'BUFFER_API_ERROR' },
        { status: 400 },
      );
    }
  }),
);
