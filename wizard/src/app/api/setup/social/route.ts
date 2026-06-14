import { z } from 'zod';
import { withAuth } from '@/lib/auth';
import { apiHandler } from '@/lib/api-handler';
import { readState, writeState } from '@/lib/state';
import { testWebhook } from '@/lib/test-connections';
import { fetchBufferChannels, bufferSelectionValid } from '@/lib/buffer';

export const socialSchema = z
  .object({
    make_webhook_url: z.string().url().optional().or(z.literal('')),
    pinterest_enabled: z.boolean(),
    threads_enabled: z.boolean(),
    instagram_enabled: z.boolean().optional().default(false),
    linkedin_enabled: z.boolean().optional().default(false),
    board: z.string().optional().or(z.literal('')),
    buffer_api_key: z.string().optional().or(z.literal('')),
    buffer_pinterest_channel_id: z.string().optional().or(z.literal('')),
    buffer_pinterest_board_id: z.string().optional().or(z.literal('')),
    buffer_instagram_channel_id: z.string().optional().or(z.literal('')),
    buffer_threads_channel_id: z.string().optional().or(z.literal('')),
    buffer_linkedin_channel_id: z.string().optional().or(z.literal('')),
    inro_api_key: z.string().optional().or(z.literal('')),
    inro_keyword: z.string().optional().or(z.literal('')),
    inro_tag_prefix: z.string().optional().or(z.literal('')),
  })
  .superRefine((v, ctx) => {
    // Inro tag prefix is appended to a caption hashtag and a caption_keywords
    // token (#<prefix><rowId>k) — only latin letters/digits are safe there.
    const tagPrefix = v.inro_tag_prefix?.trim() ?? '';
    if (tagPrefix && !/^[A-Za-z0-9]+$/.test(tagPrefix)) {
      ctx.addIssue({
        code: 'custom',
        path: ['inro_tag_prefix'],
        message: 'Tag prefix may contain only latin letters and digits (no spaces, # or symbols)',
      });
    }

    const anyEnabled =
      v.pinterest_enabled || v.threads_enabled || v.instagram_enabled || v.linkedin_enabled;
    if (!anyEnabled) return;

    if (v.buffer_api_key) {
      if (v.pinterest_enabled && (!v.buffer_pinterest_channel_id || !v.buffer_pinterest_board_id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['buffer_pinterest_channel_id'],
          message: 'Pinterest channel and board are required',
        });
      }
      if (v.instagram_enabled && !v.buffer_instagram_channel_id) {
        ctx.addIssue({
          code: 'custom',
          path: ['buffer_instagram_channel_id'],
          message: 'Instagram channel is required',
        });
      }
      if (v.threads_enabled && !v.buffer_threads_channel_id) {
        ctx.addIssue({
          code: 'custom',
          path: ['buffer_threads_channel_id'],
          message: 'Threads channel is required',
        });
      }
      if (v.linkedin_enabled && !v.buffer_linkedin_channel_id) {
        ctx.addIssue({
          code: 'custom',
          path: ['buffer_linkedin_channel_id'],
          message: 'LinkedIn channel is required',
        });
      }
    } else {
      if (v.instagram_enabled || v.linkedin_enabled) {
        ctx.addIssue({
          code: 'custom',
          path: ['buffer_api_key'],
          message: 'Instagram and LinkedIn publishing require Buffer',
        });
      }
      if (!v.make_webhook_url) {
        ctx.addIssue({
          code: 'custom',
          path: ['make_webhook_url'],
          message: 'Webhook URL or Buffer API key is required',
        });
      }
      if (v.pinterest_enabled && !v.board) {
        ctx.addIssue({
          code: 'custom',
          path: ['board'],
          message: 'Board name is required',
        });
      }
    }
  });

export const POST = withAuth(
  apiHandler(async (req: Request) => {
    const body = socialSchema.parse(await req.json());
    const state = await readState();

    // Preserve existing API key if masked placeholder submitted (same as LLM step)
    if (body.buffer_api_key === '***' && state.social?.buffer_api_key) {
      body.buffer_api_key = state.social.buffer_api_key;
    }
    if (body.inro_api_key === '***' && state.social?.inro_api_key) {
      body.inro_api_key = state.social.inro_api_key;
    }

    // Inro (comment→DM) values are free text — normalize before validation/use.
    const inroApiKey = body.inro_api_key?.trim() || '';
    const inroTagPrefix = body.inro_tag_prefix?.trim() || '';
    // When a key is provided the workflow needs a non-empty trigger keyword;
    // default it to the canonical CTA word rather than rejecting the form.
    const inroKeyword = inroApiKey ? body.inro_keyword?.trim() || 'ХОЧУ' : '';

    const anyEnabled =
      body.pinterest_enabled ||
      body.threads_enabled ||
      Boolean(body.instagram_enabled) ||
      Boolean(body.linkedin_enabled);
    const useBuffer = Boolean(body.buffer_api_key) && anyEnabled;

    if (useBuffer) {
      // Verify the key AND that every selected channel/board belongs to it —
      // stale ids (key changed, channel disconnected) would otherwise surface
      // only inside the n8n workflow after the article is already published.
      let channels;
      try {
        channels = await fetchBufferChannels(body.buffer_api_key ?? '');
      } catch {
        return Response.json(
          {
            success: false,
            error: 'Buffer API key is invalid or expired',
            code: 'BUFFER_KEY_INVALID',
          },
          { status: 400 },
        );
      }

      if (!bufferSelectionValid(channels, body)) {
        return Response.json(
          {
            success: false,
            error: 'Selected channel or board does not belong to this Buffer account',
            code: 'BUFFER_CHANNEL_INVALID',
          },
          { status: 400 },
        );
      }
    }

    state.social = {
      // Buffer and Make are mutually exclusive: the workflow prefers Buffer
      // when its key is set, so the inactive method's config is cleared.
      make_webhook_url: useBuffer ? undefined : body.make_webhook_url || undefined,
      pinterest_enabled: body.pinterest_enabled,
      threads_enabled: body.threads_enabled,
      instagram_enabled: body.instagram_enabled,
      linkedin_enabled: body.linkedin_enabled,
      board: useBuffer ? undefined : body.board || undefined,
      buffer_api_key: useBuffer ? body.buffer_api_key : undefined,
      // Channel ids are kept only for enabled networks — the n8n workflow
      // publishes to every non-empty channel id regardless of toggles.
      buffer_pinterest_channel_id:
        useBuffer && body.pinterest_enabled
          ? body.buffer_pinterest_channel_id || undefined
          : undefined,
      buffer_pinterest_board_id:
        useBuffer && body.pinterest_enabled
          ? body.buffer_pinterest_board_id || undefined
          : undefined,
      buffer_instagram_channel_id:
        useBuffer && body.instagram_enabled
          ? body.buffer_instagram_channel_id || undefined
          : undefined,
      buffer_threads_channel_id:
        useBuffer && body.threads_enabled ? body.buffer_threads_channel_id || undefined : undefined,
      buffer_linkedin_channel_id:
        useBuffer && body.linkedin_enabled
          ? body.buffer_linkedin_channel_id || undefined
          : undefined,
      // Inro comment→DM only applies to Instagram via Buffer and is persisted as
      // a coherent set keyed on the API key; clear stale values whenever Buffer
      // is unused, Instagram is disabled, or no Inro key is provided.
      inro_api_key: useBuffer && body.instagram_enabled && inroApiKey ? inroApiKey : undefined,
      inro_keyword: useBuffer && body.instagram_enabled && inroApiKey ? inroKeyword : undefined,
      inro_tag_prefix:
        useBuffer && body.instagram_enabled && inroApiKey ? inroTagPrefix || undefined : undefined,
    };
    state.steps.social = { completed: true };
    state.currentStep = 'review';

    await writeState(state);

    const webhookUrl = useBuffer ? undefined : body.make_webhook_url;
    const testResult = webhookUrl ? await testWebhook(webhookUrl) : undefined;

    return Response.json({
      success: true,
      data: testResult ? { test_result: testResult } : undefined,
    });
  }),
);
