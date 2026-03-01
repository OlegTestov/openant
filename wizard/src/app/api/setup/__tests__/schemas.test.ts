import { describe, it, expect } from 'vitest';
import { welcomeSchema } from '../welcome/route';
import { domainSchema } from '../domain/route';
import { llmSchema } from '../llm/route';
import { blogSchema } from '../blog/route';
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

  it('rejects interval less than 10', () => {
    expect(() =>
      blogSchema.parse({
        title: 'Blog',
        language: 'en',
        tone: 'professional',
        publish_interval_minutes: 5,
      }),
    ).toThrow();
  });

  it('rejects non-integer interval', () => {
    expect(() =>
      blogSchema.parse({
        title: 'Blog',
        language: 'en',
        tone: 'professional',
        publish_interval_minutes: 10.5,
      }),
    ).toThrow();
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

  it('accepts valid webhook URL', () => {
    expect(() =>
      socialSchema.parse({
        make_webhook_url: 'https://hook.make.com/abc123',
        pinterest_enabled: true,
        threads_enabled: true,
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
      make_webhook_url: '',
      pinterest_enabled: true,
      threads_enabled: false,
    });
    expect(result.pinterest_enabled).toBe(true);
    expect(result.threads_enabled).toBe(false);
  });
});
