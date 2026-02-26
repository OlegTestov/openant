import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { withAuth } from '../auth';

const MOCK_TOKEN = 'test-setup-token-123';

beforeEach(() => {
  vi.stubEnv('SETUP_TOKEN', MOCK_TOKEN);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function createRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/test', { headers });
}

const mockHandler = async () => {
  return Response.json({ success: true, data: 'ok' });
};

describe('withAuth', () => {
  it('passes request when token is valid', async () => {
    const handler = withAuth(mockHandler);
    const req = createRequest({ Authorization: `Bearer ${MOCK_TOKEN}` });

    const res = await handler(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
  });

  it('returns 401 when Authorization header is missing', async () => {
    const handler = withAuth(mockHandler);
    const req = createRequest();

    const res = await handler(req);

    expect(res.status).toBe(401);
  });

  it('returns 401 when token is wrong', async () => {
    const handler = withAuth(mockHandler);
    const req = createRequest({ Authorization: 'Bearer wrong-token' });

    const res = await handler(req);

    expect(res.status).toBe(401);
  });

  it('returns 401 when header format is wrong (no Bearer prefix)', async () => {
    const handler = withAuth(mockHandler);
    const req = createRequest({ Authorization: MOCK_TOKEN });

    const res = await handler(req);

    expect(res.status).toBe(401);
  });

  it('response body contains { success: false, error: "Unauthorized" }', async () => {
    const handler = withAuth(mockHandler);
    const req = createRequest();

    const res = await handler(req);
    const body = await res.json();

    expect(body).toEqual({ success: false, error: 'Unauthorized' });
  });
});
