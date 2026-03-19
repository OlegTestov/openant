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

  // SaaS domain blocks (tls internal when SaaS — Cloudflare terminates TLS)
  blocks.push(`${domains.ghost} {${tls}
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
