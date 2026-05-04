import { describe, it, expect } from 'vitest';
import { normalizeDomain } from '../normalize-domain';

describe('normalizeDomain', () => {
  it.each([
    ['example.com', 'example.com'],
    ['sub.example.com', 'sub.example.com'],
    ['https://example.com', 'example.com'],
    ['http://example.com', 'example.com'],
    ['HTTPS://Example.COM', 'example.com'],
    ['  https://example.com  ', 'example.com'],
    ['https://example.com/', 'example.com'],
    ['example.com/', 'example.com'],
    ['example.com.', 'example.com'],
    ['https://dnevnik-molodosti.ru', 'dnevnik-molodosti.ru'],
    ['EXAMPLE.com', 'example.com'],
  ])('normalizes %j to %j', (input, expected) => {
    const result = normalizeDomain(input);
    expect(result).toEqual({ ok: true, value: expected });
  });

  it.each([
    ['', 'empty'],
    ['   ', 'empty'],
    ['https://', 'empty'],
    ['http:// ', 'empty'],
    ['example.com/blog', 'has_path'],
    ['https://example.com/path', 'has_path'],
    ['example.com:8080', 'has_port'],
    ['https://example.com:8080', 'has_port'],
    ['has space.com', 'invalid_chars'],
    ['localhost', 'invalid_format'],
    ['no-tld', 'invalid_format'],
    ['-leading.com', 'invalid_format'],
    ['trailing-.com', 'invalid_format'],
    ['.example.com', 'invalid_format'],
    ['example..com', 'invalid_format'],
    ['exam_ple.com', 'invalid_format'],
  ])('rejects %j with error %j', (input, error) => {
    const result = normalizeDomain(input);
    expect(result).toEqual({ ok: false, error });
  });
});
