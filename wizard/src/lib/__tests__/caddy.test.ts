import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateCaddyfile, writeCaddyfile } from '../caddy';

const { mockWriteFile } = vi.hoisted(() => ({
  mockWriteFile: vi.fn(() => Promise.resolve()),
}));

vi.mock('fs', () => {
  const mock = {
    promises: {
      writeFile: mockWriteFile,
    },
  };
  return { ...mock, default: mock };
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('generateCaddyfile', () => {
  it('generates IP-mode Caddyfile when domain is null', () => {
    const result = generateCaddyfile(null);

    expect(result).toContain(':80');
    expect(result).toContain('reverse_proxy ghost:2368');
  });

  it('IP-mode contains only :80 block with ghost reverse_proxy', () => {
    const result = generateCaddyfile(null);

    expect(result).not.toContain('table.');
    expect(result).not.toContain('auto.');
    expect(result).not.toContain('setup.');
    expect(result).not.toContain('nocodb');
    expect(result).not.toContain('n8n');
    expect(result).not.toContain('wizard');
  });

  it('generates domain-mode Caddyfile when domain is provided', () => {
    const result = generateCaddyfile('example.com');

    expect(result).toContain('example.com');
    expect(result).not.toContain(':80 {');
  });

  it('domain-mode contains 4 server blocks', () => {
    const result = generateCaddyfile('example.com');

    expect(result).toContain('example.com {');
    expect(result).toContain('table.example.com {');
    expect(result).toContain('auto.example.com {');
    expect(result).toContain('setup.example.com {');
  });

  it('domain-mode: main domain routes to ghost:2368', () => {
    const result = generateCaddyfile('example.com');
    const mainBlock = result.split('\n\n')[0];

    expect(mainBlock).toContain('example.com {');
    expect(mainBlock).toContain('reverse_proxy ghost:2368');
  });

  it('domain-mode: table subdomain routes to nocodb:8080', () => {
    const result = generateCaddyfile('example.com');

    expect(result).toContain('table.example.com {\n    reverse_proxy nocodb:8080');
  });

  it('domain-mode: auto subdomain routes to n8n:5678', () => {
    const result = generateCaddyfile('example.com');

    expect(result).toContain('auto.example.com {\n    reverse_proxy n8n:5678');
  });

  it('domain-mode: setup subdomain routes to wizard:3000', () => {
    const result = generateCaddyfile('example.com');

    expect(result).toContain('setup.example.com {\n    reverse_proxy wizard:3000');
  });
});

describe('writeCaddyfile', () => {
  it('writes content to file at CADDYFILE_PATH', async () => {
    vi.stubEnv('CADDYFILE_PATH', '/tmp/test-caddyfile');

    await writeCaddyfile('test content');

    expect(mockWriteFile).toHaveBeenCalledWith('/tmp/test-caddyfile', 'test content', 'utf-8');
  });

  it('uses default path when CADDYFILE_PATH is not set', async () => {
    await writeCaddyfile('test content');

    expect(mockWriteFile).toHaveBeenCalledWith('/app/Caddyfile', 'test content', 'utf-8');
  });
});
