import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateCaddyfile, writeCaddyfile, writeSeoFiles, type ServiceDomains } from '../caddy';

const { mockWriteFile, mockMkdir } = vi.hoisted(() => ({
  mockWriteFile: vi.fn(() => Promise.resolve()),
  mockMkdir: vi.fn(() => Promise.resolve()),
}));

vi.mock('fs', () => {
  const mock = {
    promises: {
      writeFile: mockWriteFile,
      mkdir: mockMkdir,
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

  it('adds tls with wildcard cert in SaaS mode', () => {
    const result = generateCaddyfile(DEFAULT_DOMAINS, undefined, true);

    expect(result).toContain('tls /opt/openant/certs/fullchain.pem /opt/openant/certs/privkey.pem');
    // Every server block should have tls cert path (skip global options block)
    const blocks = result.split('\n\n').slice(1);
    for (const block of blocks) {
      expect(block).toContain(
        'tls /opt/openant/certs/fullchain.pem /opt/openant/certs/privkey.pem',
      );
    }
  });

  it('does not add tls directive outside SaaS mode', () => {
    const result = generateCaddyfile(DEFAULT_DOMAINS, undefined, false);

    expect(result).not.toContain('tls ');
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

  it('SaaS blocks have tls cert path, custom domain blocks do not', () => {
    const customDomains: ServiceDomains = {
      ghost: 'blog.mysite.com',
      nocodb: 'table.mysite.com',
      n8n: 'auto.mysite.com',
      wizard: 'setup.mysite.com',
    };
    const result = generateCaddyfile(DEFAULT_DOMAINS, undefined, true, customDomains);
    const blocks = result.split('\n\n').slice(1); // skip global options

    // First 4 blocks = SaaS (wildcard cert), last 4 = custom (Let's Encrypt)
    const saasBlocks = blocks.slice(0, 4);
    const customBlocks = blocks.slice(4);

    for (const block of saasBlocks) {
      expect(block).toContain(
        'tls /opt/openant/certs/fullchain.pem /opt/openant/certs/privkey.pem',
      );
    }
    for (const block of customBlocks) {
      expect(block).not.toContain('tls ');
    }
  });

  it('does not add custom domain blocks when customDomains is null', () => {
    const result = generateCaddyfile(DEFAULT_DOMAINS, undefined, true, null);
    const blocks = result.split('\n\n').slice(1);

    expect(blocks).toHaveLength(4);
  });

  it('301-redirects SaaS blog to custom blog when customDomains provided (avoids duplicate content)', () => {
    const customDomains: ServiceDomains = {
      ghost: 'blog.mysite.com',
      nocodb: 'table.mysite.com',
      n8n: 'auto.mysite.com',
      wizard: 'setup.mysite.com',
    };
    const result = generateCaddyfile(DEFAULT_DOMAINS, undefined, true, customDomains);

    // SaaS blog block redirects to custom blog (preserves path via {uri})
    expect(result).toContain('redir https://blog.mysite.com{uri} permanent');
    // SaaS blog no longer proxies directly to ghost
    const saasBlogBlockMatch = result.match(/example\.com \{[^}]+\}/);
    expect(saasBlogBlockMatch).not.toBeNull();
    expect(saasBlogBlockMatch![0]).not.toContain('reverse_proxy ghost:2368');
    // Custom blog still proxies to ghost
    expect(result).toContain('blog.mysite.com {');
    const customBlogBlock = result.substring(result.indexOf('blog.mysite.com {'));
    expect(customBlogBlock).toContain('reverse_proxy ghost:2368');
  });

  it('SaaS blog proxies to ghost when no customDomains (no redirect)', () => {
    const result = generateCaddyfile(DEFAULT_DOMAINS, undefined, true, null);
    expect(result).not.toContain('redir');
    expect(result).toContain('reverse_proxy ghost:2368');
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

describe('generateCaddyfile SEO handlers', () => {
  it('SaaS Ghost block includes robots.txt and llms.txt handlers', () => {
    const result = generateCaddyfile(DEFAULT_DOMAINS, undefined, true);
    const ghostBlock = result.split('\n\n')[1];

    expect(ghostBlock).toContain('handle /robots.txt');
    expect(ghostBlock).toContain('handle /llms.txt');
    expect(ghostBlock).toContain('root * /opt/openant/seo');
    expect(ghostBlock).toContain('file_server');
  });

  it('custom domain Ghost block includes robots.txt and llms.txt handlers', () => {
    const customDomains: ServiceDomains = {
      ghost: 'blog.mysite.com',
      nocodb: 'table.mysite.com',
      n8n: 'auto.mysite.com',
      wizard: 'setup.mysite.com',
    };
    const result = generateCaddyfile(DEFAULT_DOMAINS, undefined, true, customDomains);
    const blocks = result.split('\n\n');
    // Custom Ghost block is the 5th block (index 5: global, saas ghost, nocodb, n8n, wizard, custom ghost)
    const customGhostBlock = blocks[5];

    expect(customGhostBlock).toContain('blog.mysite.com {');
    expect(customGhostBlock).toContain('handle /robots.txt');
    expect(customGhostBlock).toContain('handle /llms.txt');
    expect(customGhostBlock).toContain('root * /opt/openant/seo');
  });

  it('non-Ghost blocks do not include SEO handlers', () => {
    const result = generateCaddyfile(DEFAULT_DOMAINS);
    const blocks = result.split('\n\n').slice(2); // skip global + ghost

    for (const block of blocks) {
      expect(block).not.toContain('handle /robots.txt');
      expect(block).not.toContain('handle /llms.txt');
    }
  });
});

describe('writeSeoFiles', () => {
  it('creates directory and writes robots.txt and llms.txt', async () => {
    vi.stubEnv('SEO_FILES_PATH', '/tmp/seo-test');
    mockWriteFile.mockClear();

    await writeSeoFiles('https://blog.example.com');

    expect(mockMkdir).toHaveBeenCalledWith('/tmp/seo-test', { recursive: true });
    expect(mockWriteFile).toHaveBeenCalledTimes(2);
    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/seo-test/robots.txt',
      expect.stringContaining('Sitemap: https://blog.example.com/sitemap.xml'),
      'utf-8',
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/seo-test/llms.txt',
      expect.stringContaining('https://blog.example.com/sitemap.xml'),
      'utf-8',
    );
  });

  it('robots.txt includes AI crawler rules', async () => {
    vi.stubEnv('SEO_FILES_PATH', '/tmp/seo-test');

    await writeSeoFiles('https://example.com');

    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/seo-test/robots.txt',
      expect.stringContaining('User-agent: GPTBot'),
      'utf-8',
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/seo-test/robots.txt',
      expect.stringContaining('User-agent: ClaudeBot'),
      'utf-8',
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/seo-test/robots.txt',
      expect.stringContaining('User-agent: PerplexityBot'),
      'utf-8',
    );
  });

  it('llms.txt uses blogTitle and blogDescription when provided', async () => {
    vi.stubEnv('SEO_FILES_PATH', '/tmp/seo-test');

    await writeSeoFiles('https://example.com', 'My Awesome Blog', 'Articles about tech.');

    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/seo-test/llms.txt',
      expect.stringContaining('# My Awesome Blog'),
      'utf-8',
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/seo-test/llms.txt',
      expect.stringContaining('Articles about tech. All content is accessible'),
      'utf-8',
    );
  });

  it('llms.txt uses defaults when blogTitle/blogDescription omitted', async () => {
    vi.stubEnv('SEO_FILES_PATH', '/tmp/seo-test');

    await writeSeoFiles('https://example.com');

    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/seo-test/llms.txt',
      expect.stringContaining('# Blog'),
      'utf-8',
    );
    expect(mockWriteFile).toHaveBeenCalledWith(
      '/tmp/seo-test/llms.txt',
      expect.stringContaining('This is a blog publishing original articles.'),
      'utf-8',
    );
  });

  it('uses default path when SEO_FILES_PATH not set', async () => {
    await writeSeoFiles('https://example.com');

    expect(mockMkdir).toHaveBeenCalledWith('/app/data/seo', { recursive: true });
  });

  it('writes IndexNow key file when indexNowKey is provided', async () => {
    vi.stubEnv('SEO_FILES_PATH', '/tmp/seo-test');
    mockWriteFile.mockClear();

    await writeSeoFiles('https://example.com', 'Blog', 'Desc', 'abc123key');

    expect(mockWriteFile).toHaveBeenCalledTimes(3);
    expect(mockWriteFile).toHaveBeenCalledWith('/tmp/seo-test/abc123key.txt', 'abc123key', 'utf-8');
  });

  it('does not write key file when indexNowKey is undefined', async () => {
    vi.stubEnv('SEO_FILES_PATH', '/tmp/seo-test');
    mockWriteFile.mockClear();

    await writeSeoFiles('https://example.com', 'Blog', 'Desc');

    expect(mockWriteFile).toHaveBeenCalledTimes(2);
  });
});

describe('generateCaddyfile IndexNow handler', () => {
  it('Ghost block includes /*.txt handler for IndexNow key file', () => {
    const result = generateCaddyfile(DEFAULT_DOMAINS);
    const ghostBlock = result.split('\n\n')[1];

    expect(ghostBlock).toContain('handle /*.txt');
  });

  it('custom domain Ghost block includes /*.txt handler', () => {
    const customDomains: ServiceDomains = {
      ghost: 'blog.mysite.com',
      nocodb: 'table.mysite.com',
      n8n: 'auto.mysite.com',
      wizard: 'setup.mysite.com',
    };
    const result = generateCaddyfile(DEFAULT_DOMAINS, undefined, true, customDomains);
    const blocks = result.split('\n\n');
    const customGhostBlock = blocks[5];

    expect(customGhostBlock).toContain('blog.mysite.com {');
    expect(customGhostBlock).toContain('handle /*.txt');
  });

  it('non-Ghost blocks do not include /*.txt handler', () => {
    const result = generateCaddyfile(DEFAULT_DOMAINS);
    const blocks = result.split('\n\n').slice(2); // skip global + ghost

    for (const block of blocks) {
      expect(block).not.toContain('handle /*.txt');
    }
  });
});
