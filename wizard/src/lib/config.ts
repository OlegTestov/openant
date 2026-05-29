import { promises as fs } from 'fs';
import path from 'path';

// Characters safe to leave unquoted in a docker-compose `.env` file.
const SAFE_UNQUOTED = /^[A-Za-z0-9_@%+=:,./-]+$/;

function envQuote(value: string): string {
  if (value === '') return '';
  if (SAFE_UNQUOTED.test(value)) return value;
  // Double-quoted form. We must NOT use POSIX single-quote escaping (`'\''`):
  // docker compose's `.env` parser rejects the backslash continuation, which
  // silently breaks *every* `docker compose` command on the instance (updates,
  // restarts, recreates) whenever a value contains a single quote — e.g. an
  // apostrophe in the blog title/description. Double quotes need no escaping for
  // single quotes, and both docker compose and parseEnv()/unquoteDouble() below
  // understand the same `\\`, `\"`, `\$`, and `` \` `` escapes.
  const escaped = value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`');
  return `"${escaped}"`;
}

function unquoteSingle(raw: string): string {
  // Parses a single-quoted POSIX string that may use the `'\''` continuation
  // sequence to embed a literal single quote. Returns the original raw value
  // if the input is not a well-formed single-quoted string.
  if (raw.length < 2 || raw[0] !== "'" || raw[raw.length - 1] !== "'") {
    return raw;
  }
  let out = '';
  let i = 1;
  const end = raw.length - 1;
  while (i < end) {
    const ch = raw[i];
    if (ch === "'") {
      if (raw.slice(i, i + 4) === `'\\''`) {
        out += "'";
        i += 4;
        continue;
      }
      return raw;
    }
    out += ch;
    i++;
  }
  return out;
}

function unquoteDouble(raw: string): string {
  // Parses a double-quoted POSIX string. Only the four characters bash
  // interprets inside double quotes are unescaped: `"`, `$`, `` ` ``, `\`.
  if (raw.length < 2 || raw[0] !== '"' || raw[raw.length - 1] !== '"') {
    return raw;
  }
  let out = '';
  let i = 1;
  const end = raw.length - 1;
  while (i < end) {
    const ch = raw[i];
    if (ch === '\\' && i + 1 < end) {
      const next = raw[i + 1];
      if (next === '"' || next === '$' || next === '`' || next === '\\') {
        out += next;
        i += 2;
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

export function parseEnv(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    const raw = trimmed.slice(eqIndex + 1);

    let value = raw;
    if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) {
      value = unquoteSingle(raw);
    } else if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
      value = unquoteDouble(raw);
    }

    result[key] = value;
  }

  return result;
}

export function serializeEnv(vars: Record<string, string>): string {
  return (
    Object.entries(vars)
      .map(([key, value]) => `${key}=${envQuote(value)}`)
      .join('\n') + '\n'
  );
}

export async function readEnv(filePath: string): Promise<Record<string, string>> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return parseEnv(content);
  } catch {
    return {};
  }
}

export async function writeEnv(filePath: string, vars: Record<string, string>): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(filePath, serializeEnv(vars), 'utf-8');
}
