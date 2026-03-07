import { describe, it, expect, vi, beforeEach } from 'vitest';

const MOCK_TOKEN = 'test-token-123';

beforeEach(() => {
  vi.stubEnv('SETUP_TOKEN', MOCK_TOKEN);
});

function createAuthRequest(): Request {
  return new Request('http://localhost/api/make-blueprint', {
    headers: { Authorization: `Bearer ${MOCK_TOKEN}` },
  });
}

describe('GET /api/make-blueprint', () => {
  it('returns 401 without auth', async () => {
    const { GET } = await import('../route');
    const res = await GET(new Request('http://localhost/api/make-blueprint'));
    expect(res.status).toBe(401);
  });

  it('returns blueprint JSON with correct headers', async () => {
    const { GET } = await import('../route');
    const res = await GET(createAuthRequest());

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/json');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="openant-pinterest.json"',
    );

    const body = await res.text();
    const parsed = JSON.parse(body);
    expect(parsed.name).toBe('OpenAnt Pinterest');
  });
});
