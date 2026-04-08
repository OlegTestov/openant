import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SetupState } from '@/types/setup';
import {
  getEffectiveDomain,
  isSaasMode,
  hasCustomDomain,
  getServiceDomains,
  getCustomDomains,
} from '../domain';

beforeEach(() => {
  vi.unstubAllEnvs();
});

describe('getEffectiveDomain', () => {
  it('returns DOMAIN env var when set', () => {
    vi.stubEnv('DOMAIN', 'azure-fox-42.openant.app');
    const state = {} as SetupState;

    expect(getEffectiveDomain(state)).toBe('azure-fox-42.openant.app');
  });

  it('returns state.domain.domain when use_domain is true and no env var', () => {
    const state = { domain: { use_domain: true, domain: 'example.com' } } as SetupState;

    expect(getEffectiveDomain(state)).toBe('example.com');
  });

  it('returns null when use_domain is false and no env var', () => {
    const state = { domain: { use_domain: false, domain: 'example.com' } } as SetupState;

    expect(getEffectiveDomain(state)).toBeNull();
  });

  it('returns null when state.domain is undefined', () => {
    const state = {} as SetupState;

    expect(getEffectiveDomain(state)).toBeNull();
  });

  it('env var takes precedence over state', () => {
    vi.stubEnv('DOMAIN', 'azure-fox-42.openant.app');
    const state = { domain: { use_domain: true, domain: 'example.com' } } as SetupState;

    expect(getEffectiveDomain(state)).toBe('azure-fox-42.openant.app');
  });
});

describe('isSaasMode', () => {
  it('returns true when OPENANT_SAAS_MODE is true', () => {
    vi.stubEnv('OPENANT_SAAS_MODE', 'true');

    expect(isSaasMode()).toBe(true);
  });

  it('returns false when OPENANT_SAAS_MODE is not set', () => {
    expect(isSaasMode()).toBe(false);
  });

  it('returns false when OPENANT_SAAS_MODE is false', () => {
    vi.stubEnv('OPENANT_SAAS_MODE', 'false');

    expect(isSaasMode()).toBe(false);
  });
});

describe('hasCustomDomain', () => {
  it('returns true when use_domain is true and domain is set', () => {
    const state = { domain: { use_domain: true, domain: 'example.com' } } as SetupState;

    expect(hasCustomDomain(state)).toBe(true);
  });

  it('returns false when use_domain is false', () => {
    const state = { domain: { use_domain: false, domain: 'example.com' } } as SetupState;

    expect(hasCustomDomain(state)).toBe(false);
  });

  it('returns false when domain is undefined', () => {
    const state = { domain: { use_domain: true } } as SetupState;

    expect(hasCustomDomain(state)).toBe(false);
  });

  it('returns false when domain is empty string', () => {
    const state = { domain: { use_domain: true, domain: '' } } as SetupState;

    expect(hasCustomDomain(state)).toBe(false);
  });
});

describe('getServiceDomains', () => {
  it('returns correct SaaS subdomains from DOMAIN env var', () => {
    vi.stubEnv('DOMAIN', 'azure-fox-42.openant.app');
    const state = {} as SetupState;

    expect(getServiceDomains(state)).toEqual({
      ghost: 'azure-fox-42-blog.openant.app',
      nocodb: 'azure-fox-42-table.openant.app',
      n8n: 'azure-fox-42-auto.openant.app',
      wizard: 'azure-fox-42-setup.openant.app',
    });
  });

  it('returns null when DOMAIN is not set', () => {
    const state = {} as SetupState;

    expect(getServiceDomains(state)).toBeNull();
  });

  it('returns null when DOMAIN has no dot', () => {
    vi.stubEnv('DOMAIN', 'localhost');
    const state = {} as SetupState;

    expect(getServiceDomains(state)).toBeNull();
  });
});

describe('getCustomDomains', () => {
  it('returns correct custom subdomains with default prefixes', () => {
    const state = { domain: { use_domain: true, domain: 'example.com' } } as SetupState;

    expect(getCustomDomains(state)).toEqual({
      ghost: 'blog.example.com',
      nocodb: 'table.example.com',
      n8n: 'auto.example.com',
      wizard: 'setup.example.com',
    });
  });

  it('returns correct custom subdomains with custom prefixes', () => {
    const state = {
      domain: {
        use_domain: true,
        domain: 'example.com',
        ghost_prefix: 'news',
        nocodb_prefix: 'db',
        n8n_prefix: 'workflows',
        wizard_prefix: 'admin',
      },
    } as SetupState;

    expect(getCustomDomains(state)).toEqual({
      ghost: 'news.example.com',
      nocodb: 'db.example.com',
      n8n: 'workflows.example.com',
      wizard: 'admin.example.com',
    });
  });

  it('returns bare domain for ghost when ghost_prefix is empty', () => {
    const state = {
      domain: {
        use_domain: true,
        domain: 'example.com',
        ghost_prefix: '',
      },
    } as SetupState;

    const result = getCustomDomains(state);
    expect(result?.ghost).toBe('example.com');
  });

  it('returns null when use_domain is false', () => {
    const state = { domain: { use_domain: false, domain: 'example.com' } } as SetupState;

    expect(getCustomDomains(state)).toBeNull();
  });

  it('returns null when domain is empty', () => {
    const state = { domain: { use_domain: true, domain: '' } } as SetupState;

    expect(getCustomDomains(state)).toBeNull();
  });

  it('returns null when state.domain is undefined', () => {
    const state = {} as SetupState;

    expect(getCustomDomains(state)).toBeNull();
  });
});
