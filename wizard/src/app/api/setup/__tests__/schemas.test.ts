import { describe, it, expect } from 'vitest';
import { welcomeSchema } from '../welcome/route';
import { domainSchema } from '../domain/route';
import { llmSchema } from '../llm/route';
import { blogSchema } from '../blog/route';
import { telegramSchema } from '../telegram/route';
import { socialSchema } from '../social/route';

describe('welcomeSchema', () => {
  it('accepts valid language (en)', () => {
    expect(() => welcomeSchema.parse({ language: 'en' })).not.toThrow();
  });

  it('accepts valid language (ru)', () => {
    expect(() => welcomeSchema.parse({ language: 'ru' })).not.toThrow();
  });

  it('rejects invalid language', () => {
    expect(() => welcomeSchema.parse({ language: 'xx' })).toThrow();
  });

  it('rejects missing language', () => {
    expect(() => welcomeSchema.parse({})).toThrow();
  });
});

describe('domainSchema', () => {
  it('accepts use_domain=false without domain', () => {
    expect(() => domainSchema.parse({ use_domain: false })).not.toThrow();
  });

  it('accepts use_domain=true with valid domain', () => {
    expect(() => domainSchema.parse({ use_domain: true, domain: 'example.com' })).not.toThrow();
  });

  it('rejects use_domain=true without domain', () => {
    expect(() => domainSchema.parse({ use_domain: true })).toThrow();
  });

  it('rejects use_domain=true with empty domain', () => {
    expect(() => domainSchema.parse({ use_domain: true, domain: '' })).toThrow();
  });

  it('accepts optional prefix fields', () => {
    expect(() =>
      domainSchema.parse({
        use_domain: true,
        domain: 'example.com',
        ghost_prefix: 'blog',
        nocodb_prefix: 'table',
        n8n_prefix: 'n8n',
      }),
    ).not.toThrow();
  });

  it('accepts empty ghost_prefix for root domain', () => {
    expect(() =>
      domainSchema.parse({
        use_domain: true,
        domain: 'example.com',
        ghost_prefix: '',
      }),
    ).not.toThrow();
  });
});

describe('llmSchema', () => {
  it('accepts all fields filled', () => {
    expect(() =>
      llmSchema.parse({
        provider: 'openai',
        api_url: 'https://api.openai.com/v1',
        api_key: 'sk-test',
        model: 'gpt-4o-mini',
      }),
    ).not.toThrow();
  });

  it('rejects invalid api_url (not a URL)', () => {
    expect(() =>
      llmSchema.parse({
        provider: 'openai',
        api_url: 'not-a-url',
        api_key: 'sk-test',
        model: 'gpt-4o-mini',
      }),
    ).toThrow();
  });

  it('rejects empty api_key', () => {
    expect(() =>
      llmSchema.parse({
        provider: 'openai',
        api_url: 'https://api.openai.com/v1',
        api_key: '',
        model: 'gpt-4o-mini',
      }),
    ).toThrow();
  });

  it('rejects empty model', () => {
    expect(() =>
      llmSchema.parse({
        provider: 'openai',
        api_url: 'https://api.openai.com/v1',
        api_key: 'sk-test',
        model: '',
      }),
    ).toThrow();
  });
});

describe('blogSchema', () => {
  it('accepts valid blog config', () => {
    expect(() =>
      blogSchema.parse({
        title: 'My Blog',
        language: 'en',
        tone: 'professional',
        publish_interval_minutes: 60,
      }),
    ).not.toThrow();
  });

  it('rejects empty title', () => {
    expect(() =>
      blogSchema.parse({
        title: '',
        language: 'en',
        tone: 'professional',
        publish_interval_minutes: 60,
      }),
    ).toThrow();
  });

  it('rejects title over 100 characters', () => {
    expect(() =>
      blogSchema.parse({
        title: 'a'.repeat(101),
        language: 'en',
        tone: 'professional',
        publish_interval_minutes: 60,
      }),
    ).toThrow();
  });

  it.each([
    [5, 60],
    [30, 60],
    [0, 60],
    [-100, 60],
    [60, 60],
    [90, 120],
    [360, 360],
    [10080, 10080],
    [99999, 10080],
    [1.5, 60],
  ])('clamps publish_interval_minutes %d → %d', (input, expected) => {
    const parsed = blogSchema.parse({
      title: 'Blog',
      language: 'en',
      tone: 'professional',
      publish_interval_minutes: input,
    });
    expect(parsed.publish_interval_minutes).toBe(expected);
  });

  it('rejects invalid tone', () => {
    expect(() =>
      blogSchema.parse({
        title: 'Blog',
        language: 'en',
        tone: 'funny',
        publish_interval_minutes: 60,
      }),
    ).toThrow();
  });

  it('rejects description over 200 characters', () => {
    expect(() =>
      blogSchema.parse({
        title: 'Blog',
        description: 'a'.repeat(201),
        language: 'en',
        tone: 'professional',
        publish_interval_minutes: 60,
      }),
    ).toThrow();
  });

  it('allows optional description', () => {
    const result = blogSchema.parse({
      title: 'Blog',
      description: 'A great blog',
      language: 'en',
      tone: 'professional',
      publish_interval_minutes: 60,
    });
    expect(result.description).toBe('A great blog');
  });
});

describe('telegramSchema', () => {
  it('accepts empty (skip step)', () => {
    expect(() => telegramSchema.parse({ bot_token: '', chat_id: '' })).not.toThrow();
  });

  it('accepts bot token only', () => {
    expect(() => telegramSchema.parse({ bot_token: '123:ABC', chat_id: '' })).not.toThrow();
  });

  it('accepts bot token and chat id', () => {
    expect(() => telegramSchema.parse({ bot_token: '123:ABC', chat_id: '999' })).not.toThrow();
  });

  it('accepts missing fields (all optional)', () => {
    expect(() => telegramSchema.parse({})).not.toThrow();
  });

  it('accepts undefined values', () => {
    expect(() => telegramSchema.parse({ bot_token: undefined, chat_id: undefined })).not.toThrow();
  });
});

describe('socialSchema', () => {
  it('accepts all optional fields empty', () => {
    expect(() =>
      socialSchema.parse({
        make_webhook_url: '',
        pinterest_enabled: false,
        threads_enabled: false,
      }),
    ).not.toThrow();
  });

  it('accepts valid webhook URL with board', () => {
    expect(() =>
      socialSchema.parse({
        make_webhook_url: 'https://hook.make.com/abc123',
        pinterest_enabled: true,
        threads_enabled: true,
        board: 'My Pins',
      }),
    ).not.toThrow();
  });

  it('rejects invalid webhook URL', () => {
    expect(() =>
      socialSchema.parse({
        make_webhook_url: 'not-a-url',
        pinterest_enabled: false,
        threads_enabled: false,
      }),
    ).toThrow();
  });

  it('accepts boolean toggles', () => {
    const result = socialSchema.parse({
      make_webhook_url: 'https://hook.make.com/abc123',
      pinterest_enabled: true,
      threads_enabled: false,
      board: 'My Pins',
    });
    expect(result.pinterest_enabled).toBe(true);
    expect(result.threads_enabled).toBe(false);
  });

  it('accepts optional board field', () => {
    const result = socialSchema.parse({
      make_webhook_url: 'https://hook.make.com/abc123',
      pinterest_enabled: true,
      threads_enabled: false,
      board: 'My Pins',
    });
    expect(result.board).toBe('My Pins');
  });

  it('accepts empty board string', () => {
    expect(() =>
      socialSchema.parse({
        make_webhook_url: '',
        pinterest_enabled: false,
        threads_enabled: false,
        board: '',
      }),
    ).not.toThrow();
  });

  it('rejects Pinterest via Make without board', () => {
    expect(() =>
      socialSchema.parse({
        make_webhook_url: 'https://hook.make.com/abc123',
        pinterest_enabled: true,
        threads_enabled: false,
      }),
    ).toThrow();
  });

  it('rejects enabled networks without webhook or Buffer key', () => {
    expect(() =>
      socialSchema.parse({
        make_webhook_url: '',
        pinterest_enabled: true,
        threads_enabled: false,
        board: 'My Pins',
      }),
    ).toThrow();
  });

  it('accepts Buffer config with channel and board ids', () => {
    expect(() =>
      socialSchema.parse({
        make_webhook_url: '',
        pinterest_enabled: true,
        threads_enabled: true,
        instagram_enabled: true,
        buffer_api_key: '1/key',
        buffer_pinterest_channel_id: 'ch-pin',
        buffer_pinterest_board_id: 'b1',
        buffer_instagram_channel_id: 'ch-ig',
        buffer_threads_channel_id: 'ch-th',
      }),
    ).not.toThrow();
  });

  it('rejects Buffer Pinterest without board id', () => {
    expect(() =>
      socialSchema.parse({
        make_webhook_url: '',
        pinterest_enabled: true,
        threads_enabled: false,
        buffer_api_key: '1/key',
        buffer_pinterest_channel_id: 'ch-pin',
      }),
    ).toThrow();
  });

  it('rejects Instagram without Buffer', () => {
    expect(() =>
      socialSchema.parse({
        make_webhook_url: 'https://hook.make.com/abc123',
        pinterest_enabled: false,
        threads_enabled: false,
        instagram_enabled: true,
      }),
    ).toThrow();
  });

  it('rejects LinkedIn without Buffer', () => {
    expect(() =>
      socialSchema.parse({
        make_webhook_url: 'https://hook.make.com/abc123',
        pinterest_enabled: false,
        threads_enabled: false,
        linkedin_enabled: true,
      }),
    ).toThrow();
  });

  it('rejects Buffer LinkedIn enabled without a channel', () => {
    expect(() =>
      socialSchema.parse({
        make_webhook_url: '',
        pinterest_enabled: false,
        threads_enabled: false,
        linkedin_enabled: true,
        buffer_api_key: '1/key',
      }),
    ).toThrow();
  });

  it('accepts valid Inro fields with Buffer Instagram', () => {
    expect(() =>
      socialSchema.parse({
        make_webhook_url: '',
        pinterest_enabled: false,
        threads_enabled: false,
        instagram_enabled: true,
        buffer_api_key: '1/key',
        buffer_instagram_channel_id: 'ch-ig',
        inro_api_key: 'inro-secret',
        inro_keyword: 'ХОЧУ',
        inro_tag_prefix: 'oa',
      }),
    ).not.toThrow();
  });

  it('accepts empty Inro fields', () => {
    expect(() =>
      socialSchema.parse({
        make_webhook_url: '',
        pinterest_enabled: false,
        threads_enabled: false,
        inro_api_key: '',
        inro_keyword: '',
        inro_tag_prefix: '',
      }),
    ).not.toThrow();
  });

  it('rejects Inro tag prefix containing #', () => {
    expect(() =>
      socialSchema.parse({
        make_webhook_url: '',
        pinterest_enabled: false,
        threads_enabled: false,
        instagram_enabled: true,
        buffer_api_key: '1/key',
        buffer_instagram_channel_id: 'ch-ig',
        inro_tag_prefix: '#oa',
      }),
    ).toThrow();
  });

  it('rejects Inro tag prefix containing spaces', () => {
    expect(() =>
      socialSchema.parse({
        make_webhook_url: '',
        pinterest_enabled: false,
        threads_enabled: false,
        instagram_enabled: true,
        buffer_api_key: '1/key',
        buffer_instagram_channel_id: 'ch-ig',
        inro_tag_prefix: 'open ant',
      }),
    ).toThrow();
  });
});
