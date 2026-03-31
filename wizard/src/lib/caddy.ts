import { promises as fs } from 'fs';

export interface ServiceDomains {
  ghost: string;
  nocodb: string;
  n8n: string;
  wizard: string;
}

export function getCaddyfilePath(): string {
  return process.env.CADDYFILE_PATH || '/app/Caddyfile';
}

export function generateCaddyfile(
  domains: ServiceDomains | null,
  _mode?: string,
  saas?: boolean,
  customDomains?: ServiceDomains | null,
): string {
  if (!domains) {
    return `{
    admin 0.0.0.0:2019
}

:80 {
    reverse_proxy ghost:2368
}
`;
  }

  const tls = saas
    ? '\n    tls /opt/openant/certs/fullchain.pem /opt/openant/certs/privkey.pem'
    : '';

  const blocks: string[] = [];

  // Global options: expose Admin API on all interfaces for hot reload from wizard
  blocks.push(`{
    admin 0.0.0.0:2019
}`);

  // SaaS domain blocks (wildcard cert when SaaS)
  blocks.push(`${domains.ghost} {${tls}
    handle /robots.txt {
        root * /opt/openant/seo
        file_server
    }
    handle /llms.txt {
        root * /opt/openant/seo
        file_server
    }
    handle /*.txt {
        root * /opt/openant/seo
        file_server
    }
    reverse_proxy ghost:2368
}`);

  blocks.push(`${domains.nocodb} {${tls}
    reverse_proxy nocodb:8080
}`);

  blocks.push(`${domains.n8n} {${tls}
    reverse_proxy n8n:5678
}`);

  blocks.push(`${domains.wizard} {${tls}
    reverse_proxy wizard:3000
}`);

  // Custom domain blocks — Let's Encrypt handles TLS
  if (customDomains) {
    blocks.push(`${customDomains.ghost} {
    handle /robots.txt {
        root * /opt/openant/seo
        file_server
    }
    handle /llms.txt {
        root * /opt/openant/seo
        file_server
    }
    handle /*.txt {
        root * /opt/openant/seo
        file_server
    }
    reverse_proxy ghost:2368
}`);

    blocks.push(`${customDomains.nocodb} {
    reverse_proxy nocodb:8080
}`);

    blocks.push(`${customDomains.n8n} {
    reverse_proxy n8n:5678
}`);

    blocks.push(`${customDomains.wizard} {
    reverse_proxy wizard:3000
}`);
  }

  return blocks.join('\n\n') + '\n';
}

export async function writeCaddyfile(content: string): Promise<void> {
  await fs.writeFile(getCaddyfilePath(), content, 'utf-8');
}

/**
 * Generate SEO files (robots.txt, llms.txt) for Caddy to serve on the Ghost domain.
 * Wizard writes to /app/data/seo → host ./data/wizard/seo → Caddy /opt/openant/seo.
 */
export async function writeSeoFiles(
  ghostDomain: string,
  blogTitle?: string,
  blogDescription?: string,
  indexNowKey?: string,
): Promise<void> {
  const dir = process.env.SEO_FILES_PATH || '/app/data/seo';
  await fs.mkdir(dir, { recursive: true });

  const robotsTxt = [
    'User-agent: *',
    'Allow: /',
    `Sitemap: ${ghostDomain}/sitemap.xml`,
    '',
    'User-agent: GPTBot',
    'Allow: /',
    '',
    'User-agent: ChatGPT-User',
    'Allow: /',
    '',
    'User-agent: Google-Extended',
    'Allow: /',
    '',
    'User-agent: PerplexityBot',
    'Allow: /',
    '',
    'User-agent: ClaudeBot',
    'Allow: /',
    '',
  ].join('\n');

  const title = blogTitle || 'Blog';
  const description = blogDescription || 'This is a blog publishing original articles.';

  const llmsTxt = [
    `# ${title}`,
    '',
    `${description} All content is accessible at the site root.`,
    '',
    '## Navigation',
    `- ${ghostDomain}/sitemap.xml - complete list of all pages`,
    `- ${ghostDomain}/rss/ - RSS feed of latest articles`,
    '',
  ].join('\n');

  await fs.writeFile(`${dir}/robots.txt`, robotsTxt, 'utf-8');
  await fs.writeFile(`${dir}/llms.txt`, llmsTxt, 'utf-8');

  if (indexNowKey) {
    await fs.writeFile(`${dir}/${indexNowKey}.txt`, indexNowKey, 'utf-8');
  }
}
