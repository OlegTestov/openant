import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateCaddyfile, writeCaddyfile, type ServiceDomains } from '../caddy';

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

const DEFAULT_DOMAINS: ServiceDomains = {
  ghost: 'example.com',
  nocodb: 'table.example.com',
  n8n: 'n8n.example.com',
  wizard: 'setup.example.com',
};

describe('generateCaddyfile', () => {
  it('generates IP-mode Caddyfile when domains is null', () => {
    const result = generateCaddyfile(null);

    expect(result).toContain(':80');
    expect(result).toContain('reverse_proxy ghost:2368');
    expect(result).toContain('admin 0.0.0.0:2019');
  });

  it('IP-mode contains only :80 block with ghost reverse_proxy', () => {
    const result = generateCaddyfile(null);

    expect(result).not.toContain('table.');
    expect(result).not.toContain('n8n.');
    expect(result).not.toContain('setup.');
    expect(result).not.toContain('nocodb');
    expect(result).not.toContain('n8n:');
    expect(result).not.toContain('wizard');
  });

  it('generates domain-mode Caddyfile when domains are provided', () => {
    const result = generateCaddyfile(DEFAULT_DOMAINS);

    expect(result).toContain('example.com');
    expect(result).not.toContain(':80 {');
  });

  it('domain-mode includes admin API global option', () => {
    const result = generateCaddyfile(DEFAULT_DOMAINS);

    expect(result).toContain('admin 0.0.0.0:2019');
  });

  it('domain-mode contains 4 server blocks', () => {
    const result = generateCaddyfile(DEFAULT_DOMAINS);

    expect(result).toContain('example.com {');
    expect(result).toContain('table.example.com {');
    expect(result).toContain('n8n.example.com {');
    expect(result).toContain('setup.example.com {');
  });

  it('domain-mode: ghost domain routes to ghost:2368', () => {
    const result = generateCaddyfile(DEFAULT_DOMAINS);
    const ghostBlock = result.split('\n\n')[1];

    expect(ghostBlock).toContain('example.com {');
    expect(ghostBlock).toContain('reverse_proxy ghost:2368');
  });

  it('domain-mode: nocodb domain routes to nocodb:8080', () => {
    const result = generateCaddyfile(DEFAULT_DOMAINS);

    expect(result).toContain('table.example.com {\n    reverse_proxy nocodb:8080');
  });

  it('domain-mode: n8n domain routes to n8n:5678', () => {
    const result = generateCaddyfile(DEFAULT_DOMAINS);

    expect(result).toContain('n8n.example.com {\n    reverse_proxy n8n:5678');
  });

  it('domain-mode: wizard domain routes to wizard:3000', () => {
    const result = generateCaddyfile(DEFAULT_DOMAINS);

    expect(result).toContain('setup.example.com {\n    reverse_proxy wizard:3000');
  });

  it('adds tls internal in SaaS mode', () => {
    const result = generateCaddyfile(DEFAULT_DOMAINS, undefined, true);

    expect(result).toContain('tls internal');
    // Every server block should have tls internal (skip global options block)
    const blocks = result.split('\n\n').slice(1);
    for (const block of blocks) {
      expect(block).toContain('tls internal');
    }
  });

  it('does not add tls internal outside SaaS mode', () => {
    const result = generateCaddyfile(DEFAULT_DOMAINS, undefined, false);

    expect(result).not.toContain('tls internal');
  });

  it('generates both SaaS and custom domain blocks when customDomains provided', () => {
    const customDomains: ServiceDomains = {
      ghost: 'blog.mysite.com',
      nocodb: 'table.mysite.com',
      n8n: 'auto.mysite.com',
      wizard: 'setup.mysite.com',
    };
    const result = generateCaddyfile(DEFAULT_DOMAINS, undefined, true, customDomains);

    // SaaS blocks present
    expect(result).toContain('example.com {');
    expect(result).toContain('table.example.com {');
    // Custom domain blocks present
    expect(result).toContain('blog.mysite.com {');
    expect(result).toContain('table.mysite.com {');
    expect(result).toContain('auto.mysite.com {');
    expect(result).toContain('setup.mysite.com {');
  });

  it('SaaS blocks have tls internal, custom domain blocks do not', () => {
    const customDomains: ServiceDomains = {
      ghost: 'blog.mysite.com',
      nocodb: 'table.mysite.com',
      n8n: 'auto.mysite.com',
      wizard: 'setup.mysite.com',
    };
    const result = generateCaddyfile(DEFAULT_DOMAINS, undefined, true, customDomains);
    const blocks = result.split('\n\n').slice(1); // skip global options

    // First 4 blocks = SaaS (tls internal), last 4 = custom (no tls internal)
    const saasBlocks = blocks.slice(0, 4);
    const customBlocks = blocks.slice(4);

    for (const block of saasBlocks) {
      expect(block).toContain('tls internal');
    }
    for (const block of customBlocks) {
      expect(block).not.toContain('tls internal');
    }
  });

  it('does not add custom domain blocks when customDomains is null', () => {
    const result = generateCaddyfile(DEFAULT_DOMAINS, undefined, true, null);
    const blocks = result.split('\n\n').slice(1);

    expect(blocks).toHaveLength(4);
  });

  it('supports custom prefixes (ghost on subdomain)', () => {
    const domains: ServiceDomains = {
      ghost: 'blog.example.com',
      nocodb: 'db.example.com',
      n8n: 'auto.example.com',
      wizard: 'setup.example.com',
    };
    const result = generateCaddyfile(domains);

    expect(result).toContain('blog.example.com {');
    expect(result).toContain('db.example.com {');
    expect(result).toContain('auto.example.com {');
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
