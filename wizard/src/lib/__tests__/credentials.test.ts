import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { getServiceCredentials } from '../credentials';

describe('getServiceCredentials', () => {
  const token = 'test-token-123';

  it('returns credentials for all three services', () => {
    const creds = getServiceCredentials(token);

    expect(creds.ghost).toHaveProperty('email');
    expect(creds.ghost).toHaveProperty('password');
    expect(creds.nocodb).toHaveProperty('email');
    expect(creds.nocodb).toHaveProperty('password');
    expect(creds.n8n).toHaveProperty('email');
    expect(creds.n8n).toHaveProperty('password');
  });

  it('uses domain in email when provided', () => {
    const creds = getServiceCredentials(token, 'example.com');

    expect(creds.ghost.email).toBe('admin@example.com');
    expect(creds.nocodb.email).toBe('admin@example.com');
    expect(creds.n8n.email).toBe('admin@example.com');
  });

  it('falls back to openant.local when no domain', () => {
    const creds = getServiceCredentials(token);

    expect(creds.ghost.email).toBe('admin@openant.local');
    expect(creds.nocodb.email).toBe('admin@openant.local');
    expect(creds.n8n.email).toBe('admin@openant.local');
  });

  it('generates Ghost password matching adapter logic', () => {
    const creds = getServiceCredentials(token);
    const expected = crypto
      .createHash('sha256')
      .update(`ghost-admin-${token}`)
      .digest('hex')
      .slice(0, 32);

    expect(creds.ghost.password).toBe(expected);
  });

  it('generates NocoDB password matching adapter logic', () => {
    const creds = getServiceCredentials(token);
    const expected = crypto
      .createHash('sha256')
      .update(`nocodb-admin-${token}`)
      .digest('hex')
      .slice(0, 32);

    expect(creds.nocodb.password).toBe(expected);
  });

  it('generates n8n password matching adapter logic (N<hash>! format)', () => {
    const creds = getServiceCredentials(token);
    const hash = crypto
      .createHash('sha256')
      .update(`n8n-admin-${token}`)
      .digest('hex')
      .slice(0, 20);
    const expected = `N${hash}!`;

    expect(creds.n8n.password).toBe(expected);
  });

  it('uses openant-default when token is empty', () => {
    const creds = getServiceCredentials('');
    const expected = crypto
      .createHash('sha256')
      .update('ghost-admin-openant-default')
      .digest('hex')
      .slice(0, 32);

    expect(creds.ghost.password).toBe(expected);
  });
});
