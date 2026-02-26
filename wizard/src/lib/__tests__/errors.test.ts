import { describe, it, expect } from 'vitest';
import { AdapterError } from '../errors';

describe('AdapterError', () => {
  it('message contains adapter and operation', () => {
    const error = new AdapterError('ghost', 'publishPost', 'API returned 500');
    expect(error.message).toContain('ghost');
    expect(error.message).toContain('publishPost');
    expect(error.message).toContain('API returned 500');
  });

  it('name is AdapterError', () => {
    const error = new AdapterError('nocodb', 'setup', 'Connection refused');
    expect(error.name).toBe('AdapterError');
  });

  it('is an instance of Error', () => {
    const error = new AdapterError('n8n', 'healthCheck', 'Timeout');
    expect(error).toBeInstanceOf(Error);
  });

  it('stores adapter and operation properties', () => {
    const error = new AdapterError('ghost', 'setup', 'Failed');
    expect(error.adapter).toBe('ghost');
    expect(error.operation).toBe('setup');
  });

  it('preserves cause', () => {
    const originalError = new Error('Network error');
    const error = new AdapterError('ghost', 'healthCheck', 'Connection failed', originalError);
    expect(error.cause).toBe(originalError);
  });
});
