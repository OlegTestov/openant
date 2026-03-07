import type { SetupState } from '@/types/setup';
import type { ServiceDomains } from '@/lib/caddy';

/** Resolve domain for admin emails, .env, and credentials.
 *  Prefers SaaS auto-assigned domain (stable slug) over custom domain.
 *  Custom domain is only for Caddy blocks and Pinterest links (via getCustomDomains). */
export function getEffectiveDomain(state: SetupState): string | null {
  if (process.env.DOMAIN) return process.env.DOMAIN;
  // BYOK mode: use domain from wizard state if configured
  if (state.domain?.use_domain) return state.domain.domain ?? null;
  return null;
}

export function isSaasMode(): boolean {
  return process.env.OPENANT_SAAS_MODE === 'true';
}

/** Whether the user has configured a custom domain */
export function hasCustomDomain(state: SetupState): boolean {
  return !!(state.domain?.use_domain && state.domain?.domain);
}

/** Build per-service domain map — always uses SaaS flat subdomains from DOMAIN env */
export function getServiceDomains(_state: SetupState): ServiceDomains | null {
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

/** Build custom domain map if user configured one (for Caddy + Pinterest links) */
export function getCustomDomains(state: SetupState): ServiceDomains | null {
  if (!state.domain?.use_domain || !state.domain?.domain) return null;
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
