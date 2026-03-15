import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { testLlmConnection, testTelegramToken, testWebhook } from '../test-connections';

const originalFetch = global.fetch;
const mockFetch = vi.fn();

beforeEach(() => {
  global.fetch = mockFetch;
  vi.clearAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('testLlmConnection', () => {
  it('returns connected with latency on success', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ choices: [{ message: { content: 'ok' } }] }),
    });

    const result = await testLlmConnection('https://api.example.com/v1', 'key', 'model');

    expect(result.connected).toBe(true);
    expect(result.model_response).toBe('ok');
    expect(result.latency_ms).toBeGreaterThanOrEqual(0);
  });

  it('returns error on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401 });

    const result = await testLlmConnection('https://api.example.com/v1', 'bad-key', 'model');

    expect(result.connected).toBe(false);
    expect(result.error).toContain('401');
  });

  it('returns error on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

    const result = await testLlmConnection('https://api.example.com/v1', 'key', 'model');

    expect(result.connected).toBe(false);
    expect(result.error).toContain('ECONNREFUSED');
  });
});

describe('testTelegramToken', () => {
  it('returns connected with bot name on success', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ ok: true, result: { username: 'testbot' } }),
    });

    const result = await testTelegramToken('123:ABC');

    expect(result.connected).toBe(true);
    expect(result.bot_name).toBe('@testbot');
  });

  it('returns error on invalid token', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ ok: false, description: 'Unauthorized' }),
    });

    const result = await testTelegramToken('invalid');

    expect(result.connected).toBe(false);
    expect(result.error).toBe('Unauthorized');
  });

  it('returns error on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('fetch failed'));

    const result = await testTelegramToken('123:ABC');

    expect(result.connected).toBe(false);
    expect(result.error).toContain('fetch failed');
  });
});

describe('testWebhook', () => {
  it('returns connected on 200 response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true });

    const result = await testWebhook('https://hook.make.com/abc');

    expect(result.connected).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://hook.make.com/abc',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('openant-wizard'),
      }),
    );
  });

  it('returns error on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await testWebhook('https://hook.make.com/abc');

    expect(result.connected).toBe(false);
    expect(result.error).toContain('404');
  });

  it('returns error on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ENOTFOUND'));

    const result = await testWebhook('https://hook.make.com/abc');

    expect(result.connected).toBe(false);
    expect(result.error).toContain('ENOTFOUND');
  });
});
