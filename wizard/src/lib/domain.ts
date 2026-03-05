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

/** Build per-service domain map from state prefixes */
export function getServiceDomains(state: SetupState): ServiceDomains | null {
  const domain = getEffectiveDomain(state);
  if (!domain) return null;

  // SaaS mode: DOMAIN = "slug.openant.app", use flat subdomains like "slug-blog.openant.app"
  if (isSaasMode()) {
    const dotIndex = domain.indexOf('.');
    if (dotIndex === -1) return null;
    const slug = domain.slice(0, dotIndex);
    const baseDomain = domain.slice(dotIndex + 1);
    return {
      ghost: `${slug}-blog.${baseDomain}`,
      nocodb: `${slug}-table.${baseDomain}`,
      n8n: `${slug}-auto.${baseDomain}`,
      wizard: `${slug}-setup.${baseDomain}`,
    };
  }

  // Self-hosted mode: nested subdomains like "table.mydomain.com"
  function resolve(prefix: string | undefined, fallback: string): string {
    const p = prefix ?? fallback;
    return p ? `${p}.${domain}` : domain!;
  }

  return {
    ghost: resolve(state.domain?.ghost_prefix, ''),
    nocodb: resolve(state.domain?.nocodb_prefix, 'table'),
    n8n: resolve(state.domain?.n8n_prefix, 'auto'),
    wizard: `setup.${domain}`,
  };
}
