import type { SetupState } from '@/types/setup';
import type { ServiceDomains } from '@/lib/caddy';
import { normalizeDomain } from '@/lib/normalize-domain';

/** Read the user's custom domain in normalized form, or null if not set/invalid.
 *  Defensive: silently strips http(s):// and trailing slashes from legacy state files
 *  written before input normalization landed. Returns null if the value can't be
 *  cleaned into a valid hostname (paths, ports, etc.) so callers don't build broken
 *  Caddy/DNS configs from garbage. */
export function cleanCustomDomain(state: SetupState): string | null {
  if (!state.domain?.use_domain || !state.domain?.domain) return null;
  const result = normalizeDomain(state.domain.domain);
  return result.ok ? result.value : null;
}

/** Resolve domain for admin emails, .env, and credentials.
 *  Prefers SaaS auto-assigned domain (stable slug) over custom domain.
 *  Custom domain is only for Caddy blocks and Pinterest links (via getCustomDomains). */
export function getEffectiveDomain(state: SetupState): string | null {
  if (process.env.DOMAIN) return process.env.DOMAIN;
  return cleanCustomDomain(state);
}

export function isSaasMode(): boolean {
  return process.env.OPENANT_SAAS_MODE === 'true';
}

/** Whether the user has configured a custom domain */
export function hasCustomDomain(state: SetupState): boolean {
  return cleanCustomDomain(state) !== null;
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
  const domain = cleanCustomDomain(state);
  if (!domain) return null;
  const ghostPrefix = state.domain?.ghost_prefix ?? 'blog';
  const nocodbPrefix = state.domain?.nocodb_prefix ?? 'table';
  const n8nPrefix = state.domain?.n8n_prefix ?? 'auto';
  const wizardPrefix = state.domain?.wizard_prefix ?? 'setup';
  return {
    ghost: ghostPrefix ? `${ghostPrefix}.${domain}` : domain,
    nocodb: `${nocodbPrefix}.${domain}`,
    n8n: `${n8nPrefix}.${domain}`,
    wizard: `${wizardPrefix}.${domain}`,
  };
}
