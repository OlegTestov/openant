import type { SetupState } from '@/types/setup';
import type { ServiceDomains } from '@/lib/caddy';

/** Resolve domain from wizard state, falling back to DOMAIN env var (set by cloud-init in SaaS mode) */
export function getEffectiveDomain(state: SetupState): string | null {
  if (state.domain?.use_domain) {
    return state.domain.domain ?? null;
  }
  return process.env.DOMAIN || null;
}

/** Build per-service domain map from state prefixes */
export function getServiceDomains(state: SetupState): ServiceDomains | null {
  const domain = getEffectiveDomain(state);
  if (!domain) return null;

  function resolve(prefix: string | undefined, fallback: string): string {
    const p = prefix ?? fallback;
    return p ? `${p}.${domain}` : domain!;
  }

  return {
    ghost: resolve(state.domain?.ghost_prefix, ''),
    nocodb: resolve(state.domain?.nocodb_prefix, 'table'),
    n8n: resolve(state.domain?.n8n_prefix, 'n8n'),
    wizard: `setup.${domain}`,
  };
}
