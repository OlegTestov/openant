import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { parseEnv, serializeEnv, readEnv, writeEnv } from '../config';

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'config-test-'));
});

afterEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('parseEnv', () => {
  it('parses KEY=value pairs', () => {
    const result = parseEnv('FOO=bar\nBAZ=qux');
    expect(result).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('skips comments (# lines)', () => {
    const result = parseEnv('# comment\nFOO=bar');
    expect(result).toEqual({ FOO: 'bar' });
  });

  it('skips empty lines', () => {
    const result = parseEnv('FOO=bar\n\n\nBAZ=qux');
    expect(result).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('handles values with = sign', () => {
    const result = parseEnv('URL=postgres://user:pass@host:5432/db?sslmode=require');
    expect(result.URL).toBe('postgres://user:pass@host:5432/db?sslmode=require');
  });

  it('removes double quotes from values', () => {
    const result = parseEnv('FOO="hello world"');
    expect(result.FOO).toBe('hello world');
  });

  it('removes single quotes from values', () => {
    const result = parseEnv("FOO='hello world'");
    expect(result.FOO).toBe('hello world');
  });

  it('trims whitespace around keys', () => {
    const result = parseEnv('  FOO  =bar');
    expect(result.FOO).toBe('bar');
  });

  it('handles empty values', () => {
    const result = parseEnv('FOO=');
    expect(result.FOO).toBe('');
  });
});

describe('serializeEnv', () => {
  it('serializes key-value pairs', () => {
    const result = serializeEnv({ FOO: 'bar', BAZ: 'qux' });
    expect(result).toContain('FOO=bar');
    expect(result).toContain('BAZ=qux');
  });

  it('quotes values with spaces (double-quote)', () => {
    const result = serializeEnv({ FOO: 'hello world' });
    expect(result).toContain('FOO="hello world"');
  });

  it('escapes double quotes inside double-quoted values', () => {
    const result = serializeEnv({ DESC: 'a "quoted" word' });
    expect(result).toContain(`DESC="a \\"quoted\\" word"`);
  });

  it('escapes $, backtick, and backslash inside double-quoted values', () => {
    const result = serializeEnv({ V: 'has $var and `tick` and \\back' });
    expect(result).toContain(`V="has \\$var and \\\`tick\\\` and \\\\back"`);
  });

  it('wraps single quotes in double quotes (no POSIX backslash continuation)', () => {
    const result = serializeEnv({ V: "it's tricky" });
    expect(result).toContain(`V="it's tricky"`);
    // The POSIX `'\''` continuation breaks docker compose's .env parser.
    expect(result).not.toContain(`'\\''`);
  });

  it('keeps empty values as KEY= (no quotes)', () => {
    const result = serializeEnv({ EMPTY: '' });
    expect(result).toContain('EMPTY=\n');
  });

  it('quotes values starting with # to prevent comment interpretation', () => {
    const result = serializeEnv({ V: '#fff' });
    expect(result).toContain(`V="#fff"`);
  });

  it('leaves URLs unquoted (safe characters)', () => {
    const result = serializeEnv({
      URL: 'https://example.com/path?x=1&y=2',
    });
    // & is not in safe set, so it gets quoted; URLs with only safe chars stay bare
    expect(result).toContain(`URL="https://example.com/path?x=1&y=2"`);
  });

  it('never emits the POSIX single-quote continuation that breaks docker compose', () => {
    // Regression: blog title/description with an apostrophe (the bug that left an
    // instance on a stale Ghost URL). Output must be docker-compose-.env-safe.
    const result = serializeEnv({
      BLOG_TITLE: 'Пульс косметологии',
      BLOG_DESCRIPTION: "'Блог о том, чем на самом деле живёт косметология.",
    });
    expect(result).not.toContain(`'\\''`);
    expect(result).toContain(
      `BLOG_DESCRIPTION="'Блог о том, чем на самом деле живёт косметология."`,
    );
    // And it round-trips back through the reader.
    expect(parseEnv(result).BLOG_DESCRIPTION).toBe(
      "'Блог о том, чем на самом деле живёт косметология.",
    );
  });

  it('round-trip: serialize → parse returns identical data', () => {
    const original = { FOO: 'bar', GREETING: 'hello world', EMPTY: '' };
    const serialized = serializeEnv(original);
    const parsed = parseEnv(serialized);
    expect(parsed).toEqual(original);
  });

  it('round-trip preserves values with double quotes, $, backtick, backslash, and single quotes', () => {
    const original = {
      DESC: 'Blog with "quoted" word',
      DOLLARS: 'cost: $100',
      BACKTICK: 'eval `date`',
      SLASH: 'a\\b',
      APOST: "it's tricky",
      COMBO: `mix of " and ' and $`,
    };
    const parsed = parseEnv(serializeEnv(original));
    expect(parsed).toEqual(original);
  });

  it('produces output that bash -n accepts (no syntax errors)', () => {
    // Sanity round-trip with the kind of free-text value that broke the
    // previous serializer (BLOG_DESCRIPTION with an embedded double quote).
    const serialized = serializeEnv({
      BLOG_DESCRIPTION: 'Блог о "косметологии"',
    });
    const parsed = parseEnv(serialized);
    expect(parsed.BLOG_DESCRIPTION).toBe('Блог о "косметологии"');
  });
});

describe('readEnv / writeEnv', () => {
  it('reads .env file from disk', async () => {
    const envPath = path.join(tmpDir, '.env');
    await fs.writeFile(envPath, 'FOO=bar\nBAZ=qux\n', 'utf-8');

    const result = await readEnv(envPath);
    expect(result).toEqual({ FOO: 'bar', BAZ: 'qux' });
  });

  it('writes .env file to disk', async () => {
    const envPath = path.join(tmpDir, '.env');
    await writeEnv(envPath, { FOO: 'bar', BAZ: 'qux' });

    const content = await fs.readFile(envPath, 'utf-8');
    expect(content).toContain('FOO=bar');
    expect(content).toContain('BAZ=qux');
  });

  it('handles non-existent file gracefully', async () => {
    const envPath = path.join(tmpDir, 'nonexistent', '.env');
    const result = await readEnv(envPath);
    expect(result).toEqual({});
  });
});
