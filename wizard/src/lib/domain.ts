import type { SetupState } from '@/types/setup';
import type { ServiceDomains } from '@/lib/caddy';

/** Resolve domain from wizard state, falling back to DOMAIN env var (set by cloud-init in SaaS mode) */
export function getEffectiveDomain(state: SetupState): string | null {
  if (state.domain?.use_domain) {
    return state.domain.domain ?? null;
  }
  return process.env.DOMAIN || null;
}

export function isSaasMode(): boolean {
  return process.env.OPENANT_SAAS_MODE === 'true';
}

/** Whether the user has configured a custom domain */
export function hasCustomDomain(state: SetupState): boolean {
  return !!(state.domain?.use_domain && state.domain?.domain);
}

/** Build per-service domain map from state */
export function getServiceDomains(state: SetupState): ServiceDomains | null {
  // Case 1: User configured a custom domain — nested subdomains
  if (state.domain?.use_domain && state.domain?.domain) {
    const domain = state.domain.domain;
    const ghostPrefix = state.domain.ghost_prefix ?? 'blog';
    const nocodbPrefix = state.domain.nocodb_prefix ?? 'table';
    const n8nPrefix = state.domain.n8n_prefix ?? 'auto';
    return {
      ghost: ghostPrefix ? `${ghostPrefix}.${domain}` : domain,
      nocodb: `${nocodbPrefix}.${domain}`,
      n8n: `${n8nPrefix}.${domain}`,
      wizard: `setup.${domain}`,
    };
  }

  // Case 2: Auto-assigned domain from env (e.g. slug.openant.app) — flat subdomains
  const envDomain = process.env.DOMAIN;
  if (!envDomain) return null;

  const dotIndex = envDomain.indexOf('.');
  if (dotIndex === -1) return null;
  const slug = envDomain.slice(0, dotIndex);
  const baseDomain = envDomain.slice(dotIndex + 1);
  return {
    ghost: `${slug}-blog.${baseDomain}`,
    nocodb: `${slug}-table.${baseDomain}`,
    n8n: `${slug}-auto.${baseDomain}`,
    wizard: `${slug}-setup.${baseDomain}`,
  };
}
