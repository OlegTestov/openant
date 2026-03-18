import { describe, it, expect, vi, afterEach } from 'vitest';
import { GET } from '../route';

describe('GET /api/setup/mode', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns instance_mode from environment variable', async () => {
    vi.stubEnv('INSTANCE_MODE', 'managed');

    const res = await GET();
    const data = await res.json();

    expect(data).toEqual({
      success: true,
      data: { instance_mode: 'managed' },
    });
  });

  it('defaults to byok when INSTANCE_MODE is not set', async () => {
    vi.stubEnv('INSTANCE_MODE', '');

    const res = await GET();
    const data = await res.json();

    expect(data).toEqual({
      success: true,
      data: { instance_mode: 'byok' },
    });
  });

  it('does not require authentication', async () => {
    vi.stubEnv('INSTANCE_MODE', 'managed');

    const res = await GET();

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});
