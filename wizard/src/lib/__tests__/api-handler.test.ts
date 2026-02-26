import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import { apiHandler } from '../api-handler';
import { AdapterError } from '../errors';

function createRequest(): Request {
  return new Request('http://localhost/api/test');
}

describe('apiHandler', () => {
  it('passes successful response through', async () => {
    const handler = apiHandler(async () => {
      return Response.json({ success: true, data: 'ok' });
    });

    const res = await handler(createRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true, data: 'ok' });
  });

  it('catches ZodError and returns 400 with VALIDATION_ERROR', async () => {
    const schema = z.object({ name: z.string() });
    const handler = apiHandler(async () => {
      schema.parse({ name: 123 });
      return Response.json({ success: true });
    });

    const res = await handler(createRequest());
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.error).toBeDefined();
  });

  it('catches AdapterError and returns 500 with ADAPTER_ERROR', async () => {
    const handler = apiHandler(async () => {
      throw new AdapterError('ghost', 'publishPost', 'Ghost API returned 500');
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handler(createRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.code).toBe('ADAPTER_ERROR');
    expect(body.error).toContain('ghost');
    expect(body.error).toContain('publishPost');

    errorSpy.mockRestore();
  });

  it('catches unknown error and returns 500 with INTERNAL_ERROR', async () => {
    const handler = apiHandler(async () => {
      throw new Error('something unexpected');
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handler(createRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.code).toBe('INTERNAL_ERROR');

    errorSpy.mockRestore();
  });

  it('logs AdapterError to console.error', async () => {
    const handler = apiHandler(async () => {
      throw new AdapterError('nocodb', 'setup', 'Connection refused');
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await handler(createRequest());

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('AdapterError'), undefined);

    errorSpy.mockRestore();
  });

  it('logs unknown error to console.error', async () => {
    const originalError = new Error('boom');
    const handler = apiHandler(async () => {
      throw originalError;
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await handler(createRequest());

    expect(errorSpy).toHaveBeenCalledWith('Unexpected error:', originalError);

    errorSpy.mockRestore();
  });

  it('does not leak error details for unknown errors', async () => {
    const handler = apiHandler(async () => {
      throw new Error('secret database password exposed');
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await handler(createRequest());
    const body = await res.json();

    expect(body.error).toBe('Internal server error');
    expect(body.error).not.toContain('secret');

    errorSpy.mockRestore();
  });
});
