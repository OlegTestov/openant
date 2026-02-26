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

  it('quotes values with spaces', () => {
    const result = serializeEnv({ FOO: 'hello world' });
    expect(result).toContain('FOO="hello world"');
  });

  it('round-trip: serialize → parse returns identical data', () => {
    const original = { FOO: 'bar', GREETING: 'hello world', EMPTY: '' };
    const serialized = serializeEnv(original);
    const parsed = parseEnv(serialized);
    expect(parsed).toEqual(original);
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
