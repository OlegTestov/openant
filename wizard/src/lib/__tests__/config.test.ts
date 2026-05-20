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

  it('quotes values with spaces (POSIX single-quote)', () => {
    const result = serializeEnv({ FOO: 'hello world' });
    expect(result).toContain("FOO='hello world'");
  });

  it('quotes values containing double quotes (no escape needed inside single quotes)', () => {
    const result = serializeEnv({ DESC: 'a "quoted" word' });
    expect(result).toContain(`DESC='a "quoted" word'`);
  });

  it('quotes values containing $, backtick, backslash literally', () => {
    const result = serializeEnv({ V: 'has $var and `tick` and \\back' });
    expect(result).toContain(`V='has $var and \`tick\` and \\back'`);
  });

  it("escapes embedded single quotes via '\\'' continuation", () => {
    const result = serializeEnv({ V: "it's tricky" });
    expect(result).toContain(`V='it'\\''s tricky'`);
  });

  it('keeps empty values as KEY= (no quotes)', () => {
    const result = serializeEnv({ EMPTY: '' });
    expect(result).toContain('EMPTY=\n');
  });

  it('quotes values starting with # to prevent comment interpretation', () => {
    const result = serializeEnv({ V: '#fff' });
    expect(result).toContain(`V='#fff'`);
  });

  it('leaves URLs unquoted (safe characters)', () => {
    const result = serializeEnv({
      URL: 'https://example.com/path?x=1&y=2',
    });
    // & is not in safe set, so it gets quoted; URLs with only safe chars stay bare
    expect(result).toContain(`URL='https://example.com/path?x=1&y=2'`);
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
