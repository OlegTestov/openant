export type DomainNormalizeError =
  | 'empty'
  | 'has_path'
  | 'has_port'
  | 'invalid_chars'
  | 'invalid_format';

export type DomainNormalizeResult =
  | { ok: true; value: string }
  | { ok: false; error: DomainNormalizeError };

const HOSTNAME_RE = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;

export function normalizeDomain(raw: string): DomainNormalizeResult {
  let v = raw.trim();
  if (v.length === 0) return { ok: false, error: 'empty' };

  v = v.replace(/^https?:\/\//i, '');
  v = v.replace(/\/+$/, '');
  v = v.replace(/\.+$/, '');
  v = v.toLowerCase();

  if (v.length === 0) return { ok: false, error: 'empty' };
  if (v.includes('/')) return { ok: false, error: 'has_path' };
  if (v.includes(':')) return { ok: false, error: 'has_port' };
  if (/\s/.test(v)) return { ok: false, error: 'invalid_chars' };
  if (!HOSTNAME_RE.test(v)) return { ok: false, error: 'invalid_format' };

  return { ok: true, value: v };
}
